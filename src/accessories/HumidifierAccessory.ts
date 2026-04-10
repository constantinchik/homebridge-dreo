/* eslint-disable */
import { PlatformAccessory, Service } from 'homebridge';
import { DreoPlatform } from '../platform';
import { BaseAccessory } from './BaseAccessory';

interface DreoStateReport {
  poweron?: boolean;      // Active
  mode?: number;          // Mode 0-2 [manual, auto, sleep]
  suspend?: boolean;      // Suspended
  rh?: number;            // Current humidity
  hotfogon?: boolean;     // Hot fog on (not available on all models)
  foglevel?: number;      // Fog level 0-6 [0: off, 1-6: levels]
  rhautolevel?: number;   // Target humidity level in auto mode
  rhsleeplevel?: number;  // Target humidity level in sleep mode
  ledlevel?: number;      // LED indicator level 0-2 [off, low, high]
  rgblevel?: string | number;  // RGB display level 0-2 [off, low, high]
  rgbcolor?: number;      // RGB color as packed 24-bit integer (0xRRGGBB)
  muteon?: boolean;       // Beep on/off
  wrong?: number;         // Error code 0-1 [0: no error, 1: no water]
  worktime?: number;      // Work time in minutes after last cleaning
  filtertime?: number;    // Filter life percentage remaining
  mcuon?: boolean;        // MCU status
  connected?: boolean;    // Connection status
}

interface DreoMessage {
  devicesn?: string;      // Device serial number
  method?: string;        // API method (e.g., control-report, control-reply, report)
  reported?: DreoStateReport; // Reported state of the device
}

interface DreoState {
  poweron: {state: boolean};
  mode: {state: number};
  suspend: {state: boolean};
  rh: {state: number};
  hotfogon?: {state: boolean};  // Optional - not available on all models
  ledlevel: {state: number};
  rgblevel: {state: string | number};  // Can be string or number depending on model
  rgbcolor?: {state: number};  // RGB color as packed 24-bit integer
  foglevel: {state: number};
  rhautolevel: {state: number};
  rhsleeplevel: {state: number};
  wrong: {state: number};
}

// Use integer values for HomeKit humidity thresholds
const MAX_HUMIDITY = 90; // Maximum humidity level for HomeKit.
const MIN_HUMIDITY = 30; // Minimum humidity level for HomeKit.
const DEFAULT_HUMIDITY = 45; // Default humidity level for HomeKit if not specified.

export class HumidifierAccessory extends BaseAccessory {
  private readonly humidifierService: Service;
  private readonly humidityService: Service;
  private readonly sleepSwitchService: Service;
  private readonly hotFogSwitchService?: Service;  // Optional - not all models support hot fog
  private readonly rgbLightService: Service;

  // Cached copy of latest device states
  private on: boolean;        // poweron
  private dreoMode: number;   // mode 0-2       [manual, auto, sleep]
  private suspended: boolean; // suspend
  private currentHum: number; // rh
  private fogHot: boolean;    // hotfogon
  private ledLevel: number;   // ledlevel 0-2   [off, low, high]
  private rgbLevel: string;   // rgblevel 0-2   [off, low, high]
  private rgbColor: number;   // rgbcolor - packed 24-bit RGB (0xRRGGBB)
  private rgbHue: number = 0;
  private rgbSaturation: number = 100;
  private rgbColorDebounce: ReturnType<typeof setTimeout> | null = null;
  private wrong: number;      // wrong 0-1      [0: no error, 1: no water]

  private manualFogLevel: number;         // foglevel 0-6   [1-, 1, 2-, 2, 3-, 3]
  private targetHumAutoLevel: number;     // rhautolevel
  private targetHumSleepLevel: number;    // rhsleeplevel

  // HomeKit
  private currState: number;  // State in HomeKit {0: inactive, 1: idle, 2: humidifying, 3: dehumidifying}

  constructor(
    readonly platform: DreoPlatform,
    readonly accessory: PlatformAccessory,
    private readonly state: DreoState,
  ) {
    // Call base class constructor
    super(platform, accessory);

    // Update current state in homebridge from Dreo API
    this.on = state.poweron?.state ?? false;
    this.dreoMode = state.mode?.state ?? 0;
    this.suspended = state.suspend?.state ?? false;
    this.currentHum = state.rh?.state ?? 0;
    this.fogHot = state.hotfogon?.state ?? false;
    this.ledLevel = state.ledlevel?.state ?? 0;
    this.rgbLevel = String(state.rgblevel?.state ?? '0');  // Convert to string for consistency
    this.rgbColor = state.rgbcolor?.state ?? 0xFF0000;
    [this.rgbHue, this.rgbSaturation] = HumidifierAccessory.rgbToHS(this.rgbColor);
    this.wrong = state.wrong?.state ?? 0;
    this.manualFogLevel = state.foglevel?.state ?? 0;
    // Ensure humidity levels are within HomeKit valid range
    this.targetHumAutoLevel = this.clampHumidityForDevice(state.rhautolevel?.state);
    this.targetHumSleepLevel = this.clampHumidityForDevice(state.rhsleeplevel?.state);

    this.currState = this.on ? (this.suspended ? 1 : 2) : 0;

    const deviceName = accessory.context.device.deviceName || 'Humidifier';
    // Get the HumidifierDehumidifier service if it exists, otherwise create a new HumidifierDehumidifier service
    this.humidifierService = this.accessory.getService(this.platform.Service.HumidifierDehumidifier) ||
      this.accessory.addService(this.platform.Service.HumidifierDehumidifier, deviceName);
    // Get the HumiditySensor service if it exists, otherwise create a new HumiditySensor service
    this.humidityService = this.accessory.getService(this.platform.Service.HumiditySensor) ||
      this.accessory.addService(this.platform.Service.HumiditySensor, 'Humidity Sensor');
    // Get the Switch service if it exists, otherwise create a new Switch service
    this.sleepSwitchService = this.accessory.getServiceById(this.platform.Service.Switch, 'SleepMode') ||
      this.accessory.addService(this.platform.Service.Switch, 'Sleep Mode', 'SleepMode');
    this.sleepSwitchService.setCharacteristic(this.platform.Characteristic.ConfiguredName, 'Sleep Mode');

    // Only create Hot Fog switch if the device supports it (some models like HM311S don't have this feature)
    if (state.hotfogon !== undefined) {
      this.hotFogSwitchService = this.accessory.getServiceById(this.platform.Service.Switch, 'HotFog') ||
        this.accessory.addService(this.platform.Service.Switch, 'Warm Mist', 'HotFog');
      this.hotFogSwitchService.setCharacteristic(this.platform.Characteristic.ConfiguredName, 'Warm Mist');
    }

    // Remove cached color preset switches from previous version
    for (const name of ['Red', 'Orange', 'Yellow', 'Green', 'Cyan', 'Blue', 'Purple', 'Pink']) {
      const old = this.accessory.getServiceById(this.platform.Service.Switch, `RGBColor_${name}`);
      if (old) {
        this.accessory.removeService(old);
      }
    }

    // RGB Night Light — Lightbulb with Hue + Saturation, no Brightness/ColorTemperature
    this.rgbLightService = this.accessory.getService(this.platform.Service.Lightbulb) ||
      this.accessory.addService(this.platform.Service.Lightbulb, 'Night Light');
    this.rgbLightService.setCharacteristic(this.platform.Characteristic.ConfiguredName, 'Night Light');
    // Remove cached Brightness/ColorTemperature if present from earlier versions
    const brightnessChar = this.rgbLightService.getCharacteristic(this.platform.Characteristic.Brightness);
    if (brightnessChar) {
      this.rgbLightService.removeCharacteristic(brightnessChar);
    }
    const ctChar = this.rgbLightService.getCharacteristic(this.platform.Characteristic.ColorTemperature);
    if (ctChar) {
      this.rgbLightService.removeCharacteristic(ctChar);
    }
    this.rgbLightService.getCharacteristic(this.platform.Characteristic.On)
      .onGet(this.getRGBLightOn.bind(this))
      .onSet(this.setRGBLightOn.bind(this));
    this.rgbLightService.getCharacteristic(this.platform.Characteristic.Hue)
      .onGet(this.getRGBHue.bind(this))
      .onSet(this.setRGBHue.bind(this));
    this.rgbLightService.getCharacteristic(this.platform.Characteristic.Saturation)
      .onGet(this.getRGBSaturation.bind(this))
      .onSet(this.setRGBSaturation.bind(this));

    // ON / OFF
    // Register handlers for the Humidifier Active characteristic
    this.humidifierService.getCharacteristic(this.platform.Characteristic.Active)
    .onGet(this.getActive.bind(this))
    .onSet(this.setActive.bind(this));
    this.sleepSwitchService.getCharacteristic(this.platform.Characteristic.On)
    .onGet(this.getSleepMode.bind(this))
    .onSet(this.setSleepMode.bind(this));

    // Only register Hot Fog handlers if the service exists (device supports it)
    if (this.hotFogSwitchService) {
      this.hotFogSwitchService.getCharacteristic(this.platform.Characteristic.On)
      .onGet(this.getHotFog.bind(this))
      .onSet(this.setHotFog.bind(this));
    }

    // Register handlers for Current Humidifier State characteristic
    // Disabling dehumidifying as it is not supported
    /**
     * 0: Inactive      (Dero Off)
     * 1: Idle          (Dero On & Dero Suspended)
     * 2: Humidifying   (Dero On & Dero Not Suspended)
     * 3: Dehumidifying (Not supported - DISABLE IT)
     */
    this.humidifierService.getCharacteristic(this.platform.Characteristic.CurrentHumidifierDehumidifierState)
    .setProps({
      minValue: 0,
      maxValue: 2,
      validValues: [0, 1, 2],
    })
    .onGet(this.getCurrentHumidifierState.bind(this));

    // Register handlers for Current Humidifier Water Level characteristic
    this.humidifierService.getCharacteristic(this.platform.Characteristic.WaterLevel)
    .onGet(this.getCurrentHumidifierWaterLevel.bind(this));

    // Register handlers for Target Humidifier Mode characteristic
    // HM311S is humidifier-only, so only expose humidifier mode (1) to avoid "Humidifier-Dehumidifier" display
    this.humidifierService.getCharacteristic(this.platform.Characteristic.TargetHumidifierDehumidifierState)
    .setProps({
      minValue: 1,
      maxValue: 1,
      validValues: [1], // Only humidifier mode - this makes HomeKit show just "Humidifier"
    })
    .onGet(this.getTargetHumidifierMode.bind(this))
    .onSet(this.setTargetHumidifierMode.bind(this));

    // Set RelativeHumidityHumidifierThreshold
    // HomeKit range matches device capabilities (30-90%) for clearer user interface
    const humidityCharacteristic = this.humidifierService.getCharacteristic(this.platform.Characteristic.RelativeHumidityHumidifierThreshold);
    humidityCharacteristic
    .setProps({
      minValue: 30,
      maxValue: 90,
      minStep: 1,
    })
    .onGet(this.getTargetHumidity.bind(this))
    .onSet(this.setTargetHumidity.bind(this));

    // Force an immediate update to ensure HomeKit uses the new properties for both characteristics
    setTimeout(() => {
      const currentTargetHumidity = this.getTargetHumidity();
      const currentHumidity = this.getCurrentHumidity();
      this.platform.log.debug('Forcing humidity characteristic updates - target: %s, current: %s', currentTargetHumidity, currentHumidity);

      // Update both target (slider) and current (tile subtext) humidity characteristics
      this.humidifierService.updateCharacteristic(this.platform.Characteristic.RelativeHumidityHumidifierThreshold, currentTargetHumidity);
      this.humidifierService.updateCharacteristic(this.platform.Characteristic.CurrentRelativeHumidity, currentHumidity);
      this.humidityService.updateCharacteristic(this.platform.Characteristic.CurrentRelativeHumidity, currentHumidity);
    }, 1000);

    // Register handlers for Current Humidity characteristic
    this.humidifierService.getCharacteristic(this.platform.Characteristic.CurrentRelativeHumidity)
    .onGet(this.getCurrentHumidity.bind(this));
    this.humidityService.getCharacteristic(this.platform.Characteristic.CurrentRelativeHumidity)
    .onGet(this.getCurrentHumidity.bind(this));

    // Register handlers for manual fog level characteristic
    this.humidifierService.getCharacteristic(this.platform.Characteristic.RotationSpeed)
    .setProps({
      minValue: 0,
      maxValue: 6,
      validValues: [0, 1, 2, 3, 4, 5, 6], // [0: off, 1-6: fog levels]
    })
    .onGet(this.getTargetFogLevel.bind(this))
    .onSet(this.setTargetFogLevel.bind(this));

    // Update values from Dreo App
    platform.webHelper.addEventListener('message', (message: MessageEvent) => {
      let data: DreoMessage;
      try {
        data = JSON.parse(message.data);
        if (data.devicesn === accessory.context.device.sn) {
          if (data.method && ['control-report', 'control-reply', 'report'].includes(data.method) && data.reported) {
            this.platform.log.info('Humidifier WS reported: %s', JSON.stringify(data.reported));
            Object.keys(data.reported).forEach(key => this.processReportedKey(key, data.reported!));
          }
        }
      } catch (error) {
        this.platform.log.error('Failed to parse incoming message: %s', error);
      }
    });
  }

  // Helper function to clamp humidity values to device capabilities when setting values
  private clampHumidityForDevice(value: any): number {
    const MIN_HUMIDITY = 30;
    const MAX_HUMIDITY = 90;
    const DEFAULT_HUMIDITY = 45;

    // Handle null and undefined explicitly
    if (value === null || value === undefined) {
      return DEFAULT_HUMIDITY;
    }

    const numValue = Number(value);
    if (isNaN(numValue)) {
      return DEFAULT_HUMIDITY;
    }

    // Ensure integer value within device's valid range (30-90%)
    const intValue = Math.round(numValue);
    return Math.max(MIN_HUMIDITY, Math.min(MAX_HUMIDITY, intValue));
  }

  // Helper function to validate humidity values for HomeKit display (allows actual device values)
  private validateHumidityForHomeKit(value: any): number {
    const DEFAULT_HUMIDITY = 45;

    // Handle null and undefined explicitly
    if (value === null || value === undefined) {
      return DEFAULT_HUMIDITY;
    }

    const numValue = Number(value);
    if (isNaN(numValue)) {
      return DEFAULT_HUMIDITY;
    }

    // Just ensure it's an integer - let HomeKit display the actual device value
    return Math.round(numValue);
  }

  getActive(): boolean {
    return this.on;
  }

  setActive(value: unknown): void {
    this.platform.log.debug('Triggered SET Active: %s', value);
    const isActive = Boolean(value);
    // Check state to prevent duplicate requests
    if (this.on !== isActive) {
      // Send to Dreo server via websocket
      this.platform.webHelper.control(this.sn, {'poweron': isActive});
    }
    // Update HomeKit state
    this.on = isActive;
    this.updateCurrentHumidifierState();
  }

  getSleepMode(): boolean {
    return this.on && this.dreoMode === 2;
  }

  setSleepMode(value: unknown): void {
    this.platform.log.debug('Triggered SET SleepMode: %s', value);
    const isSleepMode = Boolean(value);
    let command: {};
    if (isSleepMode) {
      this.dreoMode = 2;
      if (this.on) {
        command = {'mode': this.dreoMode};
      } else {
        this.on = true;
        command = {'poweron': true, 'mode': this.dreoMode}; // Power on the humidifier
        this.humidifierService.updateCharacteristic(this.platform.Characteristic.Active, true);
      }
      setTimeout(() => {
        this.humidifierService.updateCharacteristic(this.platform.Characteristic.TargetHumidifierDehumidifierState, 1);
      }, 750);
    } else { // Run this only if the humidifier is on
      this.dreoMode = 0;
      command = {'mode': this.dreoMode};
      if (this.on) {
        setTimeout(() => {
          this.humidifierService.updateCharacteristic(this.platform.Characteristic.TargetHumidifierDehumidifierState, 0);
        }, 750);
      }
    }
    this.platform.webHelper.control(this.sn, command);
  }

  getHotFog(): boolean {
    return this.on && this.fogHot;
  }

  setHotFog(value: unknown): void {
    // Only proceed if this device supports hot fog
    if (!this.hotFogSwitchService) {
      this.platform.log.warn('Hot fog feature not supported on this model');
      return;
    }

    this.platform.log.debug('Triggered SET HotFog: %s', value);
    this.fogHot = Boolean(value);
    let command: {};
    if (this.on) {
      command = {'hotfogon': this.fogHot};
    } else {
      command = {'poweron': true, 'hotfogon': this.fogHot};
      this.humidifierService.updateCharacteristic(this.platform.Characteristic.Active, true);
    }
    this.platform.webHelper.control(this.sn, command);
  }

  getCurrentHumidifierState() {
    return this.currState;
  }

  // Note: Dreo API does not provide a direct water level, using current humidity as a placeholder
  // This could be replaced with actual logic if Dreo provides a water level state
  getCurrentHumidifierWaterLevel() {
    return this.wrong === 1 ? 0 : 100;
  }

  setTargetHumidifierMode(value: unknown): void {
    this.platform.log.debug('Triggered SET TargetHumidifierState: %s', value);
    // Since we only expose humidifier mode (1), this should always be 1
    // But we still respect the user's device mode for internal operations
    if (Number(value) === 1) {
      // User is setting humidifier mode - we'll keep current dreoMode
      // This allows the device's internal modes (manual/auto/sleep) to work
      // while presenting a simple "humidifier" interface to HomeKit
      this.platform.log.debug('Humidifier mode confirmed (internal dreoMode: %s)', this.dreoMode);
    }
  }

  getTargetHumidifierMode(): number {
    // Always return 1 (humidifier) since HM311S is humidifier-only
    // This ensures HomeKit displays "Humidifier" instead of "Humidifier-Dehumidifier"
    return 1;
  }

  getCurrentHumidity(): number {
    // Ensure current humidity is a proper integer for HomeKit display
    const validated = this.validateHumidityForHomeKit(this.currentHum);
    this.platform.log.debug('getCurrentHumidity() - raw: %s, validated: %s', this.currentHum, validated);
    return validated;
  }

  setTargetHumidity(value: unknown): void {
    // Clamp value to device capabilities (30-90%) when setting
    const targetValue = this.clampHumidityForDevice(Number(value));
    if (this.dreoMode === 0) { // manual
      this.platform.log.warn('ERROR: Triggered SET TargetHumidity (Manual): %s', targetValue);
    } else if (this.dreoMode === 1) { // auto
      this.targetHumAutoLevel = targetValue;
      this.platform.log.debug('Triggered SET TargetHumidity (Auto): %s', targetValue);
      this.platform.webHelper.control(this.sn, {'rhautolevel': this.targetHumAutoLevel});
    } else if (this.dreoMode === 2) { // sleep
      this.targetHumSleepLevel = targetValue;
      this.platform.log.debug('Triggered SET TargetHumidity (Sleep): %s', targetValue);
      this.platform.webHelper.control(this.sn, {'rhsleeplevel': this.targetHumSleepLevel});
    }
  }

  getTargetHumidity(): number {
    let threshold: number;
    switch (this.dreoMode) {
      case 1: // auto
        threshold = this.targetHumAutoLevel;
        this.platform.log.debug('Triggered GET TargetHumidity (Auto): %s', threshold);
        break;
      case 2: // sleep
        threshold = this.targetHumSleepLevel;
        this.platform.log.debug('Triggered GET TargetHumidity (Sleep): %s', threshold);
        break;
      default: // manual do not have a target humidity, it has fog level
        // return the threshold for Auto mode as a sensible default when manual is active
        threshold = this.targetHumAutoLevel;
        this.platform.log.debug('Triggered GET TargetHumidity (Manual - Returning Auto Level): %s', threshold);
        break;
    }
    // Return the actual device value for HomeKit to display correctly
    const validatedValue = this.validateHumidityForHomeKit(threshold);
    this.platform.log.debug('GET TargetHumidity returning: %s (from device value: %s)', validatedValue, threshold);
    return validatedValue;
  }

  // Can only be set in manual mode
  setTargetFogLevel(value: unknown): void {
    this.platform.log.debug('Triggered SET TargetFogLevel: %s', value);
    this.manualFogLevel = Number(value);
    if (this.manualFogLevel === 0) { // If manual fog level is 0, turn off the humidifier
      this.on = false; // Turn off humidifier
      this.humidifierService.updateCharacteristic(this.platform.Characteristic.Active, false);
      this.platform.webHelper.control(this.sn, {'poweron': this.on});
      return;
    }
    if (this.dreoMode === 0) { // manual
      this.platform.webHelper.control(this.sn, {'foglevel': this.manualFogLevel});
    } else {
      this.platform.log.warn('WARN: Switching to manual mode to set fog level. Current mode: %s', this.dreoMode);
      this.dreoMode = 0; // Set mode to manual
      this.platform.webHelper.control(this.sn, {'mode': this.dreoMode, 'foglevel': this.manualFogLevel});
    }
  }

  getTargetFogLevel(): number {
    return this.on ? this.manualFogLevel : 0;
  }

  // RGB Light control
  getRGBLightOn(): boolean {
    return parseInt(this.rgbLevel) > 0;
  }

  setRGBLightOn(value: unknown): void {
    this.platform.log.debug('Triggered SET RGB Light On: %s', value);
    const on = Boolean(value);
    if (on) {
      this.rgbLevel = '1';
      // Send both rgblevel and current color to ensure light turns on with correct color
      this.platform.webHelper.control(this.sn, { 'rgblevel': 1, 'rgbcolor': this.rgbColor });
    } else {
      this.rgbLevel = '0';
      this.platform.webHelper.control(this.sn, { 'rgblevel': 0 });
    }
  }

  getRGBHue(): number {
    return this.rgbHue;
  }

  setRGBHue(value: unknown): void {
    this.platform.log.debug('Triggered SET RGB Hue: %s', value);
    this.rgbHue = Number(value);
    this.debounceSendRGBColor();
  }

  getRGBSaturation(): number {
    return this.rgbSaturation;
  }

  setRGBSaturation(value: unknown): void {
    this.platform.log.debug('Triggered SET RGB Saturation: %s', value);
    this.rgbSaturation = Number(value);
    this.debounceSendRGBColor();
  }

  // Debounce color sends since HomeKit fires Hue and Saturation separately
  private debounceSendRGBColor(): void {
    if (this.rgbColorDebounce) {
      clearTimeout(this.rgbColorDebounce);
    }
    this.rgbColorDebounce = setTimeout(() => {
      this.rgbColor = HumidifierAccessory.hsToRgb(this.rgbHue, this.rgbSaturation);
      this.platform.log.debug('Sending rgbcolor: 0x%s', this.rgbColor.toString(16).padStart(6, '0'));
      // Turn on and set color in one command
      if (parseInt(this.rgbLevel) === 0) {
        this.rgbLevel = '1';
        this.rgbLightService.updateCharacteristic(this.platform.Characteristic.On, true);
      }
      this.platform.webHelper.control(this.sn, { 'rgblevel': 1, 'rgbcolor': this.rgbColor });
    }, 100);
  }

  // RGB <-> HS conversions (value fixed at 1.0 — device has no brightness)
  private static rgbToHS(rgb: number): [number, number] {
    const r = ((rgb >> 16) & 0xFF) / 255;
    const g = ((rgb >> 8) & 0xFF) / 255;
    const b = (rgb & 0xFF) / 255;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const d = max - min;
    let h = 0;
    const s = max === 0 ? 0 : (d / max) * 100;
    if (d > 0) {
      if (max === r) {
        h = 60 * (((g - b) / d + 6) % 6);
      } else if (max === g) {
        h = 60 * ((b - r) / d + 2);
      } else {
        h = 60 * ((r - g) / d + 4);
      }
    }
    return [Math.round(h), Math.round(s)];
  }

  private static hsToRgb(h: number, s: number): number {
    const sat = s / 100;
    const c = sat;  // v=1
    const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
    const m = 1 - c;
    let r = 0, g = 0, b = 0;
    if (h < 60)       { r = c; g = x; }
    else if (h < 120) { r = x; g = c; }
    else if (h < 180) { g = c; b = x; }
    else if (h < 240) { g = x; b = c; }
    else if (h < 300) { r = x; b = c; }
    else              { r = c; b = x; }
    return (Math.round((r + m) * 255) << 16)
         | (Math.round((g + m) * 255) << 8)
         | Math.round((b + m) * 255);
  }

  private updateCurrentHumidifierState() {
    // Update HomeKit current humidifier state based on power and suspend states
    this.currState = this.on ? (this.suspended ? 1 : 2) : 0;
    this.platform.log.debug('Current Humidifier State: %s', this.currState);
    this.humidifierService.updateCharacteristic(this.platform.Characteristic.CurrentHumidifierDehumidifierState, this.currState);
    this.sleepSwitchService.updateCharacteristic(this.platform.Characteristic.On, this.getSleepMode());

    // Only update Hot Fog if the service exists (device supports it)
    if (this.hotFogSwitchService) {
      this.hotFogSwitchService.updateCharacteristic(this.platform.Characteristic.On, this.getHotFog());
    }
  }

  /**
   * 0 HomeKit: Auto - Dero: Manual (0)
   * 1 HomeKit: Humidifying - Dero: Auto (1) & Sleep (2)
   **/
  private updateTargetHumidifierState(dreoMode: number) {
    this.dreoMode = dreoMode;
    if (this.dreoMode === 2) {
      if (!this.on) {
        this.on = true;
        this.humidifierService.updateCharacteristic(this.platform.Characteristic.Active, this.on);
      }
      this.sleepSwitchService.updateCharacteristic(this.platform.Characteristic.On, true);
      this.humidifierService.updateCharacteristic(this.platform.Characteristic.TargetHumidifierDehumidifierState, 1);
    } else {
      this.humidifierService.updateCharacteristic(this.platform.Characteristic.TargetHumidifierDehumidifierState, this.dreoMode);
    }
  }

  private processReportedKey(key: string, reported: DreoStateReport): void {
    switch (key) {
      case 'poweron':
        if (this.on !== reported.poweron) {
          this.on = reported.poweron ?? this.on;
          this.platform.log.debug('Humidifier power: %s', this.on);
          this.humidifierService.updateCharacteristic(this.platform.Characteristic.Active, this.on);
          this.updateCurrentHumidifierState();
        }
        break;
      case 'mode':
        this.dreoMode = reported.mode ?? this.dreoMode;
        this.platform.log.debug('Humidifier mode reported: %s', this.dreoMode);
        this.updateTargetHumidifierState(this.dreoMode);
        break;
      case 'suspend':
        this.suspended = reported.suspend ?? this.suspended;
        this.platform.log.debug('Humidifier suspended: %s', this.suspended);
        this.updateCurrentHumidifierState();
        break;
      case 'rh':
        this.currentHum = reported.rh ?? this.currentHum;
        this.platform.log.debug('Humidifier humidity: %s', this.currentHum);
        // Validate current humidity for HomeKit display consistency
        const validatedCurrentHum = this.validateHumidityForHomeKit(this.currentHum);
        this.humidifierService.updateCharacteristic(this.platform.Characteristic.CurrentRelativeHumidity, validatedCurrentHum);
        this.humidityService.updateCharacteristic(this.platform.Characteristic.CurrentRelativeHumidity, validatedCurrentHum);
        break;
      case 'hotfogon':
        this.fogHot = reported.hotfogon ?? this.fogHot;
        this.platform.log.debug('Humidifier hotfogon: %s', this.fogHot);
        // Only update if the service exists (device supports hot fog)
        if (this.hotFogSwitchService) {
          this.hotFogSwitchService.updateCharacteristic(this.platform.Characteristic.On, this.fogHot);
        }
        break;
      case 'foglevel':
        this.manualFogLevel = reported.foglevel ?? this.manualFogLevel;
        this.platform.log.debug('Humidifier manualFogLevel: %s', this.manualFogLevel);
        this.humidifierService.updateCharacteristic(this.platform.Characteristic.RotationSpeed, this.manualFogLevel);
        if (this.manualFogLevel === 0) {
          this.on = false;
          this.humidifierService.updateCharacteristic(this.platform.Characteristic.Active, false);
        }
        break;
      case 'rhautolevel':
        this.targetHumAutoLevel = reported.rhautolevel ?? this.targetHumAutoLevel;
        this.platform.log.debug('Humidifier targetHumAutoLevel: %s', this.targetHumAutoLevel);
        if (this.dreoMode === 1) {
          const valueToUpdate = this.validateHumidityForHomeKit(this.targetHumAutoLevel);
          this.humidifierService
          .updateCharacteristic(this.platform.Characteristic.RelativeHumidityHumidifierThreshold, valueToUpdate);
        }
        break;
      case 'rhsleeplevel':
        this.targetHumSleepLevel = reported.rhsleeplevel ?? this.targetHumSleepLevel;
        this.platform.log.debug('Humidifier targetHumSleepLevel: %s', this.targetHumSleepLevel);
        if (this.dreoMode === 2) {
          const valueToUpdate = this.validateHumidityForHomeKit(this.targetHumSleepLevel);
          this.humidifierService
          .updateCharacteristic(this.platform.Characteristic.RelativeHumidityHumidifierThreshold, valueToUpdate);
        }
        break;
      case 'wrong':
        this.wrong = reported.wrong ?? this.wrong;
        if (this.wrong === 1) {
          this.platform.log.error('Humidifier error: No water detected');
          this.humidifierService.updateCharacteristic(this.platform.Characteristic.WaterLevel, 0);
        } else {
          this.humidifierService.updateCharacteristic(this.platform.Characteristic.WaterLevel, 100);
        }
        break;
      case 'rgblevel':
        this.rgbLevel = String(reported.rgblevel ?? this.rgbLevel);
        this.platform.log.debug('Humidifier rgblevel: %s', this.rgbLevel);
        this.rgbLightService.updateCharacteristic(this.platform.Characteristic.On, this.getRGBLightOn());
        break;
      case 'rgbcolor':
        this.rgbColor = reported.rgbcolor ?? this.rgbColor;
        [this.rgbHue, this.rgbSaturation] = HumidifierAccessory.rgbToHS(this.rgbColor);
        this.platform.log.debug('Humidifier rgbcolor: 0x%s -> H:%s S:%s', this.rgbColor.toString(16).padStart(6, '0'), this.rgbHue, this.rgbSaturation);
        this.rgbLightService.updateCharacteristic(this.platform.Characteristic.Hue, this.rgbHue);
        this.rgbLightService.updateCharacteristic(this.platform.Characteristic.Saturation, this.rgbSaturation);
        break;
      case 'filtertime':
        const filterLife = reported.filtertime ?? 100;
        this.platform.log.debug('Humidifier filter life: %s%', filterLife);
        // Could add a FilterLifeLevel characteristic if desired for HomeKit
        break;
      case 'worktime':
        const workTime = reported.worktime ?? 0;
        this.platform.log.debug('Humidifier work time since cleaning: %s minutes', workTime);
        break;
      case 'connected':
        const connected = reported.connected ?? true;
        this.platform.log.debug('Humidifier connection status: %s', connected ? 'Connected' : 'Disconnected');
        break;
      default:
        this.platform.log.debug('Incoming [%s]: %s', key, reported);
        break;
    }
  }
}

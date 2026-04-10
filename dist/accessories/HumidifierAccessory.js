"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.HumidifierAccessory = void 0;
const BaseAccessory_1 = require("./BaseAccessory");
// Use integer values for HomeKit humidity thresholds
const MAX_HUMIDITY = 90; // Maximum humidity level for HomeKit.
const MIN_HUMIDITY = 30; // Minimum humidity level for HomeKit.
const DEFAULT_HUMIDITY = 45; // Default humidity level for HomeKit if not specified.
class HumidifierAccessory extends BaseAccessory_1.BaseAccessory {
    constructor(platform, accessory, state) {
        var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p, _q, _r, _s, _t, _u, _v, _w, _x;
        // Call base class constructor
        super(platform, accessory);
        this.platform = platform;
        this.accessory = accessory;
        this.state = state;
        // Update current state in homebridge from Dreo API
        this.on = (_b = (_a = state.poweron) === null || _a === void 0 ? void 0 : _a.state) !== null && _b !== void 0 ? _b : false;
        this.dreoMode = (_d = (_c = state.mode) === null || _c === void 0 ? void 0 : _c.state) !== null && _d !== void 0 ? _d : 0;
        this.suspended = (_f = (_e = state.suspend) === null || _e === void 0 ? void 0 : _e.state) !== null && _f !== void 0 ? _f : false;
        this.currentHum = (_h = (_g = state.rh) === null || _g === void 0 ? void 0 : _g.state) !== null && _h !== void 0 ? _h : 0;
        this.fogHot = (_k = (_j = state.hotfogon) === null || _j === void 0 ? void 0 : _j.state) !== null && _k !== void 0 ? _k : false;
        this.ledLevel = (_m = (_l = state.ledlevel) === null || _l === void 0 ? void 0 : _l.state) !== null && _m !== void 0 ? _m : 0;
        this.rgbLevel = String((_p = (_o = state.rgblevel) === null || _o === void 0 ? void 0 : _o.state) !== null && _p !== void 0 ? _p : '0'); // Convert to string for consistency
        this.rgbColor = (_r = (_q = state.rgbcolor) === null || _q === void 0 ? void 0 : _q.state) !== null && _r !== void 0 ? _r : 0xFFFFFF;
        const [h, s] = HumidifierAccessory.rgbToHueSat(this.rgbColor);
        this.rgbHue = h;
        this.rgbSaturation = s;
        this.wrong = (_t = (_s = state.wrong) === null || _s === void 0 ? void 0 : _s.state) !== null && _t !== void 0 ? _t : 0;
        this.manualFogLevel = (_v = (_u = state.foglevel) === null || _u === void 0 ? void 0 : _u.state) !== null && _v !== void 0 ? _v : 0;
        // Ensure humidity levels are within HomeKit valid range
        this.targetHumAutoLevel = this.clampHumidityForDevice((_w = state.rhautolevel) === null || _w === void 0 ? void 0 : _w.state);
        this.targetHumSleepLevel = this.clampHumidityForDevice((_x = state.rhsleeplevel) === null || _x === void 0 ? void 0 : _x.state);
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
        // Only create Hot Fog switch if the device supports it (some models like HM311S don't have this feature)
        if (state.hotfogon !== undefined) {
            this.hotFogSwitchService = this.accessory.getServiceById(this.platform.Service.Switch, 'HotFog') ||
                this.accessory.addService(this.platform.Service.Switch, 'Warm Mist', 'HotFog');
        }
        // RGB Night Light service
        this.rgbLightService = this.accessory.getService(this.platform.Service.Lightbulb) ||
            this.accessory.addService(this.platform.Service.Lightbulb, 'Night Light');
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
        platform.webHelper.addEventListener('message', (message) => {
            let data;
            try {
                data = JSON.parse(message.data);
                if (data.devicesn === accessory.context.device.sn) {
                    if (data.method && ['control-report', 'control-reply', 'report'].includes(data.method) && data.reported) {
                        this.platform.log.info('Humidifier WS reported: %s', JSON.stringify(data.reported));
                        Object.keys(data.reported).forEach(key => this.processReportedKey(key, data.reported));
                    }
                }
            }
            catch (error) {
                this.platform.log.error('Failed to parse incoming message: %s', error);
            }
        });
    }
    // Helper function to clamp humidity values to device capabilities when setting values
    clampHumidityForDevice(value) {
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
    validateHumidityForHomeKit(value) {
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
    getActive() {
        return this.on;
    }
    setActive(value) {
        this.platform.log.debug('Triggered SET Active: %s', value);
        const isActive = Boolean(value);
        // Check state to prevent duplicate requests
        if (this.on !== isActive) {
            // Send to Dreo server via websocket
            this.platform.webHelper.control(this.sn, { 'poweron': isActive });
        }
        // Update HomeKit state
        this.on = isActive;
        this.updateCurrentHumidifierState();
    }
    getSleepMode() {
        return this.on && this.dreoMode === 2;
    }
    setSleepMode(value) {
        this.platform.log.debug('Triggered SET SleepMode: %s', value);
        const isSleepMode = Boolean(value);
        let command;
        if (isSleepMode) {
            this.dreoMode = 2;
            if (this.on) {
                command = { 'mode': this.dreoMode };
            }
            else {
                this.on = true;
                command = { 'poweron': true, 'mode': this.dreoMode }; // Power on the humidifier
                this.humidifierService.updateCharacteristic(this.platform.Characteristic.Active, true);
            }
            setTimeout(() => {
                this.humidifierService.updateCharacteristic(this.platform.Characteristic.TargetHumidifierDehumidifierState, 1);
            }, 750);
        }
        else { // Run this only if the humidifier is on
            this.dreoMode = 0;
            command = { 'mode': this.dreoMode };
            if (this.on) {
                setTimeout(() => {
                    this.humidifierService.updateCharacteristic(this.platform.Characteristic.TargetHumidifierDehumidifierState, 0);
                }, 750);
            }
        }
        this.platform.webHelper.control(this.sn, command);
    }
    getHotFog() {
        return this.on && this.fogHot;
    }
    setHotFog(value) {
        // Only proceed if this device supports hot fog
        if (!this.hotFogSwitchService) {
            this.platform.log.warn('Hot fog feature not supported on this model');
            return;
        }
        this.platform.log.debug('Triggered SET HotFog: %s', value);
        this.fogHot = Boolean(value);
        let command;
        if (this.on) {
            command = { 'hotfogon': this.fogHot };
        }
        else {
            command = { 'poweron': true, 'hotfogon': this.fogHot };
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
    setTargetHumidifierMode(value) {
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
    getTargetHumidifierMode() {
        // Always return 1 (humidifier) since HM311S is humidifier-only
        // This ensures HomeKit displays "Humidifier" instead of "Humidifier-Dehumidifier"
        return 1;
    }
    getCurrentHumidity() {
        // Ensure current humidity is a proper integer for HomeKit display
        const validated = this.validateHumidityForHomeKit(this.currentHum);
        this.platform.log.debug('getCurrentHumidity() - raw: %s, validated: %s', this.currentHum, validated);
        return validated;
    }
    setTargetHumidity(value) {
        // Clamp value to device capabilities (30-90%) when setting
        const targetValue = this.clampHumidityForDevice(Number(value));
        if (this.dreoMode === 0) { // manual
            this.platform.log.warn('ERROR: Triggered SET TargetHumidity (Manual): %s', targetValue);
        }
        else if (this.dreoMode === 1) { // auto
            this.targetHumAutoLevel = targetValue;
            this.platform.log.debug('Triggered SET TargetHumidity (Auto): %s', targetValue);
            this.platform.webHelper.control(this.sn, { 'rhautolevel': this.targetHumAutoLevel });
        }
        else if (this.dreoMode === 2) { // sleep
            this.targetHumSleepLevel = targetValue;
            this.platform.log.debug('Triggered SET TargetHumidity (Sleep): %s', targetValue);
            this.platform.webHelper.control(this.sn, { 'rhsleeplevel': this.targetHumSleepLevel });
        }
    }
    getTargetHumidity() {
        let threshold;
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
    setTargetFogLevel(value) {
        this.platform.log.debug('Triggered SET TargetFogLevel: %s', value);
        this.manualFogLevel = Number(value);
        if (this.manualFogLevel === 0) { // If manual fog level is 0, turn off the humidifier
            this.on = false; // Turn off humidifier
            this.humidifierService.updateCharacteristic(this.platform.Characteristic.Active, false);
            this.platform.webHelper.control(this.sn, { 'poweron': this.on });
            return;
        }
        if (this.dreoMode === 0) { // manual
            this.platform.webHelper.control(this.sn, { 'foglevel': this.manualFogLevel });
        }
        else {
            this.platform.log.warn('WARN: Switching to manual mode to set fog level. Current mode: %s', this.dreoMode);
            this.dreoMode = 0; // Set mode to manual
            this.platform.webHelper.control(this.sn, { 'mode': this.dreoMode, 'foglevel': this.manualFogLevel });
        }
    }
    getTargetFogLevel() {
        return this.on ? this.manualFogLevel : 0;
    }
    // RGB Light control
    getRGBLightOn() {
        return parseInt(this.rgbLevel) > 0;
    }
    setRGBLightOn(value) {
        this.platform.log.debug('Triggered SET RGB Light On: %s', value);
        const on = Boolean(value);
        if (on && parseInt(this.rgbLevel) === 0) {
            this.rgbLevel = '1';
            this.platform.webHelper.control(this.sn, { 'rgblevel': 1 });
        }
        else if (!on) {
            this.rgbLevel = '0';
            this.platform.webHelper.control(this.sn, { 'rgblevel': 0 });
        }
    }
    getRGBHue() {
        return this.rgbHue;
    }
    setRGBHue(value) {
        this.platform.log.debug('Triggered SET RGB Hue: %s', value);
        this.rgbHue = Number(value);
        this.sendRGBColor();
    }
    getRGBSaturation() {
        return this.rgbSaturation;
    }
    setRGBSaturation(value) {
        this.platform.log.debug('Triggered SET RGB Saturation: %s', value);
        this.rgbSaturation = Number(value);
        this.sendRGBColor();
    }
    sendRGBColor() {
        const rgb = HumidifierAccessory.hueSatToRgb(this.rgbHue, this.rgbSaturation);
        this.rgbColor = rgb;
        this.platform.log.debug('Sending rgbcolor: %s (0x%s)', rgb, rgb.toString(16).padStart(6, '0'));
        this.platform.webHelper.control(this.sn, { 'rgbcolor': rgb });
        // Ensure light is on when setting color
        if (parseInt(this.rgbLevel) === 0) {
            this.rgbLevel = '1';
            this.platform.webHelper.control(this.sn, { 'rgblevel': 1 });
            this.rgbLightService.updateCharacteristic(this.platform.Characteristic.On, true);
        }
    }
    // Convert packed 24-bit RGB integer to HomeKit [hue (0-360), saturation (0-100)]
    static rgbToHueSat(rgb) {
        const r = ((rgb >> 16) & 0xFF) / 255;
        const g = ((rgb >> 8) & 0xFF) / 255;
        const b = (rgb & 0xFF) / 255;
        const max = Math.max(r, g, b);
        const min = Math.min(r, g, b);
        const d = max - min;
        let h = 0;
        const s = max === 0 ? 0 : (d / max) * 100;
        if (d !== 0) {
            if (max === r) {
                h = 60 * (((g - b) / d) % 6);
            }
            else if (max === g) {
                h = 60 * ((b - r) / d + 2);
            }
            else {
                h = 60 * ((r - g) / d + 4);
            }
            if (h < 0) {
                h += 360;
            }
        }
        return [Math.round(h), Math.round(s)];
    }
    // Convert HomeKit hue (0-360) + saturation (0-100) to packed 24-bit RGB integer
    static hueSatToRgb(hue, saturation) {
        const s = saturation / 100;
        const v = 1; // Full brightness since device has no brightness control
        const c = v * s;
        const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
        const m = v - c;
        let r = 0, g = 0, b = 0;
        if (hue < 60) {
            r = c;
            g = x;
        }
        else if (hue < 120) {
            r = x;
            g = c;
        }
        else if (hue < 180) {
            g = c;
            b = x;
        }
        else if (hue < 240) {
            g = x;
            b = c;
        }
        else if (hue < 300) {
            r = x;
            b = c;
        }
        else {
            r = c;
            b = x;
        }
        const ri = Math.round((r + m) * 255);
        const gi = Math.round((g + m) * 255);
        const bi = Math.round((b + m) * 255);
        return (ri << 16) | (gi << 8) | bi;
    }
    updateCurrentHumidifierState() {
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
    updateTargetHumidifierState(dreoMode) {
        this.dreoMode = dreoMode;
        if (this.dreoMode === 2) {
            if (!this.on) {
                this.on = true;
                this.humidifierService.updateCharacteristic(this.platform.Characteristic.Active, this.on);
            }
            this.sleepSwitchService.updateCharacteristic(this.platform.Characteristic.On, true);
            this.humidifierService.updateCharacteristic(this.platform.Characteristic.TargetHumidifierDehumidifierState, 1);
        }
        else {
            this.humidifierService.updateCharacteristic(this.platform.Characteristic.TargetHumidifierDehumidifierState, this.dreoMode);
        }
    }
    processReportedKey(key, reported) {
        var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p;
        switch (key) {
            case 'poweron':
                if (this.on !== reported.poweron) {
                    this.on = (_a = reported.poweron) !== null && _a !== void 0 ? _a : this.on;
                    this.platform.log.debug('Humidifier power: %s', this.on);
                    this.humidifierService.updateCharacteristic(this.platform.Characteristic.Active, this.on);
                    this.updateCurrentHumidifierState();
                }
                break;
            case 'mode':
                this.dreoMode = (_b = reported.mode) !== null && _b !== void 0 ? _b : this.dreoMode;
                this.platform.log.debug('Humidifier mode reported: %s', this.dreoMode);
                this.updateTargetHumidifierState(this.dreoMode);
                break;
            case 'suspend':
                this.suspended = (_c = reported.suspend) !== null && _c !== void 0 ? _c : this.suspended;
                this.platform.log.debug('Humidifier suspended: %s', this.suspended);
                this.updateCurrentHumidifierState();
                break;
            case 'rh':
                this.currentHum = (_d = reported.rh) !== null && _d !== void 0 ? _d : this.currentHum;
                this.platform.log.debug('Humidifier humidity: %s', this.currentHum);
                // Validate current humidity for HomeKit display consistency
                const validatedCurrentHum = this.validateHumidityForHomeKit(this.currentHum);
                this.humidifierService.updateCharacteristic(this.platform.Characteristic.CurrentRelativeHumidity, validatedCurrentHum);
                this.humidityService.updateCharacteristic(this.platform.Characteristic.CurrentRelativeHumidity, validatedCurrentHum);
                break;
            case 'hotfogon':
                this.fogHot = (_e = reported.hotfogon) !== null && _e !== void 0 ? _e : this.fogHot;
                this.platform.log.debug('Humidifier hotfogon: %s', this.fogHot);
                // Only update if the service exists (device supports hot fog)
                if (this.hotFogSwitchService) {
                    this.hotFogSwitchService.updateCharacteristic(this.platform.Characteristic.On, this.fogHot);
                }
                break;
            case 'foglevel':
                this.manualFogLevel = (_f = reported.foglevel) !== null && _f !== void 0 ? _f : this.manualFogLevel;
                this.platform.log.debug('Humidifier manualFogLevel: %s', this.manualFogLevel);
                this.humidifierService.updateCharacteristic(this.platform.Characteristic.RotationSpeed, this.manualFogLevel);
                if (this.manualFogLevel === 0) {
                    this.on = false;
                    this.humidifierService.updateCharacteristic(this.platform.Characteristic.Active, false);
                }
                break;
            case 'rhautolevel':
                this.targetHumAutoLevel = (_g = reported.rhautolevel) !== null && _g !== void 0 ? _g : this.targetHumAutoLevel;
                this.platform.log.debug('Humidifier targetHumAutoLevel: %s', this.targetHumAutoLevel);
                if (this.dreoMode === 1) {
                    const valueToUpdate = this.validateHumidityForHomeKit(this.targetHumAutoLevel);
                    this.humidifierService
                        .updateCharacteristic(this.platform.Characteristic.RelativeHumidityHumidifierThreshold, valueToUpdate);
                }
                break;
            case 'rhsleeplevel':
                this.targetHumSleepLevel = (_h = reported.rhsleeplevel) !== null && _h !== void 0 ? _h : this.targetHumSleepLevel;
                this.platform.log.debug('Humidifier targetHumSleepLevel: %s', this.targetHumSleepLevel);
                if (this.dreoMode === 2) {
                    const valueToUpdate = this.validateHumidityForHomeKit(this.targetHumSleepLevel);
                    this.humidifierService
                        .updateCharacteristic(this.platform.Characteristic.RelativeHumidityHumidifierThreshold, valueToUpdate);
                }
                break;
            case 'wrong':
                this.wrong = (_j = reported.wrong) !== null && _j !== void 0 ? _j : this.wrong;
                if (this.wrong === 1) {
                    this.platform.log.error('Humidifier error: No water detected');
                    this.humidifierService.updateCharacteristic(this.platform.Characteristic.WaterLevel, 0);
                }
                else {
                    this.humidifierService.updateCharacteristic(this.platform.Characteristic.WaterLevel, 100);
                }
                break;
            case 'rgblevel':
                this.rgbLevel = String((_k = reported.rgblevel) !== null && _k !== void 0 ? _k : this.rgbLevel);
                this.platform.log.debug('Humidifier rgblevel: %s', this.rgbLevel);
                this.rgbLightService.updateCharacteristic(this.platform.Characteristic.On, this.getRGBLightOn());
                break;
            case 'rgbcolor':
                this.rgbColor = (_l = reported.rgbcolor) !== null && _l !== void 0 ? _l : this.rgbColor;
                const [hue, sat] = HumidifierAccessory.rgbToHueSat(this.rgbColor);
                this.rgbHue = hue;
                this.rgbSaturation = sat;
                this.platform.log.debug('Humidifier rgbcolor: 0x%s -> H:%s S:%s', this.rgbColor.toString(16).padStart(6, '0'), hue, sat);
                this.rgbLightService.updateCharacteristic(this.platform.Characteristic.Hue, this.rgbHue);
                this.rgbLightService.updateCharacteristic(this.platform.Characteristic.Saturation, this.rgbSaturation);
                break;
            case 'filtertime':
                const filterLife = (_m = reported.filtertime) !== null && _m !== void 0 ? _m : 100;
                this.platform.log.debug('Humidifier filter life: %s%', filterLife);
                // Could add a FilterLifeLevel characteristic if desired for HomeKit
                break;
            case 'worktime':
                const workTime = (_o = reported.worktime) !== null && _o !== void 0 ? _o : 0;
                this.platform.log.debug('Humidifier work time since cleaning: %s minutes', workTime);
                break;
            case 'connected':
                const connected = (_p = reported.connected) !== null && _p !== void 0 ? _p : true;
                this.platform.log.debug('Humidifier connection status: %s', connected ? 'Connected' : 'Disconnected');
                break;
            default:
                this.platform.log.debug('Incoming [%s]: %s', key, reported);
                break;
        }
    }
}
exports.HumidifierAccessory = HumidifierAccessory;
//# sourceMappingURL=HumidifierAccessory.js.map
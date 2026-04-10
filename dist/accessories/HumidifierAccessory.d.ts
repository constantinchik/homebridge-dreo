import { PlatformAccessory } from 'homebridge';
import { DreoPlatform } from '../platform';
import { BaseAccessory } from './BaseAccessory';
interface DreoState {
    poweron: {
        state: boolean;
    };
    mode: {
        state: number;
    };
    suspend: {
        state: boolean;
    };
    rh: {
        state: number;
    };
    hotfogon?: {
        state: boolean;
    };
    ledlevel: {
        state: number;
    };
    rgblevel: {
        state: string | number;
    };
    rgbcolor?: {
        state: number;
    };
    foglevel: {
        state: number;
    };
    rhautolevel: {
        state: number;
    };
    rhsleeplevel: {
        state: number;
    };
    wrong: {
        state: number;
    };
}
export declare class HumidifierAccessory extends BaseAccessory {
    readonly platform: DreoPlatform;
    readonly accessory: PlatformAccessory;
    private readonly state;
    private readonly humidifierService;
    private readonly humidityService;
    private readonly sleepSwitchService;
    private readonly hotFogSwitchService?;
    private readonly rgbColorSwitches;
    private static readonly RGB_PRESETS;
    private on;
    private dreoMode;
    private suspended;
    private currentHum;
    private fogHot;
    private ledLevel;
    private rgbLevel;
    private rgbColor;
    private activeColorPreset;
    private wrong;
    private manualFogLevel;
    private targetHumAutoLevel;
    private targetHumSleepLevel;
    private currState;
    constructor(platform: DreoPlatform, accessory: PlatformAccessory, state: DreoState);
    private clampHumidityForDevice;
    private validateHumidityForHomeKit;
    getActive(): boolean;
    setActive(value: unknown): void;
    getSleepMode(): boolean;
    setSleepMode(value: unknown): void;
    getHotFog(): boolean;
    setHotFog(value: unknown): void;
    getCurrentHumidifierState(): number;
    getCurrentHumidifierWaterLevel(): 0 | 100;
    setTargetHumidifierMode(value: unknown): void;
    getTargetHumidifierMode(): number;
    getCurrentHumidity(): number;
    setTargetHumidity(value: unknown): void;
    getTargetHumidity(): number;
    setTargetFogLevel(value: unknown): void;
    getTargetFogLevel(): number;
    private getColorPresetOn;
    private setColorPresetOn;
    private updateColorPresetSwitches;
    private static findClosestPreset;
    private updateCurrentHumidifierState;
    /**
     * 0 HomeKit: Auto - Dero: Manual (0)
     * 1 HomeKit: Humidifying - Dero: Auto (1) & Sleep (2)
     **/
    private updateTargetHumidifierState;
    private processReportedKey;
}
export {};
//# sourceMappingURL=HumidifierAccessory.d.ts.map
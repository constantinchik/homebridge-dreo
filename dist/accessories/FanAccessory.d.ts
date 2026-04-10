import { PlatformAccessory } from 'homebridge';
import { DreoPlatform } from '../platform';
import { BaseAccessory } from './BaseAccessory';
/**
 * Platform Accessory
 * An instance of this class is created for each accessory your platform registers
 * Each accessory may expose multiple services of different service types.
 */
export declare class FanAccessory extends BaseAccessory {
    private readonly state;
    private service;
    private temperatureService?;
    private lightService?;
    private currState;
    constructor(platform: DreoPlatform, accessory: PlatformAccessory, state: any);
    setActive(value: any): void;
    getActive(): boolean;
    setRotationSpeed(value: any): Promise<void>;
    getRotationSpeed(): Promise<number>;
    setSwingMode(value: any): Promise<void>;
    getSwingMode(): Promise<boolean>;
    setMode(value: any): Promise<void>;
    getMode(): Promise<boolean>;
    setLockPhysicalControls(value: any): Promise<void>;
    getLockPhysicalControls(): boolean;
    getTemperature(): Promise<number>;
    correctedTemperature(temperatureFromDreo: any): number;
    convertModeToBoolean(value: number): boolean;
    setLightOn(value: any): void;
    getLightOn(): boolean;
    setBrightness(value: any): void;
    getBrightness(): number;
}
//# sourceMappingURL=FanAccessory.d.ts.map
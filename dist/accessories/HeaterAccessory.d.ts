import { PlatformAccessory } from 'homebridge';
import { DreoPlatform } from '../platform';
import { BaseAccessory } from './BaseAccessory';
/**
 * Heater Accessory
 */
export declare class HeaterAccessory extends BaseAccessory {
    private readonly state;
    private service;
    private on;
    private mode;
    private heatLevel;
    private oscAngle;
    private swing;
    private temperature;
    private targetTemperature;
    private currState;
    private tempUnit;
    private childLockOn;
    private ptcon;
    /**
    * Map of Oscillation commands to HomeKit percentage values
    * Dreo uses 0, 60, 90, 120 for oscillation angle where 0 is rotating
    * If we get an oscillation angle of 0 from Dreo, we'll set oscOn to true
    */
    private readonly oscMap;
    minTemp: number;
    canSwing: boolean;
    canSetAngle: boolean;
    canSetTempUnit: boolean;
    constructor(platform: DreoPlatform, accessory: PlatformAccessory, state: any);
    setActive(value: any): void;
    getActive(): boolean;
    getCurrentHeaterCoolerState(): number;
    setTargetHeaterCoolerState(value: any): void;
    getTargetHeaterCoolerState(): 1 | 0 | 2;
    getCurrentTemperature(): number;
    setHeatingThresholdTemperature(value: any): void;
    getHeatingThresholdTemperature(): number;
    setCoolingThresholdTemperature(): void;
    getCoolingThresholdTemperature(): number;
    setLockPhysicalControls(value: any): void;
    getLockPhysicalControls(): boolean;
    setRotationSpeed(value: any): void;
    getRotationSpeed(): number;
    setTemperatureDisplayUnits(value: any): void;
    getTemperatureDisplayUnits(): boolean;
    setSwingMode(value: any): void;
    getSwingMode(): boolean;
    updateHeaterState(): void;
    updateThermostatTemp(): void;
    convertToCelsius(temperatureFromDreo: any): number;
    convertToFahrenheit(temperatureFromHomeKit: any): number;
}
//# sourceMappingURL=HeaterAccessory.d.ts.map
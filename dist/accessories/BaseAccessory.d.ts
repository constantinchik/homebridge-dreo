import { PlatformAccessory } from 'homebridge';
import { DreoPlatform } from '../platform';
export declare abstract class BaseAccessory {
    protected readonly platform: DreoPlatform;
    protected readonly accessory: PlatformAccessory;
    protected readonly sn: any;
    constructor(platform: DreoPlatform, accessory: PlatformAccessory);
    /**
     * Generate user-friendly model name based on series information
     * For example: DR-HHM001S with seriesName "HM311S/411S" becomes "DR-HM311S"
     */
    private getDisplayModel;
    abstract setActive(value: boolean): void;
    abstract getActive(): boolean;
}
//# sourceMappingURL=BaseAccessory.d.ts.map
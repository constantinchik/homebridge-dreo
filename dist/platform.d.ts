import { API, DynamicPlatformPlugin, Logger, PlatformAccessory, PlatformConfig, Service, Characteristic } from 'homebridge';
import DreoAPI from './DreoAPI';
/**
 * HomebridgePlatform
 * This class is the main constructor for your plugin, this is where you should
 * parse the user config and discover/register accessories with Homebridge.
 */
export declare class DreoPlatform implements DynamicPlatformPlugin {
    readonly log: Logger;
    readonly config: PlatformConfig;
    readonly api: API;
    readonly Service: typeof Service;
    readonly Characteristic: typeof Characteristic;
    readonly webHelper: DreoAPI;
    readonly accessories: PlatformAccessory[];
    constructor(log: Logger, config: PlatformConfig, api: API);
    /**
     * This function is invoked when homebridge restores cached accessories from disk at startup.
     * It should be used to setup event handlers for characteristics and update respective values.
     */
    configureAccessory(accessory: PlatformAccessory): void;
    /**
     * Log into Dreo services, retrieve the user's devices, and register them as accessories
     * Also remove accessories that are no longer present on the user's account
     */
    discoverDevices(): Promise<void>;
}
//# sourceMappingURL=platform.d.ts.map
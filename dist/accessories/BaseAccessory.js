"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BaseAccessory = void 0;
class BaseAccessory {
    constructor(platform, accessory) {
        this.platform = platform;
        this.accessory = accessory;
        this.sn = this.accessory.context.device.sn;
        // Set accessory information
        accessory.getService(this.platform.Service.AccessoryInformation)
            .setCharacteristic(this.platform.Characteristic.Manufacturer, accessory.context.device.brand)
            .setCharacteristic(this.platform.Characteristic.Model, this.getDisplayModel(accessory.context.device))
            .setCharacteristic(this.platform.Characteristic.SerialNumber, accessory.context.device.sn);
    }
    /**
     * Generate user-friendly model name based on series information
     * For example: DR-HHM001S with seriesName "HM311S/411S" becomes "DR-HM311S"
     */
    getDisplayModel(device) {
        const originalModel = device.model;
        const seriesName = device.seriesName;
        // If no series name available, use original model
        if (!seriesName) {
            return originalModel;
        }
        // Extract the main series model from seriesName (e.g., "HM311S" from "HM311S/411S")
        const seriesMatch = seriesName.match(/^([^/]+)/);
        if (!seriesMatch) {
            return originalModel;
        }
        const mainSeriesModel = seriesMatch[1]; // e.g., "HM311S"
        // For humidifiers, construct DR-HM + series number
        if (originalModel.startsWith('DR-HHM')) {
            return `DR-${mainSeriesModel}`; // e.g., "DR-HM311S"
        }
        // For other device types, you could add similar logic
        // For now, return original model for non-humidifier devices
        return originalModel;
    }
}
exports.BaseAccessory = BaseAccessory;
//# sourceMappingURL=BaseAccessory.js.map
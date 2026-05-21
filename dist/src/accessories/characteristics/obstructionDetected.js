"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ObstructionDetectedCharacteristic = void 0;
const base_1 = require("./base");
class ObstructionDetectedCharacteristic extends base_1.TuyaWebCharacteristic {
    static HomekitCharacteristic(accessory) {
        return accessory.platform.Characteristic.ObstructionDetected;
    }
    static isSupportedByAccessory() {
        return true;
    }
    getRemoteValue(callback) {
        this.updateValue({}, callback);
    }
    updateValue(data, callback) {
        this.debug("Setting position state to stopped");
        this.accessory.setCharacteristic(this.homekitCharacteristic, false, !callback);
        callback === null || callback === void 0 ? void 0 : callback(null, false);
    }
}
exports.ObstructionDetectedCharacteristic = ObstructionDetectedCharacteristic;
ObstructionDetectedCharacteristic.Title = "Characteristic.ObstructionDetected";
//# sourceMappingURL=obstructionDetected.js.map
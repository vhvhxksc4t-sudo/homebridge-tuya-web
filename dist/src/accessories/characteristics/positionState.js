"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PositionStateCharacteristic = void 0;
const base_1 = require("./base");
class PositionStateCharacteristic extends base_1.TuyaWebCharacteristic {
    static HomekitCharacteristic(accessory) {
        return accessory.platform.Characteristic.PositionState;
    }
    static isSupportedByAccessory() {
        return true;
    }
    get PositionState() {
        return this.accessory.platform.Characteristic.PositionState;
    }
    getRemoteValue(callback) {
        this.updateValue({}, callback);
    }
    updateValue(data, callback) {
        this.debug("Setting position state to stopped");
        this.accessory.setCharacteristic(this.homekitCharacteristic, this.PositionState.STOPPED, !callback);
        callback === null || callback === void 0 ? void 0 : callback(null, this.PositionState.STOPPED);
    }
}
exports.PositionStateCharacteristic = PositionStateCharacteristic;
PositionStateCharacteristic.Title = "Characteristic.PositionState";
//# sourceMappingURL=positionState.js.map
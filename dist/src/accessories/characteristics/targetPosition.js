"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TargetPositionCharacteristic = void 0;
const base_1 = require("./base");
const response_1 = require("../../api/response");
const TuyaBoolean_1 = require("../../helpers/TuyaBoolean");
class TargetPositionCharacteristic extends base_1.TuyaWebCharacteristic {
    static HomekitCharacteristic(accessory) {
        return accessory.platform.Characteristic.TargetPosition;
    }
    setProps(char) {
        return char === null || char === void 0 ? void 0 : char.setProps({
            unit: "percentage" /* Units.PERCENTAGE */,
            format: "int" /* Formats.INT */,
            minValue: 0,
            maxValue: 100,
            minStep: 100,
        });
    }
    static isSupportedByAccessory() {
        return true;
    }
    getRemoteValue(callback) {
        this.accessory
            .getDeviceState()
            .then((data) => {
            this.debug("[GET] %s", data === null || data === void 0 ? void 0 : data.state);
            this.updateValue(data, callback);
        })
            .catch(this.accessory.handleError("GET", callback));
    }
    setRemoteValue(homekitValue, callback) {
        const value = homekitValue === 0 ? 0 : 1;
        const data = {
            target_cover_state: value === 0 ? response_1.CoverState.Closing : response_1.CoverState.Opening,
            state: value === 0 ? response_1.CoverState.Closing : response_1.CoverState.Opening,
        };
        this.accessory
            .setDeviceState("turnOnOff", { value }, data)
            .then(() => {
            this.debug("[SET] %s", value);
            callback();
        })
            .catch(this.accessory.handleError("SET", callback));
    }
    updateValue(data, callback) {
        if (!isNaN(Number(String(data === null || data === void 0 ? void 0 : data.state)))) {
            //State is a number and probably 1, 2 or 3
            const state = Number(data.state);
            let stateValue;
            switch (state) {
                case response_1.CoverState.Opening:
                    stateValue = 100;
                    break;
                case response_1.CoverState.Closing:
                    stateValue = 0;
                    break;
                default:
                    if (data.target_cover_state === response_1.CoverState.Opening) {
                        stateValue = 100;
                    }
                    else if (data.target_cover_state === response_1.CoverState.Stopped) {
                        stateValue = 50;
                    }
                    else {
                        stateValue = 0;
                    }
            }
            this.accessory.setCharacteristic(this.homekitCharacteristic, stateValue, !callback);
            callback === null || callback === void 0 ? void 0 : callback(null, stateValue);
        }
        else if (["true", "false"].includes(String(data === null || data === void 0 ? void 0 : data.state).toLowerCase())) {
            const stateValue = (0, TuyaBoolean_1.TuyaBoolean)(data.state) ? 100 : 0;
            this.accessory.setCharacteristic(this.homekitCharacteristic, stateValue, !callback);
            callback === null || callback === void 0 ? void 0 : callback(null, stateValue);
        }
        else {
            callback === null || callback === void 0 ? void 0 : callback(new Error(`Unexpected state value provided: ${data === null || data === void 0 ? void 0 : data.state}`));
        }
    }
}
exports.TargetPositionCharacteristic = TargetPositionCharacteristic;
TargetPositionCharacteristic.Title = "Characteristic.TargetPosition";
//# sourceMappingURL=targetPosition.js.map
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ColorTemperatureCharacteristic = void 0;
const base_1 = require("./base");
const MapRange_1 = require("../../helpers/MapRange");
// Homekit uses mired light units, Tuya uses kelvin
// Mired = 1.000.000/Kelvin
class ColorTemperatureCharacteristic extends base_1.TuyaWebCharacteristic {
    constructor() {
        super(...arguments);
        this.rangeMapper = MapRange_1.MapRange.tuya(this.maxKelvin, this.minKelvin).homeKit(this.minHomekit, this.maxHomekit);
    }
    static HomekitCharacteristic(accessory) {
        return accessory.platform.Characteristic.ColorTemperature;
    }
    static isSupportedByAccessory(accessory) {
        return accessory.deviceConfig.data.color_temp !== undefined;
    }
    setProps(char) {
        return char === null || char === void 0 ? void 0 : char.setProps({
            format: "int" /* Formats.INT */,
            minValue: this.minHomekit,
            maxValue: this.maxHomekit,
        });
    }
    get minKelvin() {
        const data = this.accessory.deviceConfig.config;
        return Number(data === null || data === void 0 ? void 0 : data.min_kelvin) || 1000000 / 500;
    }
    get maxKelvin() {
        const data = this.accessory.deviceConfig.config;
        return Number(data === null || data === void 0 ? void 0 : data.max_kelvin) || 1000000 / 140;
    }
    get minHomekit() {
        return 1000000 / this.maxKelvin;
    }
    get maxHomekit() {
        return 1000000 / this.minKelvin;
    }
    getRemoteValue(callback) {
        this.accessory
            .getDeviceState()
            .then((data) => {
            this.debug("[GET] %s", data === null || data === void 0 ? void 0 : data.color_temp);
            this.updateValue(data, callback);
        })
            .catch(this.accessory.handleError("GET", callback));
    }
    setRemoteValue(homekitValue, callback) {
        if (typeof homekitValue !== "number") {
            const errorMsg = `Received unexpected temperature value ${JSON.stringify(homekitValue)} of type ${typeof homekitValue}`;
            this.warn(errorMsg);
            callback(new Error(errorMsg));
            return;
        }
        // Set device state in Tuya Web API
        const value = Math.round(this.rangeMapper.homekitToTuya(homekitValue));
        this.accessory
            .setDeviceState("colorTemperatureSet", { value }, { color_temp: value })
            .then(() => {
            this.debug("[SET] %s %s", homekitValue, value);
            callback();
        })
            .catch(this.accessory.handleError("SET", callback));
    }
    updateValue(data, callback) {
        if ((data === null || data === void 0 ? void 0 : data.color_temp) !== undefined) {
            const tuyaValue = data.color_temp;
            const homekitColorTemp = Math.round(this.rangeMapper.tuyaToHomekit(Number(data.color_temp)));
            if (homekitColorTemp > this.maxHomekit) {
                this.warn("Characteristic 'ColorTemperature' will receive value higher than allowed mired (%s) since provided Tuya kelvin value (%s) " +
                    "is lower then configured minimum Tuya kelvin value (%s). Please update your configuration!", homekitColorTemp, tuyaValue, this.rangeMapper.tuyaStart);
            }
            else if (homekitColorTemp < this.minHomekit) {
                this.warn("Characteristic 'ColorTemperature' will receive value lower than allowed mired (%s) since provided Tuya kelvin value (%s) " +
                    "exceeds configured maximum Tuya kelvin value (%s). Please update your configuration!", homekitColorTemp, tuyaValue, this.rangeMapper.tuyaEnd);
            }
            this.accessory.setCharacteristic(this.homekitCharacteristic, homekitColorTemp, !callback);
            callback === null || callback === void 0 ? void 0 : callback(null, homekitColorTemp);
        }
        else {
            callback === null || callback === void 0 ? void 0 : callback(new Error("Could not find required property 'color_temp'"));
        }
    }
}
exports.ColorTemperatureCharacteristic = ColorTemperatureCharacteristic;
ColorTemperatureCharacteristic.Title = "Characteristic.ColorTemperature";
//# sourceMappingURL=colorTemperature.js.map
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.HomeAssistantDeviceTypes = exports.TuyaDeviceTypes = exports.CoverState = void 0;
var CoverState;
(function (CoverState) {
    CoverState[CoverState["Opening"] = 1] = "Opening";
    CoverState[CoverState["Closing"] = 2] = "Closing";
    CoverState[CoverState["Stopped"] = 3] = "Stopped";
})(CoverState || (exports.CoverState = CoverState = {}));
exports.TuyaDeviceTypes = [
    "climate",
    "cover",
    "dimmer",
    "fan",
    "garage",
    "light",
    "outlet",
    "scene",
    "switch",
    "temperature_sensor",
    "window",
];
exports.HomeAssistantDeviceTypes = [
    "climate",
    "cover",
    "dimmer",
    "fan",
    "light",
    "outlet",
    "scene",
    "switch",
];
//# sourceMappingURL=response.js.map
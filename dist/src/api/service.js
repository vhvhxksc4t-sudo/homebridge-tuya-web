"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.TuyaWebApi = void 0;
const axios_1 = __importDefault(require("axios"));
const crypto_1 = __importDefault(require("crypto"));
const session_1 = require("./session");
const response_1 = require("./response");
const errors_1 = require("../errors");
const DeviceOfflineError_1 = require("../errors/DeviceOfflineError");
const REGION_URLS = {
    cn: "https://openapi.tuyacn.com",
    us: "https://openapi.tuyaus.com",
    eu: "https://openapi.tuyaeu.com",
    in: "https://openapi.tuyain.com",
};
// Tuya category code → plugin device type
// Source: Tuya IoT Platform category documentation
const CATEGORY_MAP = {
    kg: "switch",
    cz: "outlet",
    pc: "outlet",
    dj: "light",
    dd: "dimmer",
    xdd: "light",
    fwd: "light",
    dc: "light",
    tgq: "dimmer",
    tgkg: "switch",
    fs: "fan",
    fsd: "fan",
    cl: "cover",
    clkg: "cover",
    wm: "cover",
    wmc: "cover",
    wk: "climate",
    wkf: "climate",
    qt: "climate",
    wsdcg: "temperature_sensor",
    ldcg: "temperature_sensor",
    ckmkzq: "garage",
    mcs: "window",
};
// DP code candidates in priority order
const DP_SWITCH = ["switch_1", "switch_led", "switch"];
const DP_BRIGHTNESS = ["bright_value_v2", "bright_value"];
const DP_COLOR_TEMP = ["temp_value_v2", "temp_value"];
const DP_COLOR = ["colour_data_v2", "colour_data"];
const DP_FAN_SPEED = ["fan_speed_enum", "fan_speed"];
class TuyaWebApi {
    constructor(accessId, accessSecret, region, log) {
        var _a, _b;
        this.accessId = accessId;
        this.accessSecret = accessSecret;
        this.log = log;
        this.session = new session_1.Session();
        this.deviceDpCodes = new Map();
        this.baseUrl = (_a = REGION_URLS[region]) !== null && _a !== void 0 ? _a : REGION_URLS.us;
        (_b = this.log) === null || _b === void 0 ? void 0 : _b.debug("Using Tuya IoT Platform base URL: %s", this.baseUrl);
    }
    // ─── Auth ────────────────────────────────────────────────────────────────────
    async getOrRefreshToken() {
        var _a, _b;
        if (this.session.hasValidToken()) {
            return;
        }
        if (!this.accessId) {
            throw new errors_1.AuthenticationError("No accessId configured");
        }
        if (!this.accessSecret) {
            throw new errors_1.AuthenticationError("No accessSecret configured");
        }
        const path = "/v1.0/token?grant_type=1";
        const t = Date.now().toString();
        const contentHash = this.sha256("");
        const stringToSign = ["GET", contentHash, "", path].join("\n");
        // Token requests do not include access_token in the signature string
        const signStr = this.accessId + t + stringToSign;
        const headers = {
            client_id: this.accessId,
            sign: this.hmacSHA256(this.accessSecret, signStr),
            t,
            sign_method: "HMAC-SHA256",
        };
        const res = await axios_1.default.get(`${this.baseUrl}${path}`, { headers });
        if (!res.data.success || !((_a = res.data.result) === null || _a === void 0 ? void 0 : _a.access_token)) {
            throw new errors_1.AuthenticationError(`Token request failed: ${JSON.stringify(res.data)}`);
        }
        const { access_token, expire_time } = res.data.result;
        this.session.set(access_token, expire_time);
        (_b = this.log) === null || _b === void 0 ? void 0 : _b.debug("Tuya token acquired, expires in %ds", expire_time);
        setTimeout(() => {
            void this.getOrRefreshToken();
        }, (expire_time - 60) * 1000);
    }
    // ─── Device discovery ────────────────────────────────────────────────────────
    async discoverDevices() {
        var _a, _b, _c;
        this.ensureToken();
        const devices = [];
        let lastRowKey = "";
        let hasMore = true;
        while (hasMore) {
            const path = `/v1.0/iot-01/associated-users/devices?last_row_key=${lastRowKey}&page_size=50`;
            const res = await this.get(path);
            if (!res.success) {
                throw new Error(`Device discovery failed: ${JSON.stringify(res)}`);
            }
            for (const d of res.result.devices) {
                this.deviceDpCodes.set(d.id, new Set(d.status.map((s) => s.code)));
                devices.push(this.mapDevice(d));
            }
            hasMore = (_a = res.result.has_more) !== null && _a !== void 0 ? _a : false;
            lastRowKey = (_b = res.result.last_row_key) !== null && _b !== void 0 ? _b : "";
        }
        (_c = this.log) === null || _c === void 0 ? void 0 : _c.debug("Discovered %d devices", devices.length);
        return devices;
    }
    async getAllDeviceStates() {
        return this.discoverDevices();
    }
    // ─── Device state ────────────────────────────────────────────────────────────
    async getDeviceState(deviceId) {
        this.ensureToken();
        const path = `/v1.0/devices/${deviceId}/status`;
        const res = await this.get(path);
        if (!res.success) {
            if (res.code === 2406) {
                throw new DeviceOfflineError_1.DeviceOfflineError();
            }
            throw new Error(`Get device state failed: ${JSON.stringify(res)}`);
        }
        this.deviceDpCodes.set(deviceId, new Set(res.result.map((s) => s.code)));
        return { ...this.statusToDeviceState(res.result), online: true };
    }
    async setDeviceState(deviceId, method, payload) {
        this.ensureToken();
        const commands = this.methodToCommands(deviceId, method, payload);
        if (commands.length === 0) {
            throw new errors_1.UnsupportedOperationError("Unsupported method", `No DP mapping for method: ${method}`);
        }
        const path = `/v1.0/devices/${deviceId}/commands`;
        const res = await this.post(path, { commands });
        if (!res.success) {
            if (res.code === 2406) {
                throw new DeviceOfflineError_1.DeviceOfflineError();
            }
            if (res.code === 2012) {
                throw new errors_1.RateLimitError("Requesting too quickly.", String(res.code));
            }
            if (res.code === 2009) {
                throw new errors_1.UnsupportedOperationError("Unsupported Operation", "The action is not valid for this device.");
            }
            throw new Error(`Set device state failed: ${JSON.stringify(res)}`);
        }
    }
    // ─── HTTP helpers ─────────────────────────────────────────────────────────────
    buildHeaders(method, path, body = "") {
        const t = Date.now().toString();
        const contentHash = this.sha256(body);
        const stringToSign = [method, contentHash, "", path].join("\n");
        const accessToken = this.session.accessToken;
        const signStr = this.accessId + accessToken + t + stringToSign;
        return {
            client_id: this.accessId,
            access_token: accessToken,
            sign: this.hmacSHA256(this.accessSecret, signStr),
            t,
            sign_method: "HMAC-SHA256",
        };
    }
    async get(path) {
        const headers = this.buildHeaders("GET", path);
        const res = await axios_1.default.get(`${this.baseUrl}${path}`, { headers });
        return res.data;
    }
    async post(path, body) {
        const bodyStr = JSON.stringify(body);
        const headers = this.buildHeaders("POST", path, bodyStr);
        const res = await axios_1.default.post(`${this.baseUrl}${path}`, body, {
            headers: { ...headers, "Content-Type": "application/json" },
        });
        return res.data;
    }
    ensureToken() {
        if (!this.session.hasValidToken()) {
            throw new Error("No valid token");
        }
    }
    // ─── Signing ──────────────────────────────────────────────────────────────────
    hmacSHA256(secret, str) {
        return crypto_1.default
            .createHmac("sha256", secret)
            .update(str)
            .digest("hex")
            .toUpperCase();
    }
    sha256(str) {
        return crypto_1.default.createHash("sha256").update(str).digest("hex").toLowerCase();
    }
    // ─── Translation helpers ──────────────────────────────────────────────────────
    pickCode(deviceId, candidates) {
        const codes = this.deviceDpCodes.get(deviceId);
        if (codes) {
            const found = candidates.find((c) => codes.has(c));
            if (found) {
                return found;
            }
        }
        return candidates[0];
    }
    methodToCommands(deviceId, method, payload) {
        const codes = this.deviceDpCodes.get(deviceId);
        switch (method) {
            case "turnOnOff": {
                const { value } = payload;
                const boolValue = value === 1;
                // Covers use the 'control' DP; switches/outlets/lights use switch_1 etc.
                if (codes === null || codes === void 0 ? void 0 : codes.has("control")) {
                    return [{ code: "control", value: boolValue ? "open" : "close" }];
                }
                return [{ code: this.pickCode(deviceId, DP_SWITCH), value: boolValue }];
            }
            case "brightnessSet": {
                const { value } = payload;
                return [{ code: this.pickCode(deviceId, DP_BRIGHTNESS), value }];
            }
            case "colorTemperatureSet": {
                const { value } = payload;
                return [{ code: this.pickCode(deviceId, DP_COLOR_TEMP), value }];
            }
            case "colorSet": {
                const { color } = payload;
                const code = this.pickCode(deviceId, DP_COLOR);
                // v2 uses object; v1 uses JSON string
                const colorValue = code.endsWith("_v2")
                    ? { h: color.hue, s: color.saturation, v: color.brightness }
                    : JSON.stringify({
                        h: color.hue,
                        s: color.saturation,
                        v: color.brightness,
                    });
                return [{ code, value: colorValue }];
            }
            case "windSpeedSet": {
                const { value } = payload;
                return [{ code: this.pickCode(deviceId, DP_FAN_SPEED), value }];
            }
            case "temperatureSet": {
                const { value } = payload;
                return [{ code: "temp_set", value }];
            }
            case "modeSet": {
                const { value } = payload;
                return [{ code: "mode", value }];
            }
            case "startStop": {
                if (codes === null || codes === void 0 ? void 0 : codes.has("control")) {
                    return [{ code: "control", value: "stop" }];
                }
                return [{ code: this.pickCode(deviceId, DP_SWITCH), value: false }];
            }
            default:
                return [];
        }
    }
    statusToDeviceState(status) {
        const state = {};
        for (const dp of status) {
            switch (dp.code) {
                case "switch_1":
                case "switch_led":
                case "switch":
                    state.state = dp.value;
                    break;
                case "bright_value_v2":
                case "bright_value":
                    state.brightness = dp.value;
                    break;
                case "temp_value_v2":
                case "temp_value":
                    state.color_temp = dp.value;
                    break;
                case "colour_data_v2":
                case "colour_data": {
                    const raw = dp.value;
                    let obj = null;
                    if (typeof raw === "object" && raw !== null) {
                        obj = raw;
                    }
                    else if (typeof raw === "string") {
                        try {
                            obj = JSON.parse(raw);
                        }
                        catch (_a) {
                            // ignore malformed colour_data
                        }
                    }
                    if (obj) {
                        state.color = {
                            hue: String(obj.h),
                            saturation: String(obj.s),
                            brightness: String(obj.v),
                        };
                    }
                    break;
                }
                case "work_mode":
                    // Tuya uses 'colour' (UK); map to our ColorModes
                    state.color_mode =
                        dp.value === "colour" ? "colour" : dp.value;
                    break;
                case "fan_speed_enum":
                case "fan_speed":
                    state.speed = dp.value;
                    break;
                case "mode":
                    state.mode = dp.value;
                    break;
                case "temp_current":
                    state.current_temperature = dp.value;
                    break;
                case "temp_set":
                    state.temperature = dp.value;
                    break;
                case "control":
                    // Cover: last-sent command → map to numeric CoverState for characteristic compat
                    if (dp.value === "open") {
                        state.state = response_1.CoverState.Opening;
                    }
                    else if (dp.value === "close") {
                        state.state = response_1.CoverState.Closing;
                    }
                    else if (dp.value === "stop") {
                        state.state = response_1.CoverState.Stopped;
                    }
                    break;
                case "percent_state":
                    // Cover current position (0=closed, 100=open)
                    {
                        const pct = dp.value;
                        if (pct >= 100) {
                            state.state = response_1.CoverState.Opening;
                        }
                        else if (pct <= 0) {
                            state.state = response_1.CoverState.Closing;
                        }
                        else {
                            state.state = response_1.CoverState.Stopped;
                        }
                    }
                    break;
                case "support_stop":
                    state.support_stop = dp.value;
                    break;
            }
        }
        return state;
    }
    mapDevice(d) {
        var _a;
        const devType = (_a = CATEGORY_MAP[d.category]) !== null && _a !== void 0 ? _a : "switch";
        const haType = response_1.HomeAssistantDeviceTypes.includes(devType)
            ? devType
            : "switch";
        return {
            id: d.id,
            name: d.name,
            dev_type: devType,
            ha_type: haType,
            data: {
                ...this.statusToDeviceState(d.status),
                online: d.online,
            },
        };
    }
}
exports.TuyaWebApi = TuyaWebApi;
//# sourceMappingURL=service.js.map
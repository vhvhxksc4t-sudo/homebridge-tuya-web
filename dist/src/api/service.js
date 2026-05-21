"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.TuyaWebApi = void 0;
const errors_1 = require("../errors");
const axios_1 = __importDefault(require("axios"));
const session_1 = require("./session");
const delay_1 = __importDefault(require("../helpers/delay"));
const DeviceOfflineError_1 = require("../errors/DeviceOfflineError");
const url_1 = require("url");
class TuyaWebApi {
    constructor(username, password, countryCode, tuyaPlatform = "tuya", log) {
        this.username = username;
        this.password = password;
        this.countryCode = countryCode;
        this.tuyaPlatform = tuyaPlatform;
        this.log = log;
        this.authBaseUrl = "https://px1.tuyaeu.com";
    }
    async getAllDeviceStates() {
        return this.discoverDevices();
    }
    async discoverDevices() {
        var _a, _b, _c;
        if (!((_a = this.session) === null || _a === void 0 ? void 0 : _a.hasValidToken())) {
            throw new Error("No valid token");
        }
        const { data } = await this.sendRequest("/homeassistant/skill", {
            header: {
                name: "Discovery",
                namespace: "discovery",
                payloadVersion: 1,
            },
            payload: {
                accessToken: this.session.accessToken,
            },
        }, "GET");
        if (((_b = data.header) === null || _b === void 0 ? void 0 : _b.code) === "SUCCESS") {
            return data.payload.devices;
        }
        else {
            if (((_c = data.header) === null || _c === void 0 ? void 0 : _c.code) === "FrequentlyInvoke") {
                throw new errors_1.RateLimitError("Requesting too quickly.", data.header.msg);
            }
            else {
                throw new Error(`No valid response from API: ${JSON.stringify(data)}`);
            }
        }
    }
    async getDeviceState(deviceId) {
        var _a, _b, _c;
        if (!((_a = this.session) === null || _a === void 0 ? void 0 : _a.hasValidToken())) {
            throw new Error("No valid token");
        }
        const { data } = await this.sendRequest("/homeassistant/skill", {
            header: {
                name: "QueryDevice",
                namespace: "query",
                payloadVersion: 1,
            },
            payload: {
                accessToken: this.session.accessToken,
                devId: deviceId,
                value: 1,
            },
        }, "GET");
        if (((_b = data.header) === null || _b === void 0 ? void 0 : _b.code) === "SUCCESS") {
            return data.payload.data;
        }
        else {
            if (((_c = data.header) === null || _c === void 0 ? void 0 : _c.code) === "FrequentlyInvoke") {
                throw new errors_1.RateLimitError("Requesting too quickly.", data.header.msg);
            }
            else {
                throw new Error(`No valid response from API: ${JSON.stringify(data)}`);
            }
        }
    }
    async setDeviceState(deviceId, method, payload) {
        var _a, _b, _c, _d, _e, _f;
        if (!((_a = this.session) === null || _a === void 0 ? void 0 : _a.hasValidToken())) {
            throw new Error("No valid token");
        }
        const { data } = await this.sendRequest("/homeassistant/skill", {
            header: {
                name: method,
                namespace: "control",
                payloadVersion: 1,
            },
            payload: {
                ...payload,
                accessToken: (_b = this.session) === null || _b === void 0 ? void 0 : _b.accessToken,
                devId: deviceId,
            },
        }, "POST");
        if (((_c = data.header) === null || _c === void 0 ? void 0 : _c.code) === "SUCCESS") {
            return;
        }
        else if (((_d = data.header) === null || _d === void 0 ? void 0 : _d.code) === "FrequentlyInvoke") {
            throw new errors_1.RateLimitError("Requesting too quickly.", data.header.msg);
        }
        else if (((_e = data.header) === null || _e === void 0 ? void 0 : _e.code) === "UnsupportedOperation") {
            throw new errors_1.UnsupportedOperationError("Unsupported Operation", "The action you tried to perform is not valid for the current device. Please disable it.");
        }
        else if (((_f = data.header) === null || _f === void 0 ? void 0 : _f.code) === "TargetOffline") {
            throw new DeviceOfflineError_1.DeviceOfflineError();
        }
        else {
            throw new Error(`Invalid payload in response: ${JSON.stringify(data)}`);
        }
    }
    async getOrRefreshToken(retryingAfterError = false) {
        var _a, _b, _c, _d, _e, _f, _g, _h;
        let data;
        if (!((_a = this.session) === null || _a === void 0 ? void 0 : _a.hasToken())) {
            (_b = this.log) === null || _b === void 0 ? void 0 : _b.debug("Requesting new token");
            // No token, lets get a token from the Tuya Web API
            if (!this.username) {
                throw new errors_1.AuthenticationError("No username configured");
            }
            if (!this.password) {
                throw new errors_1.AuthenticationError("No password configured");
            }
            if (!this.countryCode) {
                throw new errors_1.AuthenticationError("No country code configured");
            }
            const formData = new url_1.URLSearchParams({
                userName: this.username,
                password: this.password,
                countryCode: this.countryCode,
                bizType: this.tuyaPlatform,
                from: "tuya",
            }).toString();
            const contentLength = formData.length;
            data = (await (0, axios_1.default)({
                headers: {
                    "Content-Length": `${contentLength}`,
                    "Content-Type": "application/x-www-form-urlencoded",
                },
                url: "/homeassistant/auth.do",
                baseURL: this.authBaseUrl,
                data: formData,
                method: "POST",
            })).data;
        }
        else {
            (_c = this.log) === null || _c === void 0 ? void 0 : _c.debug("Refreshing token");
            // Refresh token
            data = (await this.sendRequest("/homeassistant/access.do?grant_type=refresh_token&refresh_token=" +
                this.session.refreshToken, {}, "GET")).data;
        }
        if (data.responseStatus === "error") {
            if (typeof data.errorMsg === "string" && !retryingAfterError) {
                // If we are requesting tokens too often we get an error: like "you cannot auth exceed once in 180 seconds"
                const matches = /you cannot auth exceed once in (\d+) seconds/.exec(data.errorMsg);
                if (matches) {
                    const waitTime = parseInt(matches[1]) + 5;
                    (_d = this.log) === null || _d === void 0 ? void 0 : _d.warn(`Cannot acquire token, waiting ${waitTime} seconds.`);
                    await (0, delay_1.default)(waitTime * 1000);
                    (_e = this.log) === null || _e === void 0 ? void 0 : _e.info("Retrying authentication after previous error.");
                    return this.getOrRefreshToken(true);
                }
            }
            throw new errors_1.AuthenticationError((_g = (_f = data.errorMsg) === null || _f === void 0 ? void 0 : _f.toString()) !== null && _g !== void 0 ? _g : JSON.stringify(data));
        }
        if (!session_1.Session.isValidSessionData(data)) {
            throw new errors_1.AuthenticationError(`Invalid session data: ${JSON.stringify(data)}`);
        }
        if (!((_h = this.session) === null || _h === void 0 ? void 0 : _h.hasToken())) {
            this.session = new session_1.Session(data.access_token, data.refresh_token, data.expires_in, data.access_token.substring(0, 2));
        }
        else {
            this.session.resetToken(data.access_token, data.refresh_token, data.expires_in);
        }
        setTimeout(() => {
            void this.getOrRefreshToken();
        }, (data.expires_in - 60 * 60) * 1000);
        return this.session;
    }
    /*
     * --------------------------------------
     * HTTP methods
     */
    async sendRequest(url, data, method) {
        var _a, _b;
        (_a = this.log) === null || _a === void 0 ? void 0 : _a.debug("Sending HTTP %s request to %s - Header: %s.", method, url, JSON.stringify(data.header));
        const response = await (0, axios_1.default)({
            baseURL: (_b = this.session) === null || _b === void 0 ? void 0 : _b.areaBaseUrl,
            url,
            data,
            method,
        });
        return { data: response.data };
    }
}
exports.TuyaWebApi = TuyaWebApi;
//# sourceMappingURL=service.js.map
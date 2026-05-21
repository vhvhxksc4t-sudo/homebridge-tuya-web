"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Session = void 0;
class Session {
    static isValidSessionData(data) {
        return (typeof data.access_token === "string" &&
            typeof data.refresh_token === "string" &&
            typeof data.expires_in === "number");
    }
    constructor(_accessToken, _refreshToken, expiresIn, _areaCode) {
        this._accessToken = _accessToken;
        this._refreshToken = _refreshToken;
        this.expiresIn = expiresIn;
        this._areaCode = _areaCode;
        this.areaCode = _areaCode;
        this.resetToken(_accessToken, _refreshToken, expiresIn);
    }
    get accessToken() {
        return this._accessToken;
    }
    get areaBaseUrl() {
        return this._areaBaseUrl;
    }
    get refreshToken() {
        return this._refreshToken;
    }
    set areaCode(newAreaCode) {
        const areaCodeLookup = {
            AY: "https://px1.tuyacn.com",
            EU: "https://px1.tuyaeu.com",
            US: "https://px1.tuyaus.com",
        };
        this._areaCode = newAreaCode;
        this._areaBaseUrl =
            newAreaCode in areaCodeLookup
                ? areaCodeLookup[newAreaCode]
                : areaCodeLookup.US;
    }
    resetToken(accessToken, refreshToken, expiresIn) {
        this._accessToken = accessToken;
        this._refreshToken = refreshToken;
        this.expiresOn = Session.getCurrentEpoch() + expiresIn;
    }
    hasToken() {
        return !!this._accessToken;
    }
    isTokenExpired() {
        return this.expiresOn < Session.getCurrentEpoch();
    }
    hasValidToken() {
        return this.hasToken() && !this.isTokenExpired();
    }
    static getCurrentEpoch() {
        return Math.round(new Date().getTime() / 1000);
    }
}
exports.Session = Session;
//# sourceMappingURL=session.js.map
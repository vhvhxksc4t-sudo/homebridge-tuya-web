"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Session = void 0;
class Session {
    constructor() {
        this._accessToken = "";
        this._expireAt = 0;
    }
    get accessToken() {
        return this._accessToken;
    }
    set(accessToken, expireIn) {
        this._accessToken = accessToken;
        this._expireAt = Date.now() + (expireIn - 60) * 1000;
    }
    hasValidToken() {
        return !!this._accessToken && Date.now() < this._expireAt;
    }
    reset() {
        this._accessToken = "";
        this._expireAt = 0;
    }
}
exports.Session = Session;
//# sourceMappingURL=session.js.map
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = delay;
/**
 * Delay for a given time
 * @param t time in ms
 */
function delay(t) {
    return new Promise((resolve) => {
        setTimeout(() => {
            resolve();
        }, t);
    });
}
//# sourceMappingURL=delay.js.map
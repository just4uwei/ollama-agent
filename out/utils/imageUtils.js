"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.imageToBase64 = imageToBase64;
exports.base64ToBuffer = base64ToBuffer;
exports.processImageFromUri = processImageFromUri;
function imageToBase64(imagePath) {
    const fs = require('fs');
    const buffer = fs.readFileSync(imagePath);
    return buffer.toString('base64');
}
function base64ToBuffer(base64) {
    return Buffer.from(base64, 'base64');
}
async function processImageFromUri(uri) {
    // If it's a data URL, extract base64
    if (uri.startsWith('data:')) {
        const base64 = uri.split(',')[1];
        return base64;
    }
    // If it's a file path, read and convert
    const fs = require('fs');
    const buffer = fs.readFileSync(uri);
    return buffer.toString('base64');
}
//# sourceMappingURL=imageUtils.js.map
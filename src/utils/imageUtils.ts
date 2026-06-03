export function imageToBase64(imagePath: string): string {
    const fs = require('fs');
    const buffer = fs.readFileSync(imagePath);
    return buffer.toString('base64');
}

export function base64ToBuffer(base64: string): Buffer {
    return Buffer.from(base64, 'base64');
}

export async function processImageFromUri(uri: string): Promise<string> {
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

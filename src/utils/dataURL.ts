import fs from "fs";
import path from "path";

export function base64ToArrayBuffer(base64: string): ArrayBuffer {
    if (typeof window !== "undefined" && window.atob) {
        // Browser version
        const binstr = window.atob(base64);
        const len = binstr.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) {
            bytes[i] = binstr.charCodeAt(i);
        }
        return bytes.buffer;
    } else {
        // Node.js/Bun version
        const bytes = Buffer.from(base64, 'base64');
        return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    }
}

export function dataURLToArrayBuffer(url: string): ArrayBuffer {
    return base64ToArrayBuffer(url.split(",")[1]);
}


export function download(filename: string, url: string) {
    // If it's a data URL, extract and save the data
    if (url.startsWith('data:')) {
        const matches = url.match(/^data:([^;]+);base64,(.+)$/);
        if (matches) {
            const base64Data = matches[2];
            const buffer = Buffer.from(base64Data, 'base64');
            fs.writeFileSync(filename, buffer);
        }
    } else {
        // If it's a file path, just copy it
        fs.copyFileSync(url, filename);
    }
}

export function downloadText(filename: string, text: string) {
    download(filename, "data:text/plain;charset=utf-8," + text);
}

export function downloadJSON(filename: string, data: any) {
    downloadText(filename, JSON.stringify(data));
}

export function downloadBlob(filename: string, blob: Blob) {
    const url = URL.createObjectURL(blob);
    download(filename, url);
    URL.revokeObjectURL(url);
}

export const isDataURL = (str: string) => str.match(/^data:\w+\/\w+;base64,.+/);

export const getFileName = (p: string) => p.split(".").slice(0, -1).join(".");

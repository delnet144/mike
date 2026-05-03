/**
 * Local filesystem storage for single-player mode.
 * Reads / writes files from the local data/ directory.
 */
import * as fs from "fs";
import * as path from "path";

const DATA_DIR = path.resolve(process.cwd(), "data", "storage");
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

export const storageEnabled = true;

export async function uploadFile(
    key: string,
    content: ArrayBuffer,
    contentType: string,
): Promise<void> {
    const fullPath = path.join(DATA_DIR, key);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, Buffer.from(content));
    // Save content type sidecar
    fs.writeFileSync(fullPath + ".meta.json", JSON.stringify({ contentType, createdAt: new Date().toISOString() }));
}

export async function downloadFile(key: string): Promise<ArrayBuffer | null> {
    const fullPath = path.join(DATA_DIR, key);
    if (!fs.existsSync(fullPath)) return null;
    const buf = fs.readFileSync(fullPath);
    return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
}

export async function deleteFile(key: string): Promise<void> {
    const fullPath = path.join(DATA_DIR, key);
    if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath);
    const meta = fullPath + ".meta.json";
    if (fs.existsSync(meta)) fs.unlinkSync(meta);
}

export async function getSignedUrl(
    key: string,
    _expiresIn = 3600,
    downloadFilename?: string,
): Promise<string | null> {
    const fullPath = path.join(DATA_DIR, key);
    if (!fs.existsSync(fullPath)) return null;
    // Return local direct path that the backend will serve
    return `/api/storage/${key}` + (downloadFilename ? `?download=${encodeURIComponent(downloadFilename)}` : "");
}

export function normalizeDownloadFilename(name: string): string {
    const trimmed = name.trim();
    const base = trimmed || "download";
    return base.replace(/[\x00-\x1F\x7F]/g, "_").replace(/[\\/]/g, "_");
}

export function sanitizeDispositionFilename(name: string): string {
    return normalizeDownloadFilename(name).replace(/["\\]/g, "_");
}

export function encodeRFC5987(str: string): string {
    return encodeURIComponent(str).replace(
        /['()*]/g,
        (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase(),
    );
}

export function buildContentDisposition(
    kind: "inline" | "attachment",
    filename: string,
): string {
    const normalized = normalizeDownloadFilename(filename);
    return `${kind}; filename="${sanitizeDispositionFilename(normalized)}"; filename*=UTF-8''${encodeRFC5987(normalized)}`;
}

export function storageKey(userId: string, docId: string, filename: string): string {
    return `documents/${userId}/${docId}/source${storageExtension(filename, ".bin")}`;
}

export function pdfStorageKey(userId: string, docId: string, stem: string): string {
    return `documents/${userId}/${docId}/${stem}.pdf`;
}

export function generatedDocKey(userId: string, docId: string, filename: string): string {
    return `generated/${userId}/${docId}/generated${storageExtension(filename, ".docx")}`;
}

export function versionStorageKey(userId: string, docId: string, versionSlug: string, filename: string): string {
    return `documents/${userId}/${docId}/versions/${versionSlug}${storageExtension(filename, ".bin")}`;
}

function storageExtension(filename: string, fallback: string): string {
    const lastDot = filename.lastIndexOf(".");
    if (lastDot < 0) return fallback;
    const ext = filename.slice(lastDot).toLowerCase();
    return /^\.[a-z0-9]{1,16}$/.test(ext) ? ext : fallback;
}

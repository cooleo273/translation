/**
 * Short-lived tokens for binary downloads (e.g. translated Excel).
 * In-memory MVP only — same limitations as upload-store.
 */
import { randomBytes } from "node:crypto";

const TTL_MS = 30 * 60 * 1000;

export interface DownloadRecord {
  data: Buffer;
  fileName: string;
  mimeType: string;
  createdAt: number;
}

const store = new Map<string, DownloadRecord>();

function prune(): void {
  const now = Date.now();
  store.forEach((rec, id) => {
    if (now - rec.createdAt > TTL_MS) store.delete(id);
  });
}

export function createDownloadToken(record: Omit<DownloadRecord, "createdAt">): string {
  prune();
  const id = randomBytes(24).toString("hex");
  store.set(id, { ...record, createdAt: Date.now() });
  return id;
}

export function peekDownload(token: string): DownloadRecord | undefined {
  prune();
  const rec = store.get(token);
  if (!rec) return undefined;
  if (Date.now() - rec.createdAt > TTL_MS) {
    store.delete(token);
    return undefined;
  }
  return rec;
}

export function takeDownload(
  token: string,
): DownloadRecord | undefined {
  prune();
  const rec = store.get(token);
  if (!rec) return undefined;
  if (Date.now() - rec.createdAt > TTL_MS) {
    store.delete(token);
    return undefined;
  }
  store.delete(token);
  return rec;
}

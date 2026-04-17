/**
 * In-memory upload staging for MVP only.
 * Not safe for multi-instance deployments or serverless scale-to-zero.
 */
import type { UploadRecord } from "./types";

const TTL_MS = 30 * 60 * 1000;

const store = new Map<string, UploadRecord>();

function pruneExpired(): void {
  const now = Date.now();
  store.forEach((rec, id) => {
    if (now - rec.createdAt > TTL_MS) {
      store.delete(id);
    }
  });
}

export function saveUpload(record: UploadRecord): string {
  pruneExpired();
  const id = crypto.randomUUID();
  store.set(id, record);
  return id;
}

export function takeUpload(id: string): UploadRecord | undefined {
  pruneExpired();
  const rec = store.get(id);
  if (!rec) return undefined;
  if (Date.now() - rec.createdAt > TTL_MS) {
    store.delete(id);
    return undefined;
  }
  return rec;
}

export function deleteUpload(id: string): void {
  store.delete(id);
}

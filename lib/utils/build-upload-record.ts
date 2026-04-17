import type { UploadRecord } from "@/lib/types";
import {
  extensionToCategory,
  extensionToKind,
  getExtension,
  isAllowedExtension,
} from "@/lib/validation";

export function buildUploadRecord(fileName: string, buffer: Buffer): UploadRecord {
  const ext = getExtension(fileName);
  if (!isAllowedExtension(ext)) {
    throw new Error("Unsupported file type.");
  }
  return {
    buffer,
    fileName,
    mimeType: "application/octet-stream",
    category: extensionToCategory(ext),
    kind: extensionToKind(ext),
    createdAt: Date.now(),
  };
}

import type { FileKind, MediaCategory } from "./types";

export const MAX_BYTES = 10 * 1024 * 1024;

/** HTML file input `accept` attribute */
export const CLIENT_ACCEPT_ATTR = [
  ".pdf",
  ".docx",
  ".txt",
  ".mp3",
  ".wav",
  ".mp4",
  ".mov",
  ".jpg",
  ".jpeg",
  ".png",
  ".xlsx",
  ".csv",
].join(",");

export const ALLOWED_EXTENSIONS = [
  ".pdf",
  ".docx",
  ".txt",
  ".mp3",
  ".wav",
  ".mp4",
  ".mov",
  ".jpg",
  ".jpeg",
  ".png",
  ".xlsx",
  ".csv",
] as const;

export type AllowedExtension = (typeof ALLOWED_EXTENSIONS)[number];

export function getExtension(filename: string): string {
  const i = filename.lastIndexOf(".");
  return i === -1 ? "" : filename.slice(i).toLowerCase();
}

export function isAllowedExtension(ext: string): ext is AllowedExtension {
  return (ALLOWED_EXTENSIONS as readonly string[]).includes(ext);
}

export function extensionToCategory(ext: AllowedExtension): MediaCategory {
  switch (ext) {
    case ".pdf":
    case ".docx":
    case ".txt":
      return "document";
    case ".mp3":
    case ".wav":
      return "audio";
    case ".mp4":
    case ".mov":
      return "video";
    case ".jpg":
    case ".jpeg":
    case ".png":
      return "image";
    case ".xlsx":
    case ".csv":
      return "spreadsheet";
  }
}

export function extensionToKind(ext: AllowedExtension): FileKind {
  switch (ext) {
    case ".pdf":
      return "pdf";
    case ".docx":
      return "docx";
    case ".txt":
      return "txt";
    case ".mp3":
      return "mp3";
    case ".wav":
      return "wav";
    case ".mp4":
      return "mp4";
    case ".mov":
      return "mov";
    case ".jpg":
      return "jpg";
    case ".jpeg":
      return "jpeg";
    case ".png":
      return "png";
    case ".xlsx":
      return "xlsx";
    case ".csv":
      return "csv";
  }
}

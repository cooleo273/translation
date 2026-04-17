/** Phase 1 document extraction (pdf, docx, txt) */
export type DocumentKind = "pdf" | "docx" | "txt";

export type AudioKind = "mp3" | "wav";
export type VideoKind = "mp4" | "mov";
export type ImageKind = "jpg" | "jpeg" | "png";
export type SpreadsheetKind = "xlsx" | "csv";

/** All supported upload kinds */
export type FileKind =
  | DocumentKind
  | AudioKind
  | VideoKind
  | ImageKind
  | SpreadsheetKind;

export type MediaCategory =
  | "document"
  | "audio"
  | "video"
  | "image"
  | "spreadsheet";

export interface UploadRecord {
  buffer: Buffer;
  fileName: string;
  mimeType: string;
  category: MediaCategory;
  kind: FileKind;
  createdAt: number;
}

export interface UploadResponse {
  uploadId: string;
  fileName: string;
  size: number;
  category: MediaCategory;
}

export interface TranslateResponse {
  originalText: string;
  translatedText: string;
  detectedLanguage: string;
  confidence: number;
}

export interface ApiErrorBody {
  error: string;
}

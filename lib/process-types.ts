import type { TranscriptSegment } from "./services/transcription-service";

export type ProcessStep =
  | "uploading"
  | "extracting"
  | "extracting_audio"
  | "transcribing"
  | "ocr"
  | "translating"
  | "spreadsheet"
  | "subtitles"
  | "processing"
  | "completed"
  | "error";

export interface DocumentProcessPayload {
  category: "document";
  originalText: string;
  translatedText: string;
  detectedLanguage: string;
  confidence: number;
}

export interface AudioProcessPayload {
  category: "audio";
  /** Formatted lines: Speaker (time): text */
  transcript: string;
  /** Verbatim speech for search / translation (no speaker labels). */
  transcriptPlain: string;
  segments: TranscriptSegment[];
  timestamps: TranscriptSegment[];
  translatedText: string;
  detectedLanguage: string;
  confidence: number;
  speechLanguage?: string;
}

export interface VideoProcessPayload {
  category: "video";
  transcript: string;
  transcriptPlain: string;
  segments: TranscriptSegment[];
  translatedText: string;
  detectedLanguage: string;
  confidence: number;
  speechLanguage?: string;
  srtOriginal: string;
  srtEnglish: string;
}

export interface ImageProcessPayload {
  category: "image";
  originalText: string;
  translatedText: string;
  detectedLanguage: string;
  confidence: number;
}

export interface SpreadsheetProcessPayload {
  category: "spreadsheet";
  downloadToken: string;
  downloadFileName: string;
}

export type ProcessPayload =
  | DocumentProcessPayload
  | AudioProcessPayload
  | VideoProcessPayload
  | ImageProcessPayload
  | SpreadsheetProcessPayload;

export interface ProcessStreamEvent {
  step: ProcessStep;
  detail?: string;
  payload?: ProcessPayload;
  message?: string;
}

export function isVideoPayload(
  p: ProcessPayload,
): p is VideoProcessPayload {
  return p.category === "video";
}

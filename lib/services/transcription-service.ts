import type { GeminiTranscriptionParse } from "@/lib/ai";
import { transcribeAudioWithGemini } from "@/lib/ai";
import {
  AUDIO_TRANSCRIBE_CHUNK_SECONDS,
  extractAudioChunkAsWav,
  probeAudioDurationSeconds,
} from "@/lib/services/audio-chunks";

export interface TranscriptSegment {
  start: number;
  end: number;
  text: string;
  speaker?: string;
}

export interface TranscriptionResult {
  /**
   * Human-readable transcript: `Speaker 1 (HH:MM:SS.mmm): …` per line when segments exist.
   */
  transcript: string;
  /** Verbatim speech only (for language detection and translation). */
  transcriptPlain: string;
  segments: TranscriptSegment[];
  /** Same as segments (API compatibility). */
  timestamps: TranscriptSegment[];
  language?: string;
}

function guessMime(fileName: string): string {
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".mp3")) return "audio/mpeg";
  if (lower.endsWith(".wav")) return "audio/wav";
  if (lower.endsWith(".m4a")) return "audio/mp4";
  if (lower.endsWith(".webm")) return "audio/webm";
  if (lower.endsWith(".mp4")) return "audio/mp4";
  return "application/octet-stream";
}

/** Wall-clock time from chunk start, with millisecond precision. */
export function formatTimestampHmsMs(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) seconds = 0;
  const ms = Math.min(999, Math.max(0, Math.round((seconds % 1) * 1000)));
  const totalSecs = Math.floor(seconds);
  const h = Math.floor(totalSecs / 3600);
  const m = Math.floor((totalSecs % 3600) / 60);
  const s = totalSecs % 60;
  const pad = (n: number, w: number) => n.toString().padStart(w, "0");
  return `${pad(h, 2)}:${pad(m, 2)}:${pad(s, 2)}.${pad(ms, 3)}`;
}

export function formatTranscriptDiarized(segments: TranscriptSegment[]): string {
  return segments
    .filter((s) => s.text.trim())
    .map((s) => {
      const label = s.speaker?.trim() || "Speaker 1";
      const ts = formatTimestampHmsMs(s.start);
      return `${label} (${ts}): ${s.text.trim()}`;
    })
    .join("\n");
}

function mergeGeminiChunks(
  parts: Array<{ offsetSec: number; raw: GeminiTranscriptionParse }>,
): GeminiTranscriptionParse {
  const merged: GeminiTranscriptionParse["segments"] = [];
  let language: string | undefined;

  for (const { offsetSec, raw } of parts) {
    if (raw.language) language = raw.language;
    for (const s of raw.segments) {
      if (!s.text.trim()) continue;
      merged.push({
        start: s.start + offsetSec,
        end: s.end + offsetSec,
        text: s.text.trim(),
        ...(s.speaker ? { speaker: s.speaker } : {}),
      });
    }
  }

  merged.sort((a, b) => a.start - b.start || a.end - b.end);

  return {
    transcript: "",
    segments: merged,
    language,
  };
}

/**
 * Transcribe audio using Gemini multimodal API (same keys as translation).
 * Long files are split into chunks so the full duration is covered.
 */
export async function transcribeAudio(
  buffer: Buffer,
  fileName: string,
): Promise<TranscriptionResult> {
  const mime = guessMime(fileName);
  let raw: GeminiTranscriptionParse;

  const durationSec = await probeAudioDurationSeconds(buffer, fileName);
  const chunkSec = AUDIO_TRANSCRIBE_CHUNK_SECONDS;
  const longEnoughToChunk =
    durationSec !== null && durationSec > chunkSec + 1;

  if (longEnoughToChunk && durationSec !== null) {
    const dur = durationSec;
    const parts: Array<{ offsetSec: number; raw: GeminiTranscriptionParse }> = [];
    for (let offset = 0; offset < dur; offset += chunkSec) {
      const len = Math.min(chunkSec, dur - offset);
      const chunkBuf = await extractAudioChunkAsWav(buffer, fileName, offset, len);
      const part = await transcribeAudioWithGemini(chunkBuf, "audio/wav");
      parts.push({ offsetSec: offset, raw: part });
    }
    raw = mergeGeminiChunks(parts);
  } else {
    raw = await transcribeAudioWithGemini(buffer, mime);
  }

  const segments: TranscriptSegment[] = raw.segments
    .map((s) => ({
      start: s.start,
      end: s.end,
      text: s.text.trim(),
      ...(s.speaker ? { speaker: s.speaker } : {}),
    }))
    .filter((s) => s.text);

  const transcriptPlain =
    segments.length > 0
      ? segments.map((s) => s.text).join(" ")
      : raw.transcript.trim();

  const transcript =
    segments.length > 0
      ? formatTranscriptDiarized(segments)
      : transcriptPlain;

  if (!transcriptPlain && segments.length === 0) {
    throw new Error("Transcription returned no text.");
  }

  return {
    transcript: transcript || transcriptPlain,
    transcriptPlain: transcriptPlain || transcript,
    segments,
    timestamps: segments,
    language: raw.language,
  };
}

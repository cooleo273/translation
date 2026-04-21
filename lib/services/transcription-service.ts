import type { GeminiTranscriptionParse } from "@/lib/ai";
import {
  detectPrimarySpokenLanguageFromAudio,
  transcribeAudioWithGemini,
} from "@/lib/ai";
import { normalizeIso6391 } from "@/lib/language-codes";
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
  /** ISO 639-1 from a listen-only Gemini pass on the waveform (more reliable than text). */
  audioLanguageCode?: string;
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
  const mergedSegments: GeminiTranscriptionParse["segments"] = [];
  const transcripts: string[] = [];
  const langVotes = new Map<string, number>();

  for (const { offsetSec, raw } of parts) {
    const code = normalizeIso6391(raw.language ?? undefined);
    if (code) {
      langVotes.set(code, (langVotes.get(code) ?? 0) + 1);
    }

    if (raw.segments.length > 0) {
      for (const s of raw.segments) {
        if (!s.text.trim()) continue;
        mergedSegments.push({
          start: s.start + offsetSec,
          end: s.end + offsetSec,
          text: s.text.trim(),
          ...(s.speaker ? { speaker: s.speaker } : {}),
        });
      }
    } else if (raw.transcript.trim()) {
      // Fallback if model didn't return segments for this chunk
      transcripts.push(raw.transcript.trim());
    }
  }

  mergedSegments.sort((a, b) => a.start - b.start || a.end - b.end);

  let language: string | undefined;
  if (langVotes.size > 0) {
    const best = Array.from(langVotes.entries()).sort((a, b) => b[1] - a[1])[0];
    language = best[0];
  }

  const combinedTranscript =
    mergedSegments.length > 0
      ? mergedSegments.map((s) => s.text).join(" ")
      : transcripts.join(" ");

  return {
    transcript: combinedTranscript,
    segments: mergedSegments,
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

  let audioLanguageCode: string | undefined;
  try {
    if (longEnoughToChunk && durationSec !== null) {
      const len = Math.min(chunkSec, durationSec);
      const chunk0 = await extractAudioChunkAsWav(buffer, fileName, 0, len);
      const code = await detectPrimarySpokenLanguageFromAudio(chunk0, "audio/wav");
      if (code) audioLanguageCode = code;
    } else {
      const code = await detectPrimarySpokenLanguageFromAudio(buffer, mime);
      if (code) audioLanguageCode = code;
    }
  } catch (e) {
    console.warn("[spoken-language from audio]", e);
  }

  if (longEnoughToChunk && durationSec !== null) {
    const dur = durationSec;
    const parts: Array<{ offsetSec: number; raw: GeminiTranscriptionParse }> = [];
    for (let offset = 0; offset < dur; offset += chunkSec) {
      const len = Math.min(chunkSec, dur - offset);
      const chunkBuf = await extractAudioChunkAsWav(buffer, fileName, offset, len);
      const part = await transcribeAudioWithGemini(chunkBuf, "audio/wav", {
        languageHintIso6391: audioLanguageCode,
      });
      parts.push({ offsetSec: offset, raw: part });
    }
    raw = mergeGeminiChunks(parts);
  } else {
    raw = await transcribeAudioWithGemini(buffer, mime, {
      languageHintIso6391: audioLanguageCode,
    });
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
    audioLanguageCode,
  };
}

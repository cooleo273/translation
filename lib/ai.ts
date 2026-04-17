import {
  GoogleGenerativeAI,
  GoogleGenerativeAIFetchError,
} from "@google/generative-ai";

const DETECT_SAMPLE_CHARS = 4000;

function getConfiguredApiKeys(): string[] {
  const raw = [
    process.env.GEMINI_API_KEY_1,
    process.env.GEMINI_API_KEY_2,
    process.env.GEMINI_API_KEY_3,
  ];
  return raw
    .filter((k): k is string => typeof k === "string" && k.trim().length > 0)
    .map((k) => k.trim());
}

function getModelId(): string {
  return process.env.GEMINI_MODEL ?? "gemini-2.0-flash";
}

function isRateLimitError(err: unknown): boolean {
  if (err instanceof GoogleGenerativeAIFetchError && err.status === 429) {
    return true;
  }
  if (err && typeof err === "object") {
    const status = (err as { status?: number }).status;
    if (status === 429) return true;
    const msg = String((err as Error).message ?? "");
    if (
      /429|RESOURCE_EXHAUSTED|quota exceeded|rate limit|Too Many Requests/i.test(
        msg,
      )
    ) {
      return true;
    }
  }
  return false;
}

/**
 * Runs an operation with Gemini, rotating through GEMINI_API_KEY_1..3 when a key hits rate limits.
 */
async function withKeyRotation<T>(
  run: (genAI: GoogleGenerativeAI) => Promise<T>,
): Promise<T> {
  const keys = getConfiguredApiKeys();
  if (keys.length === 0) {
    throw new Error(
      "No Gemini API keys configured. Set GEMINI_API_KEY_1 (and optionally GEMINI_API_KEY_2, GEMINI_API_KEY_3).",
    );
  }

  let lastError: unknown;
  for (let i = 0; i < keys.length; i++) {
    const genAI = new GoogleGenerativeAI(keys[i]);
    try {
      return await run(genAI);
    } catch (e) {
      lastError = e;
      if (isRateLimitError(e) && i < keys.length - 1) {
        console.warn(
          `[gemini] Rate limit or quota on API key ${i + 1}, trying next key…`,
        );
        continue;
      }
      throw e;
    }
  }
  throw lastError;
}

export interface DetectionResult {
  detectedLanguage: string;
  confidence: number;
}

export async function detectLanguage(
  textSample: string,
): Promise<DetectionResult> {
  const sample = textSample.slice(0, DETECT_SAMPLE_CHARS);

  const raw = await withKeyRotation(async (genAI) => {
    const model = genAI.getGenerativeModel({
      model: getModelId(),
      systemInstruction:
        'You detect the primary human language of the given text. Reply with JSON only: {"detectedLanguage":"English name of the language","confidence":number between 0 and 1}',
      generationConfig: {
        responseMimeType: "application/json",
      },
    });
    const result = await model.generateContent(sample);
    return result.response.text().trim();
  });

  if (!raw) {
    throw new Error("Language detection returned empty response.");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("Language detection returned invalid JSON.");
  }

  if (
    typeof parsed !== "object" ||
    parsed === null ||
    !("detectedLanguage" in parsed) ||
    !("confidence" in parsed)
  ) {
    throw new Error("Language detection response shape was unexpected.");
  }

  const p = parsed as { detectedLanguage: unknown; confidence: unknown };
  const detectedLanguage =
    typeof p.detectedLanguage === "string" ? p.detectedLanguage.trim() : "";
  const confidence =
    typeof p.confidence === "number" && Number.isFinite(p.confidence)
      ? Math.min(1, Math.max(0, p.confidence))
      : 0;

  if (!detectedLanguage) {
    throw new Error("Could not determine document language.");
  }

  return { detectedLanguage, confidence };
}

export type TranslationMode =
  | "standard"
  | "formal"
  | "casual"
  | "technical"
  | "legal";

export interface TranslateOptions {
  /** Target language name, e.g. "English", "Spanish" */
  targetLanguage?: string;
  mode?: TranslationMode;
  /** Extra user instructions, e.g. "Translate as a legal contract" */
  customInstructions?: string;
  /** From automatic document classification */
  documentTypeHint?: string;
}

/** Options for document pipeline (SaaS); when omitted, Phase-1 behavior is preserved. */
export interface DocumentPipelineTranslation extends TranslateOptions {
  /** When true (default), classify document type for tone. Set false to skip extra call. */
  autoDetectDocumentType?: boolean;
}

const MODE_INSTRUCTION: Record<TranslationMode, string> = {
  standard:
    "Use a clear, natural register suitable for general readers.",
  formal:
    "Use formal register: polished, professional, suitable for business or official correspondence.",
  casual:
    "Use a natural, conversational tone while staying faithful to meaning.",
  technical:
    "Preserve technical terms where standard; use precise terminology. Keep structure for procedures, specs, or manuals.",
  legal:
    "Use careful legal drafting style: defined terms, clarity, and conservative wording appropriate for contracts or policies.",
};

function buildSystemInstruction(opts: TranslateOptions): string {
  const target = opts.targetLanguage?.trim() || "English";
  const mode: TranslationMode = opts.mode ?? "standard";
  const parts = [
    `You are an expert translator. Translate the user's text into ${target}.`,
    MODE_INSTRUCTION[mode],
    opts.documentTypeHint
      ? `The document appears to be: ${opts.documentTypeHint}. Adjust tone and terminology accordingly.`
      : "",
    opts.customInstructions?.trim()
      ? `Additional instructions from the user: ${opts.customInstructions.trim()}`
      : "",
    "Preserve paragraph breaks, numbered/bullet lists, and line breaks.",
    "Do not add markdown unless the source clearly uses it.",
    "Output only the translated text, with no preamble or explanation.",
  ];
  return parts.filter(Boolean).join("\n");
}

/**
 * Detect high-level document type for tone (short excerpt).
 */
export async function detectDocumentType(textSample: string): Promise<string> {
  const sample = textSample.slice(0, 6000);
  const raw = await withKeyRotation(async (genAI) => {
    const model = genAI.getGenerativeModel({
      model: getModelId(),
      systemInstruction:
        'Classify the document. Reply with JSON only: {"documentType":"short label e.g. legal contract, marketing email, technical manual, academic paper, invoice, general"}',
      generationConfig: { responseMimeType: "application/json" },
    });
    const result = await model.generateContent(sample);
    return result.response.text().trim();
  });
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return "general";
  }
  if (
    typeof parsed === "object" &&
    parsed !== null &&
    "documentType" in parsed &&
    typeof (parsed as { documentType: unknown }).documentType === "string"
  ) {
    return (parsed as { documentType: string }).documentType.trim() || "general";
  }
  return "general";
}

export async function translateWithOptions(
  originalText: string,
  options: TranslateOptions = {},
): Promise<string> {
  const systemInstruction = buildSystemInstruction(options);
  const translated = await withKeyRotation(async (genAI) => {
    const model = genAI.getGenerativeModel({
      model: getModelId(),
      systemInstruction,
    });
    const result = await model.generateContent(originalText);
    return result.response.text().trim();
  });

  if (!translated) {
    throw new Error("Translation returned empty response.");
  }

  return translated;
}

/** Default Phase-1 behavior: English, standard mode. */
export async function translateToEnglish(originalText: string): Promise<string> {
  return translateWithOptions(originalText, {
    targetLanguage: "English",
    mode: "standard",
  });
}

export interface LineBatchTranslateOptions {
  targetLanguage?: string;
  mode?: TranslationMode;
}

/**
 * Translate many short strings in one call (e.g. subtitle lines), preserving order and count.
 */
export async function translateTextsPreservingOrder(
  lines: string[],
  lineOptions?: LineBatchTranslateOptions,
): Promise<string[]> {
  if (lines.length === 0) return [];
  const payload = lines.map((t, i) => ({ i: i + 1, text: t }));
  const target = lineOptions?.targetLanguage?.trim() || "English";
  const mode: TranslationMode = lineOptions?.mode ?? "standard";

  const raw = await withKeyRotation(async (genAI) => {
    const model = genAI.getGenerativeModel({
      model: getModelId(),
      systemInstruction:
        `Translate each item's "text" into ${target}. Style: ${MODE_INSTRUCTION[mode]}. Preserve count and order. Reply with JSON only: {"lines":[{"i":number,"text":"translation"}]}`,
      generationConfig: {
        responseMimeType: "application/json",
      },
    });
    const result = await model.generateContent(JSON.stringify(payload));
    return result.response.text().trim();
  });

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("Batch translation returned invalid JSON.");
  }
  if (
    typeof parsed !== "object" ||
    parsed === null ||
    !("lines" in parsed) ||
    !Array.isArray((parsed as { lines: unknown }).lines)
  ) {
    throw new Error("Batch translation response shape was unexpected.");
  }

  const out: string[] = new Array(lines.length).fill("");
  for (const row of (parsed as { lines: Array<{ i?: unknown; text?: unknown }> })
    .lines) {
    if (
      typeof row?.i === "number" &&
      row.i >= 1 &&
      row.i <= lines.length &&
      typeof row.text === "string"
    ) {
      out[row.i - 1] = row.text;
    }
  }
  if (out.some((s) => !s.trim()) && lines.some((l) => l.trim())) {
    throw new Error("Batch translation did not return all lines.");
  }
  return out;
}

function parseJsonFromModel(text: string): unknown {
  let t = text.trim();
  if (t.startsWith("```")) {
    t = t.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "");
  }
  return JSON.parse(t);
}

export interface GeminiTranscriptionSegment {
  start: number;
  end: number;
  text: string;
  /** e.g. "Speaker 1" — from the model when multiple voices are present */
  speaker?: string;
}

export interface GeminiTranscriptionParse {
  transcript: string;
  segments: GeminiTranscriptionSegment[];
  language?: string;
}

/**
 * Transcribe audio using Gemini multimodal input (same API keys as translation).
 * Timestamps are model-estimated; quality depends on the chosen GEMINI_MODEL.
 */
export async function transcribeAudioWithGemini(
  buffer: Buffer,
  mimeType: string,
): Promise<GeminiTranscriptionParse> {
  const b64 = buffer.toString("base64");
  const prompt = `You are a professional transcription system. Listen to the ENTIRE audio file from start to finish.

Transcribe all spoken content verbatim in the original language(s). If there are multiple distinct speakers, label them consistently.

Return JSON only (no markdown fences) with exactly this shape:
{"transcript":"...","segments":[{"start":0.0,"end":2.5,"text":"...","speaker":"Speaker 1"},...],"language":"unknown"}

Critical rules for "transcript":
- MUST contain ONLY spoken words, in order, separated by single spaces.
- NEVER include timestamps, clock times, counters, or patterns like 00:01 or 01:23 inside "transcript".
- NEVER repeat the same time code many times. No numbering of seconds in "transcript".

Critical rules for "segments":
- Chronological, non-overlapping; cover ALL audible speech in this clip.
- "start" and "end" are seconds from the beginning of THIS clip (use decimal seconds for millisecond precision, e.g. 12.847).
- Each "text" is the spoken phrase for that interval only (no timestamps inside "text").
- "speaker": use "Speaker 1", "Speaker 2", etc. when multiple voices; if one speaker, use "Speaker 1" for every segment.
- If there is no speech in this clip, use empty segments array and empty transcript.

"language": ISO 639-1 code of the dominant spoken language, or "unknown".`;

  const raw = await withKeyRotation(async (genAI) => {
    const model = genAI.getGenerativeModel({
      model: getModelId(),
      generationConfig: {
        responseMimeType: "application/json",
        maxOutputTokens: 16384,
      },
    });
    const result = await model.generateContent([
      {
        inlineData: {
          mimeType,
          data: b64,
        },
      },
      { text: prompt },
    ]);
    return result.response.text().trim();
  });

  if (!raw) {
    throw new Error("Transcription returned empty response.");
  }

  let parsed: unknown;
  try {
    parsed = parseJsonFromModel(raw);
  } catch {
    throw new Error("Transcription response was not valid JSON.");
  }

  if (typeof parsed !== "object" || parsed === null || !("transcript" in parsed)) {
    throw new Error("Transcription response shape was unexpected.");
  }

  const p = parsed as {
    transcript?: unknown;
    segments?: unknown;
    language?: unknown;
  };

  const transcript =
    typeof p.transcript === "string" ? p.transcript.trim() : "";

  const segmentsRaw = Array.isArray(p.segments) ? p.segments : [];

  const segments: GeminiTranscriptionSegment[] = segmentsRaw.map((s: unknown) => {
    if (typeof s !== "object" || s === null) {
      return { start: 0, end: 0, text: "" };
    }
    const o = s as Record<string, unknown>;
    const start = typeof o.start === "number" ? o.start : Number(o.start) || 0;
    const end = typeof o.end === "number" ? o.end : Number(o.end) || 0;
    const text = typeof o.text === "string" ? o.text.trim() : "";
    let speaker: string | undefined;
    if (typeof o.speaker === "string" && o.speaker.trim()) {
      speaker = o.speaker.trim();
    }
    return speaker ? { start, end, text, speaker } : { start, end, text };
  });

  let language: string | undefined;
  if (typeof p.language === "string") {
    language = p.language.trim();
    if (language === "unknown" || !language) language = undefined;
  }

  if (!transcript && segments.every((s) => !s.text)) {
    throw new Error("Transcription returned no text.");
  }

  const finalSegments =
    segments.length > 0
      ? segments.filter((s) => s.text)
      : transcript
        ? [{ start: 0, end: 0, text: transcript }]
        : [];

  const fullTranscript =
    transcript || finalSegments.map((s) => s.text).join(" ");

  return {
    transcript: fullTranscript,
    segments: finalSegments,
    language,
  };
}

import {
  BlockReason,
  FinishReason,
  GoogleGenerativeAI,
  GoogleGenerativeAIFetchError,
  SchemaType,
  type GenerateContentResult,
  type ObjectSchema,
} from "@google/generative-ai";
import {
  englishLanguageNameFromIso6391,
  normalizeIso6391,
} from "@/lib/language-codes";

const DETECT_SAMPLE_CHARS = 12000;

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

/** Model for multimodal transcription; defaults to {@link getModelId}. */
function getTranscribeModelId(): string {
  const t = process.env.GEMINI_TRANSCRIBE_MODEL?.trim();
  return t || getModelId();
}

/** Optional second model if the primary hits RECITATION / safety on transcription. */
function getTranscribeFallbackModelId(): string | undefined {
  const t = process.env.GEMINI_TRANSCRIBE_FALLBACK_MODEL?.trim();
  if (!t || t === getTranscribeModelId()) return undefined;
  return t;
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

function representativeLanguageDetectionSample(
  text: string,
  maxChars: number,
): string {
  const t = text.trim();
  if (t.length <= maxChars) return t;
  const n = Math.floor(maxChars / 3);
  const midStart = Math.max(0, Math.floor(t.length / 2 - n / 2));
  const midEnd = Math.min(t.length, midStart + n);
  return `${t.slice(0, n)}\n…\n${t.slice(midStart, midEnd)}\n…\n${t.slice(-n)}`;
}

function parseLanguageDetectionJson(raw: string): DetectionResult {
  if (!raw) {
    throw new Error("Language detection returned empty response.");
  }

  let parsed: unknown;
  try {
    parsed = parseJsonFromModel(raw);
  } catch {
    try {
      parsed = JSON.parse(raw.trim());
    } catch {
      throw new Error("Language detection returned invalid JSON.");
    }
  }

  if (typeof parsed !== "object" || parsed === null) {
    throw new Error("Language detection response shape was unexpected.");
  }

  const p = parsed as {
    detectedLanguage?: unknown;
    languageCode?: unknown;
    confidence?: unknown;
  };

  const confidence =
    typeof p.confidence === "number" && Number.isFinite(p.confidence)
      ? Math.min(1, Math.max(0, p.confidence))
      : 0;

  const codeRaw =
    typeof p.languageCode === "string" ? p.languageCode.trim() : "";
  const fromCode = englishLanguageNameFromIso6391(codeRaw);

  let detectedLanguage =
    typeof p.detectedLanguage === "string" ? p.detectedLanguage.trim() : "";

  if (fromCode) {
    detectedLanguage = fromCode;
  } else if (!detectedLanguage) {
    throw new Error("Could not determine document language.");
  }

  return { detectedLanguage, confidence };
}

export async function detectLanguage(
  textSample: string,
): Promise<DetectionResult> {
  const sample = representativeLanguageDetectionSample(
    textSample,
    DETECT_SAMPLE_CHARS,
  );

  const raw = await withKeyRotation(async (genAI) => {
    const model = genAI.getGenerativeModel({
      model: getModelId(),
      systemInstruction:
        'Identify the single PRIMARY language of the TEXT (spoken/written language of the words), not the alphabet. Romanized Amharic, Somali, Arabic, Hindi, etc. are NOT English—use the correct language even when Latin letters are used. Ignore short foreign quotes unless they dominate. Reply with JSON only: {"detectedLanguage":"English name (e.g. Amharic, French)","languageCode":"ISO 639-1 two-letter lowercase code (e.g. am, fr)","confidence":number from 0 to 1}',
      generationConfig: {
        responseMimeType: "application/json",
      },
    });
    const result = await model.generateContent(sample);
    return result.response.text().trim();
  });

  return parseLanguageDetectionJson(raw);
}

/**
 * Second opinion when the default classifier returns English: speech transcripts are
 * often romanized or ASR-mangled; models still default to "English" incorrectly.
 */
export async function detectLanguageSkepticalOfEnglishSpeech(
  textSample: string,
): Promise<DetectionResult> {
  const sample = representativeLanguageDetectionSample(
    textSample,
    DETECT_SAMPLE_CHARS,
  );

  const raw = await withKeyRotation(async (genAI) => {
    const model = genAI.getGenerativeModel({
      model: getModelId(),
      systemInstruction: `You classify the LANGUAGE that was SPOKEN, from an automatic transcript (may be imperfect).
Latin letters do NOT mean English. Romanized Amharic, Tigrinya, Oromo, Somali, Arabic, etc. must get their real language—not English.
Only use English if the words are clearly idiomatic English sentences. If phonetics/word shapes fit Ethiopian Semitic or Cushitic languages, choose am / ti / om (ISO) accordingly.
Reply with JSON only: {"detectedLanguage":"English name","languageCode":"ISO 639-1 two lowercase letters","confidence":number from 0 to 1}`,
      generationConfig: {
        responseMimeType: "application/json",
      },
    });
    const result = await model.generateContent(sample);
    return result.response.text().trim();
  });

  return parseLanguageDetectionJson(raw);
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
  /** User glossary block from term base (cache key uses glossaryRevision) */
  glossaryBlock?: string;
  /** Stable hash of glossary rows; used for cache/options identity */
  glossaryRevision?: string;
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
    opts.glossaryBlock?.trim()
      ? opts.glossaryBlock.trim()
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
  glossaryBlock?: string;
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
  const gloss = lineOptions?.glossaryBlock?.trim();

  const raw = await withKeyRotation(async (genAI) => {
    const model = genAI.getGenerativeModel({
      model: getModelId(),
      systemInstruction:
        `Translate each item's "text" into ${target}. Style: ${MODE_INSTRUCTION[mode]}.` +
        (gloss ? `\n${gloss}` : "") +
        ` Preserve count and order. Reply with JSON only: {"lines":[{"i":number,"text":"translation"}]}`,
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

/**
 * Extracts first `{...}` balancing braces while respecting JSON string quoting
 * (naive `{` inside strings does not break depth).
 */
function extractFirstJsonObjectStringAware(input: string): string | null {
  const start = input.indexOf("{");
  if (start < 0) return null;
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < input.length; i++) {
    const c = input[i];
    if (inStr) {
      if (esc) {
        esc = false;
        continue;
      }
      if (c === "\\") {
        esc = true;
        continue;
      }
      if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') {
      inStr = true;
      continue;
    }
    if (c === "{") depth++;
    else if (c === "}") {
      depth--;
      if (depth === 0) return input.slice(start, i + 1);
    }
  }
  return null;
}

/** Collect candidate JSON slices: first object + objects starting at later `{` positions. */
function collectJsonObjectCandidates(raw: string): string[] {
  const trimmed = raw.trim();
  const out: string[] = [];
  const seen = new Set<string>();
  const push = (s: string | null) => {
    if (!s) return;
    if (seen.has(s)) return;
    seen.add(s);
    out.push(s);
  };
  push(extractFirstJsonObjectStringAware(trimmed));
  for (let i = 0; i < trimmed.length; i++) {
    if (trimmed[i] !== "{") continue;
    if (i > 0 && trimmed[i - 1] === "\\") continue;
    push(extractFirstJsonObjectStringAware(trimmed.slice(i)));
    if (out.length >= 12) break;
  }
  return out;
}

function stripLooseJsonNoise(s: string): string {
  return s
    .replace(/,\s*([}\]])/g, "$1")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, " ");
}

function parseTranscriptionModelJson(raw: string): unknown {
  const trimmed = raw.trim();
  let candidates = collectJsonObjectCandidates(trimmed);
  if (candidates.length === 0) {
    candidates = [trimmed];
  }

  const tryOne = (blob: string): unknown => {
    const cleaned = stripLooseJsonNoise(blob);
    try {
      return parseJsonFromModel(cleaned);
    } catch {
      // If it looks like it was truncated (ends with ... or just stops), try to balance it
      let b = cleaned;
      if (!b.endsWith("}") && b.includes("{")) {
        // Naive attempt to close open braces for truncated responses
        let open = 0;
        for (const char of b) {
          if (char === "{") open++;
          else if (char === "}") open--;
        }
        while (open > 0) {
          b += "}";
          open--;
        }
      }
      try {
        return JSON.parse(b);
      } catch {
        return JSON.parse(cleaned);
      }
    }
  };

  for (const blob of candidates) {
    try {
      return tryOne(blob);
    } catch {
      /* next */
    }
  }

  try {
    return tryOne(trimmed);
  } catch {
    // Last ditch: if we see a transcript field but the whole thing is failed, 
    // try to regex out the transcript string at least.
    const m = trimmed.match(/"transcript"\s*:\s*"([^"]+)"/);
    if (m?.[1]) {
      return { transcript: m[1], segments: [], language: "unknown" };
    }
    throw new Error("Transcription response was not valid JSON.");
  }
}

function getTranscriptionResponseText(result: GenerateContentResult): string {
  const resp = result.response;
  const pf = resp.promptFeedback;
  if (
    pf?.blockReason &&
    pf.blockReason !== BlockReason.BLOCKED_REASON_UNSPECIFIED
  ) {
    const extra = pf.blockReasonMessage?.trim()
      ? ` ${pf.blockReasonMessage}`
      : "";
    throw new Error(`Transcription prompt was blocked (${pf.blockReason}).${extra}`);
  }

  const cand = resp.candidates?.[0];
  const fr = cand?.finishReason;

  if (
    fr === FinishReason.RECITATION ||
    fr === FinishReason.SAFETY ||
    fr === FinishReason.BLOCKLIST ||
    fr === FinishReason.PROHIBITED_CONTENT ||
    fr === FinishReason.SPII
  ) {
    const hint = cand?.finishMessage?.trim();
    throw new Error(
      `Transcription output was blocked (${fr}).${hint ? ` ${hint}` : ""}`,
    );
  }

  try {
    const t = resp.text().trim();
    if (t) return t;
  } catch {
    /* try parts below */
  }

  const fallback = cand?.content?.parts
    ?.map((p) => ("text" in p && typeof p.text === "string" ? p.text : ""))
    .join("")
    .trim();
  if (fallback) return fallback;

  throw new Error("Transcription returned empty response.");
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

/** Forces valid JSON matching this shape at the API (reduces malformed output). */
const TRANSCRIPTION_RESPONSE_SCHEMA: ObjectSchema = {
  type: SchemaType.OBJECT,
  properties: {
    transcript: {
      type: SchemaType.STRING,
      description:
        "Verbatim words in the SOURCE language as heard—never translate to another language. Speaking order; single spaces. No timestamps.",
    },
    segments: {
      type: SchemaType.ARRAY,
      items: {
        type: SchemaType.OBJECT,
        properties: {
          start: { type: SchemaType.NUMBER },
          end: { type: SchemaType.NUMBER },
          text: { type: SchemaType.STRING },
          speaker: { type: SchemaType.STRING },
        },
        required: ["start", "end", "text"],
      },
    },
    language: {
      type: SchemaType.STRING,
      description:
        "Dominant spoken language: two-letter ISO 639-1 (am=Amharic, om=Oromo, ti=Tigrinya, en=English). Must match the language spoken, not a guess at English.",
    },
  },
  required: ["transcript", "segments", "language"],
};

const TRANSCRIPTION_JSON_INSTRUCTION = `Return JSON only (no markdown fences) with exactly this shape:
{"transcript":"...","segments":[{"start":0.0,"end":2.5,"text":"...","speaker":"Speaker 1"},...],"language":"unknown"}

Language fidelity (critical):
- Transcribe in the SAME language(s) the speaker used. Do NOT translate speech into English or any other language unless the speaker actually used that language.
- "transcript" and each segment "text" must use the authentic words/sounds of the source language. 
- Use the NATIVE script for that language where applicable (e.g., use Ethiopic/Ge'ez script for Amharic, Tigrinya; do NOT use Latin/Romanization for these languages).
- Examples for Amharic: use "ሰላም" not "Selam".

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

"language": Exactly two lowercase ISO 639-1 letters for the dominant SPOKEN language as heard (e.g. am for Amharic, en for English). Use "unknown" only if unclassifiable. Must match the language spoken, not a guess at English.`;

function buildTranscriptionPromptPrimary(languageHintIso6391?: string): string {
  const hint = languageHintIso6391?.trim()
    ? `\n\nKnown language hint: The primary spoken language is "${languageHintIso6391.trim().toLowerCase()}". Do NOT transcribe in English unless the audio is actually English.`
    : "";
  return `You are a professional transcription system. Listen to the ENTIRE audio file from start to finish. Focus intently on the first 10 seconds to establish the language, then carry that through to the end.

Transcribe all spoken content verbatim in the original language(s)—word-for-word as heard, not translated. If the language is Amharic, Tigrinya, or similar, you MUST use the Ethiopic script.

${hint}

${TRANSCRIPTION_JSON_INSTRUCTION}`;
}

function buildTranscriptionPromptRetry(languageHintIso6391?: string): string {
  const hint = languageHintIso6391?.trim()
    ? `\n\nKnown language hint: The primary spoken language is "${languageHintIso6391.trim().toLowerCase()}". Do NOT translate or rewrite it as English.`
    : "";
  return `The user uploaded this audio for translation in their own workflow. Transcribe spontaneous speech and dialogue.

If the audio contains long sung or performed passages that cannot be transcribed verbatim under content rules, use a short placeholder in "text" such as "[music]" or "[sung audio]" for that segment instead of reproducing lyrics.

${hint}

${TRANSCRIPTION_JSON_INSTRUCTION}`;
}

function buildTranscriptionPromptPlain(): string {
  return `Listen to the entire audio clip. Transcribe every spoken word in the original language(s) exactly as heard—do not translate into English or any other language the speaker did not use.

Output requirements (strict):
- Plain text only. No JSON, no markdown, no code fences, no timestamps, no "Speaker" labels.
- One continuous flow of words in speaking order; separate phrases with a single space.
- If there is no speech, output exactly: (silence)`;
}

function transcriptionPlainToResult(raw: string): GeminiTranscriptionParse {
  let text = raw.trim();
  if (text.startsWith("```")) {
    text = text.replace(/^```(?:text)?\s*/i, "").replace(/\s*```\s*$/i, "");
  }
  text = text.replace(/\s+/g, " ").trim();
  if (!text || /^\(silence\)$/i.test(text)) {
    throw new Error("Transcription returned no text.");
  }
  return {
    transcript: text,
    segments: [{ start: 0, end: 0, text }],
    language: undefined,
  };
}

type TranscriptionGenerateMode = "structured" | "plain";

function transcribeMaxOutputTokens(): number {
  const raw = process.env.GEMINI_TRANSCRIBE_MAX_OUTPUT_TOKENS?.trim();
  const n = raw ? parseInt(raw, 10) : 32768;
  if (!Number.isFinite(n) || n < 1024) return 32768;
  return Math.min(n, 65536);
}

async function generateTranscriptionRaw(
  genAI: GoogleGenerativeAI,
  buffer: Buffer,
  mimeType: string,
  prompt: string,
  modelId: string,
  mode: TranscriptionGenerateMode,
): Promise<string> {
  const b64 = buffer.toString("base64");
  const maxOutputTokens = transcribeMaxOutputTokens();

  const generationConfig =
    mode === "structured"
      ? {
          responseMimeType: "application/json" as const,
          responseSchema: TRANSCRIPTION_RESPONSE_SCHEMA,
          maxOutputTokens,
          temperature: 0.2,
        }
      : {
          responseMimeType: "text/plain" as const,
          maxOutputTokens,
          temperature: 0.25,
        };

  const model = genAI.getGenerativeModel({
    model: modelId,
    generationConfig,
  });
  const result = await model.generateContent([
    { inlineData: { mimeType, data: b64 } },
    { text: prompt },
  ]);
  return getTranscriptionResponseText(result);
}

function transcriptionJsonToResult(parsed: unknown): GeminiTranscriptionParse {
  if (typeof parsed !== "object" || parsed === null) {
    throw new Error("Transcription response shape was unexpected.");
  }

  const p = parsed as {
    transcript?: unknown;
    text?: unknown;
    segments?: unknown;
    language?: unknown;
  };

  let transcript = typeof p.transcript === "string" ? p.transcript.trim() : "";
  if (!transcript && typeof p.text === "string") {
    transcript = p.text.trim();
  }

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

const AUDIO_LANG_SCHEMA: ObjectSchema = {
  type: SchemaType.OBJECT,
  properties: {
    languageCode: {
      type: SchemaType.STRING,
      description:
        "ISO 639-1 two lowercase letters: am, en, om, ti, ar, und if unclear",
    },
  },
  required: ["languageCode"],
};

const AUDIO_LANG_PROMPT_PRIMARY = `Listen to this audio clip. What is the PRIMARY language being spoken—the language the speaker uses for most of the speech?

Rules:
- Use ISO 639-1 two-letter codes: "am" Amharic, "ti" Tigrinya, "om" Oromo, "en" English, "ar" Arabic, "sw" Swahili, etc.
- Do not guess English unless the speech is actually English.
- If there is no speech or you cannot tell, respond with languageCode "und".`;

const AUDIO_LANG_PROMPT_ETHIOPIAN_FOCUS = `Listen carefully to the resonance and phonetics of the speech.
The speaker is likely using Amharic, Tigrinya, or Afaan Oromo—these are often mislabeled as English by standard models.

Identify the PRIMARY spoken language from these options:
- "am" (Amharic): Characterized by ejective consonants and distinctive vowel shifts.
- "ti" (Tigrinya): Similar to Amharic but with more glottal sounds.
- "om" (Oromo): A Cushitic language with different rhythmic patterns.
- "en" (English): Use ONLY if the words, syntax, and vocabulary are clearly and idiomatic English.

Rules:
- ISO 639-1 only: "am", "ti", "om", "en", or "und".
- Do not choose English just because you hear a few loanwords. Listen for the underlying grammar and sentence structure.`;

async function detectSpokenLanguageFromAudioOnce(
  buffer: Buffer,
  mimeType: string,
  prompt: string,
): Promise<string | null> {
  if (buffer.length < 64) return null;
  const b64 = buffer.toString("base64");

  const raw = await withKeyRotation(async (genAI) => {
    const model = genAI.getGenerativeModel({
      model: getTranscribeModelId(),
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: AUDIO_LANG_SCHEMA,
        maxOutputTokens: 128,
        temperature: 0,
      },
    });
    const result = await model.generateContent([
      { inlineData: { mimeType, data: b64 } },
      { text: prompt },
    ]);
    return getTranscriptionResponseText(result);
  });

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw.trim());
  } catch {
    parsed = parseTranscriptionModelJson(raw);
  }
  if (typeof parsed !== "object" || parsed === null || !("languageCode" in parsed)) {
    return null;
  }
  const lc = (parsed as { languageCode: unknown }).languageCode;
  const code = typeof lc === "string" ? lc.trim().toLowerCase() : "";
  return normalizeIso6391(code);
}

/**
 * Listens to the audio only (no transcription) and returns the primary spoken language.
 * More reliable than guessing from transcript text, especially when metadata says "en".
 * Runs a second, Ethiopia-focused pass when the first result is English or unknown—Gemini
 * often mislabels Amharic as English on the first try.
 */
export async function detectPrimarySpokenLanguageFromAudio(
  buffer: Buffer,
  mimeType: string,
): Promise<string | null> {
  try {
    const first = await detectSpokenLanguageFromAudioOnce(
      buffer,
      mimeType,
      AUDIO_LANG_PROMPT_PRIMARY,
    );
    if (first && first !== "en") {
      return first;
    }

    const second = await detectSpokenLanguageFromAudioOnce(
      buffer,
      mimeType,
      AUDIO_LANG_PROMPT_ETHIOPIAN_FOCUS,
    );
    if (second) {
      return second;
    }
    return first;
  } catch {
    return null;
  }
}

/**
 * Transcribe audio using Gemini multimodal input (same API keys as translation).
 * Retries on RECITATION/safety blocks and malformed JSON; use GEMINI_TRANSCRIBE_MODEL /
 * GEMINI_TRANSCRIBE_FALLBACK_MODEL to tune models.
 */
export async function transcribeAudioWithGemini(
  buffer: Buffer,
  mimeType: string,
  opts?: { languageHintIso6391?: string },
): Promise<GeminiTranscriptionParse> {
  const primaryModel = getTranscribeModelId();
  const fallbackModel = getTranscribeFallbackModelId();
  const languageHintIso6391 = normalizeIso6391(opts?.languageHintIso6391 ?? undefined);

  const attempts: Array<{ prompt: string; modelId: string; label: string }> = [
    {
      prompt: buildTranscriptionPromptPrimary(languageHintIso6391 ?? undefined),
      modelId: primaryModel,
      label: "primary",
    },
    {
      prompt: buildTranscriptionPromptRetry(languageHintIso6391 ?? undefined),
      modelId: primaryModel,
      label: "retry_policy",
    },
  ];

  if (fallbackModel) {
    attempts.push({
      prompt: buildTranscriptionPromptRetry(languageHintIso6391 ?? undefined),
      modelId: fallbackModel,
      label: "fallback_model",
    });
  }

  let lastError: unknown;
  for (const a of attempts) {
    try {
      const raw = await withKeyRotation((genAI) =>
        generateTranscriptionRaw(
          genAI,
          buffer,
          mimeType,
          a.prompt,
          a.modelId,
          "structured",
        ),
      );
      const parsed = parseTranscriptionModelJson(raw);
      return transcriptionJsonToResult(parsed);
    } catch (err) {
      lastError = err;
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[transcribe:${a.label}] ${msg}`);
    }
  }

  const plainModels = Array.from(
    new Set([primaryModel, ...(fallbackModel ? [fallbackModel] : [])]),
  );
  for (const modelId of plainModels) {
    try {
      const raw = await withKeyRotation((genAI) =>
        generateTranscriptionRaw(
          genAI,
          buffer,
          mimeType,
          buildTranscriptionPromptPlain(),
          modelId,
          "plain",
        ),
      );
      return transcriptionPlainToResult(raw);
    } catch (err) {
      lastError = err;
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[transcribe:plain:${modelId}] ${msg}`);
    }
  }

  if (lastError instanceof Error) throw lastError;
  throw new Error("Transcription failed after retries.");
}

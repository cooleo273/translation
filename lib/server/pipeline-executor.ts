import type { ProcessPayload } from "@/lib/process-types";
import type { DocumentKind, UploadRecord } from "@/lib/types";
import {
  detectLanguage,
  translateTextsPreservingOrder,
  translateToEnglish,
  translateWithOptions,
  type DocumentPipelineTranslation,
} from "@/lib/ai";
import { resolveSpeechLanguage } from "@/lib/speech-language";
import { createDownloadToken } from "@/lib/download-tokens";
import { runDocumentPipeline } from "@/lib/pipelines/document-pipeline";
import { extractTextFromImage } from "@/lib/services/ocr-service";
import { segmentsToSrt } from "@/lib/services/srt-service";
import { transcribeAudio } from "@/lib/services/transcription-service";
import { translateSpreadsheetBuffer } from "@/lib/services/excel-service";
import { extractAudioFromVideo } from "@/lib/services/video-service";

export interface PipelineRunOptions {
  /** When set, enables advanced translation (modes, target language, custom prompt). Omit for legacy Phase-1 behavior. */
  translation?: DocumentPipelineTranslation;
  /** Optional abort signal (Stop button, request aborted, etc). */
  signal?: AbortSignal;
}

export const PIPELINE_CANCELED_MESSAGE = "Canceled";

function throwIfAborted(signal?: AbortSignal) {
  if (!signal) return;
  if (signal.aborted) {
    throw new Error(PIPELINE_CANCELED_MESSAGE);
  }
}

function lineBatchOpts(translation?: DocumentPipelineTranslation) {
  return {
    targetLanguage: translation?.targetLanguage ?? "English",
    mode: translation?.mode ?? "standard",
    glossaryBlock: translation?.glossaryBlock,
  };
}

function translateLine(
  text: string,
  translation?: DocumentPipelineTranslation,
): Promise<string> {
  if (!translation) return translateToEnglish(text);
  return translateWithOptions(text, {
    targetLanguage: translation.targetLanguage ?? "English",
    mode: translation.mode ?? "standard",
    customInstructions: translation.customInstructions,
    documentTypeHint: translation.documentTypeHint,
    glossaryBlock: translation.glossaryBlock,
    glossaryRevision: translation.glossaryRevision,
  });
}

function translationRequested(tr?: DocumentPipelineTranslation): tr is DocumentPipelineTranslation {
  return !!tr;
}

async function runAudioPipeline(
  record: UploadRecord,
  send: (obj: object) => void,
  tr: DocumentPipelineTranslation | undefined,
  check: () => void,
) {
  check();
  send({ step: "transcribing" });
  const ta = await transcribeAudio(record.buffer, record.fileName);
  const plain = ta.transcriptPlain ?? ta.transcript;
  const { detectedLanguage, confidence } = await resolveSpeechLanguage(
    plain,
    ta.language,
    ta.audioLanguageCode,
  );
  check();
  const translatedText = translationRequested(tr) ? await translateLine(plain, tr) : null;
  if (translationRequested(tr)) send({ step: "translating" });
  send({
    step: "completed",
    payload: {
      category: "audio" as const,
      transcript: ta.transcript,
      transcriptPlain: ta.transcriptPlain,
      segments: ta.segments,
      timestamps: ta.timestamps,
      translatedText: translatedText ?? undefined,
      detectedLanguage,
      confidence,
      speechLanguage: ta.language,
      speechLanguageFromAudio: ta.audioLanguageCode,
    },
  });
}

async function runVideoPipeline(
  record: UploadRecord,
  send: (obj: object) => void,
  tr: DocumentPipelineTranslation | undefined,
  check: () => void,
) {
  check();
  send({ step: "extracting_audio" });
  let cleanup: (() => Promise<void>) | undefined;
  try {
    const { audioBuffer, cleanup: c } = await extractAudioFromVideo(
      record.buffer,
      record.fileName,
    );
    cleanup = c;
    check();
    send({ step: "transcribing" });
    const ta = await transcribeAudio(audioBuffer, "extracted.wav");
    const plain = ta.transcriptPlain ?? ta.transcript;
    const { detectedLanguage, confidence } = await resolveSpeechLanguage(
      plain,
      ta.language,
      ta.audioLanguageCode,
    );
    check();
    const translatedText = translationRequested(tr) ? await translateLine(plain, tr) : null;
    if (translationRequested(tr)) send({ step: "translating" });

    const segTexts = ta.segments.map((s) => s.text);
    let translatedLines: string[] = [];
    if (translationRequested(tr) && segTexts.length > 0) {
      send({ step: "subtitles" });
      translatedLines = await translateTextsPreservingOrder(segTexts, lineBatchOpts(tr));
    }

    const srtOriginal = segmentsToSrt(ta.segments);
    const srtEnglish =
      translatedLines.length > 0
        ? segmentsToSrt(ta.segments, translatedLines)
        : srtOriginal;

    send({
      step: "completed",
      payload: {
        category: "video" as const,
        transcript: ta.transcript,
        transcriptPlain: ta.transcriptPlain,
        segments: ta.segments,
        translatedText: translatedText ?? undefined,
        detectedLanguage,
        confidence,
        speechLanguage: ta.language,
        speechLanguageFromAudio: ta.audioLanguageCode,
        srtOriginal,
        srtEnglish,
      },
    });
  } finally {
    await cleanup?.();
  }
}

/**
 * Executes the multimodal pipeline for an in-memory upload record (streams status via `send`).
 */
export async function runPipelineForRecord(
  record: UploadRecord,
  send: (obj: object) => void,
  opts?: PipelineRunOptions,
): Promise<void> {
  const tr = opts?.translation;
  const signal = opts?.signal;

  const check = () => throwIfAborted(signal);

  switch (record.category) {
    case "document": {
      check();
      const r = await runDocumentPipeline(
        record.buffer,
        record.kind as DocumentKind,
        (phase) => {
          check();
          send({ step: phase });
        },
        tr,
      );
      send({
        step: "completed",
        payload: {
          category: "document" as const,
          ...r,
        },
      });
      break;
    }

    case "audio": {
      await runAudioPipeline(record, send, tr, check);
      break;
    }

    case "video": {
      await runVideoPipeline(record, send, tr, check);
      break;
    }

    case "image": {
      check();
      send({ step: "ocr" });
      const originalText = await extractTextFromImage(record.buffer);
      check();
      send({ step: "translating" });
      const { detectedLanguage, confidence } = await detectLanguage(originalText);
      const translatedText = await translateLine(originalText, tr);
      send({
        step: "completed",
        payload: {
          category: "image" as const,
          originalText,
          translatedText,
          detectedLanguage,
          confidence,
        },
      });
      break;
    }

    case "spreadsheet": {
      check();
      send({ step: "spreadsheet", detail: "translating_cells" });
      const translateOpts = tr
        ? {
            targetLanguage: tr.targetLanguage ?? "English",
            mode: tr.mode ?? "standard",
            customInstructions: tr.customInstructions,
            documentTypeHint: tr.documentTypeHint,
            glossaryBlock: tr.glossaryBlock,
            glossaryRevision: tr.glossaryRevision,
          }
        : undefined;
      const { data, fileName } = await translateSpreadsheetBuffer(
        record.buffer,
        record.fileName,
        translateOpts,
      );
      check();
      const downloadToken = createDownloadToken({
        data,
        fileName,
        mimeType: fileName.endsWith(".csv")
          ? "text/csv"
          : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      send({
        step: "completed",
        payload: {
          category: "spreadsheet" as const,
          downloadToken,
          downloadFileName: fileName,
        },
      });
      break;
    }

    default: {
      send({ step: "error", message: "Unsupported category." });
    }
  }
}

/** Non-streaming execution for authenticated jobs (returns last completed payload). */
export async function executePipelineSync(
  record: UploadRecord,
  opts?: PipelineRunOptions,
): Promise<ProcessPayload> {
  let payload: ProcessPayload | undefined;
  const send = (obj: object) => {
    const o = obj as { step?: string; payload?: ProcessPayload; message?: string };
    if (o.step === "error") {
      throw new Error(o.message ?? "Processing failed.");
    }
    if (o.step === "completed" && o.payload) {
      payload = o.payload;
    }
  };
  await runPipelineForRecord(record, send, opts);
  if (!payload) {
    throw new Error("Processing did not complete.");
  }
  return payload;
}

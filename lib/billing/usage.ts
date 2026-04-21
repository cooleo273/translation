import type { SupabaseClient } from "@supabase/supabase-js";
import type { DocumentPipelineTranslation } from "@/lib/ai";
import { incrementUsage } from "@/lib/services/usage-service";
import type { ProcessPayload } from "@/lib/process-types";
import {
  ratePerAudioMinuteUsd,
  ratePerVideoMinuteUsd,
  ratePerWordUsd,
} from "@/lib/billing/rates";
import { countWords, estimateAudioSecondsFromBytes } from "@/lib/utils/usage-metrics";
import {
  minutesFromAudioOrVideo,
  secondsFromSegments,
} from "@/lib/utils/media-duration";
import { primaryTextsFromPayload } from "@/lib/utils/process-payload-db";

export type UsageLogType = "doc" | "audio" | "video" | "ocr" | "spreadsheet";

function mapCategoryToLogType(
  category: ProcessPayload["category"],
): UsageLogType {
  switch (category) {
    case "document":
      return "doc";
    case "image":
      return "ocr";
    case "audio":
      return "audio";
    case "video":
      return "video";
    case "spreadsheet":
      return "spreadsheet";
  }
}

function computeCost(type: UsageLogType, usageAmount: number): number {
  switch (type) {
    case "doc":
    case "ocr":
    case "spreadsheet":
      return usageAmount * ratePerWordUsd();
    case "audio":
      return usageAmount * ratePerAudioMinuteUsd();
    case "video":
      return usageAmount * ratePerVideoMinuteUsd();
    default:
      return 0;
  }
}

export async function recordProcessingUsage(
  supabase: SupabaseClient,
  opts: {
    userId: string;
    fileId: string;
    apiKeyId?: string | null;
    payload: ProcessPayload;
    bufferSize: number;
    spreadsheetBufferSize?: number;
  },
): Promise<void> {
  const texts = primaryTextsFromPayload(opts.payload);
  const logType = mapCategoryToLogType(opts.payload.category);

  let wordsForStats = 0;
  if (opts.payload.category === "spreadsheet") {
    const buf = opts.spreadsheetBufferSize ?? opts.bufferSize;
    wordsForStats = Math.max(50, Math.floor(buf / 80));
  } else if (texts) {
    wordsForStats = countWords(texts.original) + countWords(texts.translated);
  }

  let audioSecondsForStats = 0;
  const avPayload =
    opts.payload.category === "audio" || opts.payload.category === "video"
      ? opts.payload
      : null;
  if (avPayload) {
    audioSecondsForStats =
      secondsFromSegments(avPayload.segments) ||
      estimateAudioSecondsFromBytes(opts.bufferSize);
  }

  const usageAmountForLog =
    (logType === "audio" || logType === "video") && avPayload
      ? minutesFromAudioOrVideo(avPayload.segments, opts.bufferSize)
      : wordsForStats;

  const cost = computeCost(logType, usageAmountForLog);

  await incrementUsage(supabase, opts.userId, {
    files: 1,
    words: wordsForStats,
    audioSeconds: audioSecondsForStats,
  });

  const { error } = await supabase.from("usage_logs").insert({
    user_id: opts.userId,
    file_id: opts.fileId,
    api_key_id: opts.apiKeyId ?? null,
    type: logType,
    usage_amount: usageAmountForLog,
    cost,
    metadata: { category: opts.payload.category },
  });

  if (error) {
    console.error("[usage_logs]", error);
  }
}

export function optionsHashFromTranslation(
  tr: DocumentPipelineTranslation | undefined,
): string {
  if (!tr) return "";
  const stable = {
    targetLanguage: tr?.targetLanguage ?? "English",
    mode: tr?.mode ?? "standard",
    customInstructions: tr?.customInstructions ?? null,
    documentTypeHint: tr?.documentTypeHint ?? null,
    glossaryRevision: tr?.glossaryRevision ?? null,
  };
  return Buffer.from(JSON.stringify(stable), "utf8").toString("base64url");
}

export function cacheVersion(): string {
  return process.env.TRANSLATION_CACHE_VERSION ?? "1";
}

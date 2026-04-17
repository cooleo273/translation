import type { DocumentPipelineTranslation } from "@/lib/ai";
import { peekDownload, takeDownload } from "@/lib/download-tokens";
import { executePipelineSync } from "@/lib/server/pipeline-executor";
import type { ProcessPayload } from "@/lib/process-types";
import { uploadBuffer } from "@/lib/services/cloudinary-service";
import {
  cacheVersion,
  optionsHashFromTranslation,
  recordProcessingUsage,
} from "@/lib/billing/usage";
import { sha256Buffer } from "@/lib/crypto/sha256";
import { buildUploadRecord } from "@/lib/utils/build-upload-record";
import { primaryTextsFromPayload } from "@/lib/utils/process-payload-db";
import type { SupabaseClient } from "@supabase/supabase-js";

export type ProcessAppFileContext = {
  userId: string;
  fileId: string;
  translation?: DocumentPipelineTranslation;
  apiKeyId?: string | null;
};

export async function processAppFile(
  supabase: SupabaseClient,
  ctx: ProcessAppFileContext,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const { data: fileRow, error: fErr } = await supabase
    .from("files")
    .select("*")
    .eq("id", ctx.fileId)
    .eq("user_id", ctx.userId)
    .maybeSingle();

  if (fErr || !fileRow?.original_url) {
    return { ok: false, message: "File not found." };
  }

  await supabase
    .from("files")
    .update({ status: "processing" })
    .eq("id", ctx.fileId);

  const translation = ctx.translation;

  try {
    const resFetch = await fetch(fileRow.original_url);
    if (!resFetch.ok) {
      throw new Error("Could not download original file from storage.");
    }
    const buffer = Buffer.from(await resFetch.arrayBuffer());
    const record = buildUploadRecord(fileRow.file_name, buffer);
    const contentHash = sha256Buffer(buffer);
    const optHash = optionsHashFromTranslation(translation);
    const cv = cacheVersion();
    const canCache = record.category !== "spreadsheet";

    let payload: ProcessPayload | null = null;

    if (canCache) {
      const { data: cached } = await supabase
        .from("translation_cache")
        .select("result")
        .eq("user_id", ctx.userId)
        .eq("content_hash", contentHash)
        .eq("options_hash", optHash)
        .eq("cache_version", cv)
        .maybeSingle();

      if (cached?.result && typeof cached.result === "object") {
        payload = cached.result as ProcessPayload;
      }
    }

    if (!payload) {
      payload = await executePipelineSync(record, { translation });
      if (canCache) {
        const { error: cacheErr } = await supabase.from("translation_cache").upsert(
          {
            user_id: ctx.userId,
            content_hash: contentHash,
            options_hash: optHash,
            cache_version: cv,
            result: payload as object,
            file_id: ctx.fileId,
          },
          {
            onConflict: "user_id,content_hash,options_hash,cache_version",
          },
        );
        if (cacheErr) {
          console.warn("[translation_cache]", cacheErr);
        }
      }
    }

    const texts = primaryTextsFromPayload(payload);

    const prevProcessed =
      (fileRow.processed_url as Record<string, unknown> | null) ?? {};
    const processedUrl: Record<string, unknown> = { ...prevProcessed };

    if (payload.category === "video") {
      processedUrl.srtEnglish = payload.srtEnglish;
      processedUrl.srtOriginal = payload.srtOriginal;
    }

    if (payload.category === "spreadsheet") {
      const peeked = peekDownload(payload.downloadToken);
      if (!peeked) {
        throw new Error(
          "Spreadsheet output was not available. Try processing again.",
        );
      }
      const up = await uploadBuffer(
        peeked.data,
        `outputs/${ctx.userId}`,
        peeked.fileName,
      );
      processedUrl.spreadsheetUrl = up.secureUrl;
      processedUrl.downloadFileName = payload.downloadFileName;
      takeDownload(payload.downloadToken);

      await supabase.from("translations").insert({
        file_id: ctx.fileId,
        detected_language: null,
        original_text: "[spreadsheet]",
        translated_text: "[spreadsheet translated]",
        target_language: translation?.targetLanguage ?? "English",
        mode: translation?.mode ?? "standard",
        custom_prompt: translation?.customInstructions ?? null,
        document_type: "spreadsheet",
      });
    } else if (texts) {
      await supabase.from("translations").insert({
        file_id: ctx.fileId,
        detected_language: texts.detectedLanguage,
        original_text: texts.original,
        translated_text: texts.translated,
        target_language: translation?.targetLanguage ?? "English",
        mode: translation?.mode ?? "standard",
        custom_prompt: translation?.customInstructions ?? null,
        document_type: null,
      });
    }

    const prevMeta =
      fileRow.metadata &&
      typeof fileRow.metadata === "object" &&
      !Array.isArray(fileRow.metadata)
        ? (fileRow.metadata as Record<string, unknown>)
        : {};

    await supabase
      .from("files")
      .update({
        status: "completed",
        processed_url: processedUrl,
        metadata: {
          ...prevMeta,
          content_sha256: contentHash,
        },
      })
      .eq("id", ctx.fileId);

    await recordProcessingUsage(supabase, {
      userId: ctx.userId,
      fileId: ctx.fileId,
      apiKeyId: ctx.apiKeyId,
      payload,
      bufferSize: buffer.length,
      spreadsheetBufferSize:
        payload.category === "spreadsheet" ? buffer.length : undefined,
    });

    return { ok: true };
  } catch (err) {
    console.error("[processAppFile]", err);
    await supabase
      .from("files")
      .update({ status: "failed" })
      .eq("id", ctx.fileId);
    const message = err instanceof Error ? err.message : "Processing failed.";
    return { ok: false, message };
  }
}

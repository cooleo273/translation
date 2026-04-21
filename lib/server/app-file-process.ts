import type { DocumentPipelineTranslation } from "@/lib/ai";
import { peekDownload, takeDownload } from "@/lib/download-tokens";
import { formatUserFacingError } from "@/lib/user-facing-errors";
import { loadGlossaryForUser } from "@/lib/glossary";
import { logAppEvent } from "@/lib/observability";
import {
  executePipelineSync,
  PIPELINE_CANCELED_MESSAGE,
} from "@/lib/server/pipeline-executor";
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
  jobId?: string | null;
};

type FileRowAll = {
  id: string;
  user_id: string;
  file_name: string;
  original_url: string | null;
  processed_url: unknown;
  metadata: unknown;
};

async function loadFileRow(
  supabase: SupabaseClient,
  ctx: ProcessAppFileContext,
): Promise<FileRowAll> {
  const { data: fileRow, error: fErr } = await supabase
    .from("files")
    .select("*")
    .eq("id", ctx.fileId)
    .eq("user_id", ctx.userId)
    .maybeSingle();

  if (fErr || !fileRow?.original_url) {
    throw new Error("File not found.");
  }

  return fileRow as FileRowAll;
}

async function setFileStatus(
  supabase: SupabaseClient,
  fileId: string,
  status: string,
) {
  await supabase.from("files").update({ status }).eq("id", fileId);
}

function normalizeMeta(meta: unknown): Record<string, unknown> {
  if (!meta || typeof meta !== "object" || Array.isArray(meta)) return {};
  return meta as Record<string, unknown>;
}

async function translationWithGlossary(
  supabase: SupabaseClient,
  ctx: ProcessAppFileContext,
) {
  const glossary = await loadGlossaryForUser(supabase, ctx.userId);
  if (!glossary.revision || !glossary.block) return ctx.translation;
  return {
    ...ctx.translation,
    targetLanguage: ctx.translation?.targetLanguage ?? "English",
    mode: ctx.translation?.mode ?? "standard",
    glossaryRevision: glossary.revision,
    glossaryBlock: glossary.block,
  } satisfies DocumentPipelineTranslation;
}

function makeAssertNotCanceled(supabase: SupabaseClient, jobId?: string | null) {
  if (!jobId) return async () => {};
  return async () => {
    const { data } = await supabase
      .from("processing_jobs")
      .select("status")
      .eq("id", jobId)
      .maybeSingle();
    if (data?.status === "canceled") throw new Error(PIPELINE_CANCELED_MESSAGE);
  };
}

async function fetchOriginalBuffer(url: string) {
  const resFetch = await fetch(url);
  if (!resFetch.ok) {
    throw new Error("Could not download original file from storage.");
  }
  return Buffer.from(await resFetch.arrayBuffer());
}

async function loadPayloadFromCache(
  supabase: SupabaseClient,
  userId: string,
  contentHash: string,
  optHash: string,
  cv: string,
): Promise<ProcessPayload | null> {
  const { data: cached } = await supabase
    .from("translation_cache")
    .select("result")
    .eq("user_id", userId)
    .eq("content_hash", contentHash)
    .eq("options_hash", optHash)
    .eq("cache_version", cv)
    .maybeSingle();
  if (cached?.result && typeof cached.result === "object") {
    return cached.result as ProcessPayload;
  }
  return null;
}

async function upsertPayloadCache(
  supabase: SupabaseClient,
  ctx: ProcessAppFileContext,
  contentHash: string,
  optHash: string,
  cv: string,
  payload: ProcessPayload,
) {
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
  if (cacheErr) console.warn("[translation_cache]", cacheErr);
}

async function writeTranslations(
  supabase: SupabaseClient,
  ctx: ProcessAppFileContext,
  payload: ProcessPayload,
  translation: DocumentPipelineTranslation | undefined,
  processedUrl: Record<string, unknown>,
) {
  if (payload.category === "spreadsheet") {
    const peeked = peekDownload(payload.downloadToken);
    if (!peeked) {
      throw new Error("Spreadsheet output was not available. Try processing again.");
    }
    const up = await uploadBuffer(
      peeked.data,
      `outputs/${ctx.userId}`,
      peeked.fileName,
      "auto",
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
    return;
  }

  const texts = primaryTextsFromPayload(payload);
  if (!texts) return;

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

export async function processAppFile(
  supabase: SupabaseClient,
  ctx: ProcessAppFileContext,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const assertNotCanceled = makeAssertNotCanceled(supabase, ctx.jobId);
  try {
    const fileRow = await loadFileRow(supabase, ctx);
    await setFileStatus(supabase, ctx.fileId, "processing");

    const translation = await translationWithGlossary(supabase, ctx);
    await assertNotCanceled();
    const buffer = await fetchOriginalBuffer(fileRow.original_url!);
    const record = buildUploadRecord(fileRow.file_name, buffer);
    const contentHash = sha256Buffer(buffer);
    const optHash = optionsHashFromTranslation(translation);
    const cv = cacheVersion();
    const canCache = record.category !== "spreadsheet";
    let payload: ProcessPayload | null = canCache
      ? await loadPayloadFromCache(supabase, ctx.userId, contentHash, optHash, cv)
      : null;

    await assertNotCanceled();
    if (!payload) {
      payload = await executePipelineSync(record, { translation });
      if (canCache) {
        await upsertPayloadCache(supabase, ctx, contentHash, optHash, cv, payload);
      }
    }

    const prevProcessed =
      (fileRow.processed_url as Record<string, unknown> | null) ?? {};
    const processedUrl: Record<string, unknown> = { ...prevProcessed };

    if (payload.category === "video") {
      processedUrl.srtEnglish = payload.srtEnglish;
      processedUrl.srtOriginal = payload.srtOriginal;
    }

    await assertNotCanceled();
    await writeTranslations(supabase, ctx, payload, translation, processedUrl);

    const prevMeta = normalizeMeta(fileRow.metadata);
    await assertNotCanceled();
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

    await assertNotCanceled();
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
    const isCanceled =
      err instanceof Error && err.message === PIPELINE_CANCELED_MESSAGE;
    if (isCanceled) {
      await setFileStatus(supabase, ctx.fileId, "canceled");
      return { ok: false, message: PIPELINE_CANCELED_MESSAGE };
    }
    const message = formatUserFacingError(err);
    logAppEvent({
      level: "error",
      event: "process_app_file_failed",
      userId: ctx.userId,
      fileId: ctx.fileId,
      error: err instanceof Error ? err.message : message,
    });
    console.error("[processAppFile]", err);
    await setFileStatus(supabase, ctx.fileId, "failed");
    return { ok: false, message };
  }
}

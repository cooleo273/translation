import type { DocumentPipelineTranslation } from "@/lib/ai";
import { assertProcessAllowedForPlan } from "@/lib/billing/enforcement";
import { maybeEnqueueFileJob } from "@/lib/queue/enqueue-app-job";
import { processAppFile } from "@/lib/server/app-file-process";
import type { MediaCategory } from "@/lib/types";
import type { SupabaseClient } from "@supabase/supabase-js";

export type TriggerProcessResult =
  | { ok: true; queued: boolean; jobId?: string }
  | {
      ok: false;
      message: string;
      status?: number;
      /** Pass-through JSON for plan limits (e.g. upgrade hints). */
      body?: object;
    };

/**
 * Shared logic for `/api/app/files/[id]/process` and batch processing.
 */
export async function triggerFileProcess(
  supabase: SupabaseClient,
  opts: {
    userId: string;
    fileId: string;
    translation?: DocumentPipelineTranslation;
  },
): Promise<TriggerProcessResult> {
  const { data: fileRow, error: fErr } = await supabase
    .from("files")
    .select("id, file_type, user_id, original_url")
    .eq("id", opts.fileId)
    .eq("user_id", opts.userId)
    .maybeSingle();

  if (fErr || !fileRow?.original_url) {
    return { ok: false, message: "File not found.", status: 404 };
  }

  const category = fileRow.file_type as MediaCategory;

  const blocked = await assertProcessAllowedForPlan({
    supabase,
    userId: opts.userId,
    category,
  });
  if (blocked) {
    const err = (blocked.body as { error?: string }).error;
    return {
      ok: false,
      message: err ?? "Not allowed.",
      status: blocked.status,
      body: blocked.body,
    };
  }

  const resFetch = await fetch(fileRow.original_url);
  if (!resFetch.ok) {
    return {
      ok: false,
      message: "Could not download original file from storage.",
      status: 502,
    };
  }
  const buffer = Buffer.from(await resFetch.arrayBuffer());

  const queued = await maybeEnqueueFileJob({
    supabase,
    userId: opts.userId,
    fileId: opts.fileId,
    bufferSize: buffer.length,
    category,
    translation: opts.translation,
  });

  if (queued) {
    return { ok: true, queued: true, jobId: queued.jobId };
  }

  const result = await processAppFile(supabase, {
    userId: opts.userId,
    fileId: opts.fileId,
    translation: opts.translation,
  });

  if (!result.ok) {
    // Map common user-facing processing failures to more appropriate HTTP statuses.
    // This prevents noisy 500s for policy/rate-limit outcomes.
    const m = result.message.toLowerCase();
    const isRateLimit = m.includes("temporarily busy") || m.includes("rate limit");
    const isPolicy = m.includes("content policies") || m.includes("policies");
    let status = 500;
    if (isRateLimit) status = 429;
    else if (isPolicy) status = 400;
    return { ok: false, message: result.message, status };
  }

  return { ok: true, queued: false };
}

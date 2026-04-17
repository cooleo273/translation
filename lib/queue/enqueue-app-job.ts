import type { DocumentPipelineTranslation } from "@/lib/ai";
import { getEffectivePlanForUser } from "@/lib/billing/enforcement";
import { limitsForPlan } from "@/lib/billing/plans";
import type { MediaCategory } from "@/lib/types";
import { getQueue } from "@/lib/queue/connection";
import type { SupabaseClient } from "@supabase/supabase-js";

/** Files at or above this size use the background worker when Redis is configured. */
export const LARGE_FILE_BYTES = 45 * 1024 * 1024;

export type EnqueueResult = { jobId: string };

/**
 * Enqueue video or very large files for Pro/Business when Redis + worker are available.
 * Otherwise returns null and the caller should run synchronously.
 */
export async function maybeEnqueueFileJob(opts: {
  supabase: SupabaseClient;
  userId: string;
  fileId: string;
  bufferSize: number;
  category: MediaCategory;
  translation?: DocumentPipelineTranslation;
}): Promise<EnqueueResult | null> {
  if (!process.env.REDIS_URL) {
    return null;
  }

  const plan = await getEffectivePlanForUser(opts.supabase, opts.userId);
  const limits = limitsForPlan(plan);

  const isHeavy =
    opts.category === "video" || opts.bufferSize >= LARGE_FILE_BYTES;
  if (!isHeavy) {
    return null;
  }

  if (opts.category === "video" && !limits.allowVideo) {
    return null;
  }

  const priority = limits.priorityProcessing;

  const queue = getQueue();
  if (!queue) {
    return null;
  }

  const { data: jobRow, error } = await opts.supabase
    .from("processing_jobs")
    .insert({
      user_id: opts.userId,
      file_id: opts.fileId,
      status: "queued",
      queue_name: "app-process",
      payload: {
        translation: opts.translation ?? null,
      },
    })
    .select("id")
    .single();

  if (error || !jobRow) {
    console.error("[enqueue job]", error);
    return null;
  }

  await opts.supabase
    .from("files")
    .update({ status: "processing" })
    .eq("id", opts.fileId);

  await queue.add(
    "process-file",
    {
      jobId: jobRow.id,
      userId: opts.userId,
      fileId: opts.fileId,
      translation: opts.translation ?? null,
    },
    {
      priority: priority ? 1 : 0,
      jobId: jobRow.id,
    },
  );

  return { jobId: jobRow.id };
}

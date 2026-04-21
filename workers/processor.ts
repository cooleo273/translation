import { Worker } from "bullmq";
import IORedis from "ioredis";
import type { DocumentPipelineTranslation } from "../lib/ai";
import { logAppEvent } from "../lib/observability";
import { processAppFile } from "../lib/server/app-file-process";
import { createServiceSupabaseClient } from "../lib/supabase/admin";
import { deliverJobWebhooks } from "../lib/webhooks/deliver-job-webhooks";

const redisUrl = process.env.REDIS_URL;
if (!redisUrl) {
  console.error("REDIS_URL is required for the worker.");
  process.exit(1);
}

const connection = new IORedis(redisUrl, { maxRetriesPerRequest: null });

const worker = new Worker(
  "app-process",
  async (job) => {
    const { jobId, userId, fileId, translation } = job.data as {
      jobId: string;
      userId: string;
      fileId: string;
      translation: DocumentPipelineTranslation | null;
    };

    const admin = createServiceSupabaseClient();
    const now = new Date().toISOString();
    const t0 = Date.now();

    const { data: jobRow } = await admin
      .from("processing_jobs")
      .select("status")
      .eq("id", jobId)
      .maybeSingle();

    if (jobRow?.status === "canceled") {
      await admin
        .from("processing_jobs")
        .update({ status: "canceled", updated_at: now })
        .eq("id", jobId);
      return;
    }

    await admin
      .from("processing_jobs")
      .update({ status: "active", updated_at: now })
      .eq("id", jobId);

    logAppEvent({
      event: "worker_job_started",
      userId,
      fileId,
      jobId,
    });

    const result = await processAppFile(admin, {
      userId,
      fileId,
      translation: translation ?? undefined,
      jobId,
    });

    if (!result.ok) {
      if (result.message === "Canceled") {
        await admin
          .from("processing_jobs")
          .update({
            status: "canceled",
            error: null,
            updated_at: new Date().toISOString(),
          })
          .eq("id", jobId);
        await deliverJobWebhooks({
          userId,
          jobId,
          fileId,
          status: "failed",
          error: "Canceled",
        });
        return;
      }
      await admin
        .from("processing_jobs")
        .update({
          status: "failed",
          error: result.message,
          updated_at: new Date().toISOString(),
        })
        .eq("id", jobId);
      logAppEvent({
        level: "error",
        event: "worker_job_failed",
        userId,
        fileId,
        jobId,
        durationMs: Date.now() - t0,
        error: result.message,
      });
      await deliverJobWebhooks({
        userId,
        jobId,
        fileId,
        status: "failed",
        error: result.message,
      });
      throw new Error(result.message);
    }

    await admin
      .from("processing_jobs")
      .update({
        status: "completed",
        result: { ok: true },
        updated_at: new Date().toISOString(),
      })
      .eq("id", jobId);

    logAppEvent({
      event: "worker_job_completed",
      userId,
      fileId,
      jobId,
      durationMs: Date.now() - t0,
    });

    await deliverJobWebhooks({
      userId,
      jobId,
      fileId,
      status: "completed",
    });
  },
  { connection },
);

console.log("Worker listening on queue app-process");
// Keep reference for observability / future shutdown hooks.
worker.on("error", (err) => {
  console.error("[worker error]", err);
});

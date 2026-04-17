import { Worker } from "bullmq";
import IORedis from "ioredis";
import { processAppFile } from "../lib/server/app-file-process";
import { createServiceSupabaseClient } from "../lib/supabase/admin";
import type { DocumentPipelineTranslation } from "../lib/ai";

const redisUrl = process.env.REDIS_URL;
if (!redisUrl) {
  console.error("REDIS_URL is required for the worker.");
  process.exit(1);
}

const connection = new IORedis(redisUrl, { maxRetriesPerRequest: null });

new Worker(
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

    await admin
      .from("processing_jobs")
      .update({ status: "active", updated_at: now })
      .eq("id", jobId);

    const result = await processAppFile(admin, {
      userId,
      fileId,
      translation: translation ?? undefined,
    });

    if (!result.ok) {
      await admin
        .from("processing_jobs")
        .update({
          status: "failed",
          error: result.message,
          updated_at: new Date().toISOString(),
        })
        .eq("id", jobId);
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
  },
  { connection },
);

console.log("Worker listening on queue app-process");

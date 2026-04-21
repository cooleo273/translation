import { requireUser } from "@/lib/controllers/require-user";
import { getQueue } from "@/lib/queue/connection";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;
  const { id } = await params;

  const { data: job, error } = await auth.supabase
    .from("processing_jobs")
    .select("id, status")
    .eq("id", id)
    .eq("user_id", auth.user.id)
    .maybeSingle();

  if (error || !job) {
    return NextResponse.json({ error: "Job not found." }, { status: 404 });
  }

  if (job.status === "completed" || job.status === "failed" || job.status === "canceled") {
    return NextResponse.json({ ok: true, status: job.status });
  }

  await auth.supabase
    .from("processing_jobs")
    .update({ status: "canceled", updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", auth.user.id);

  // Best-effort: if the job is still queued in BullMQ, remove it.
  const queue = getQueue();
  if (queue) {
    try {
      const bullJob = await queue.getJob(id);
      if (bullJob) {
        const state = await bullJob.getState();
        if (state === "waiting" || state === "delayed" || state === "unknown") {
          await bullJob.remove();
        }
      }
    } catch (e) {
      console.warn("[job cancel] bullmq remove failed", e);
    }
  }

  return NextResponse.json({ ok: true, status: "canceled" });
}


import { createHmac } from "crypto";
import { logAppEvent } from "@/lib/observability";
import { createServiceSupabaseClient } from "@/lib/supabase/admin";

export async function deliverJobWebhooks(opts: {
  userId: string;
  jobId: string;
  fileId: string | null;
  status: "completed" | "failed";
  error?: string | null;
}): Promise<void> {
  const admin = createServiceSupabaseClient();
  const { data: endpoints, error } = await admin
    .from("webhook_endpoints")
    .select("id, url, secret, events")
    .eq("user_id", opts.userId);

  if (error) {
    logAppEvent({
      level: "warn",
      event: "webhook_list_failed",
      userId: opts.userId,
      jobId: opts.jobId,
      error: error.message,
    });
    return;
  }
  if (!endpoints?.length) return;

  const eventName =
    opts.status === "completed" ? "job.completed" : "job.failed";
  const bodyObj = {
    event: eventName,
    job_id: opts.jobId,
    file_id: opts.fileId,
    status: opts.status,
    error: opts.error ?? null,
    ts: new Date().toISOString(),
  };
  const body = JSON.stringify(bodyObj);

  for (const ep of endpoints) {
    const ev = ep.events as string[] | null;
    if (ev?.length && !ev.includes(eventName)) continue;

    const signature = ep.secret
      ? createHmac("sha256", ep.secret).update(body).digest("hex")
      : "";

    try {
      const res = await fetch(ep.url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(signature
            ? { "X-Webhook-Signature": `sha256=${signature}` }
            : {}),
        },
        body,
        signal: AbortSignal.timeout(12_000),
      });
      if (!res.ok) {
        logAppEvent({
          level: "warn",
          event: "webhook_delivery_http_error",
          userId: opts.userId,
          jobId: opts.jobId,
          error: `${res.status}`,
        });
      }
    } catch (e) {
      logAppEvent({
        level: "warn",
        event: "webhook_delivery_failed",
        userId: opts.userId,
        jobId: opts.jobId,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }
}

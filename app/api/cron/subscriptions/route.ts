import { createServiceSupabaseClient } from "@/lib/supabase/admin";
import { sendPlanExpiryWarningEmail } from "@/lib/email/resend";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

/**
 * Daily check: subscriptions ending in ~3 days. Secured with CRON_SECRET.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const hdr = request.headers.get("authorization");
  const ok =
    secret &&
    (hdr === `Bearer ${secret}` ||
      request.headers.get("x-cron-secret") === secret);
  if (!ok) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createServiceSupabaseClient();
  const horizon = new Date();
  horizon.setUTCDate(horizon.getUTCDate() + 3);
  const horizonIso = horizon.toISOString();

  const { data: rows, error } = await admin
    .from("subscriptions")
    .select("user_id, end_date, plan_name")
    .not("end_date", "is", null)
    .lte("end_date", horizonIso)
    .eq("status", "active");

  if (error) {
    console.error("[cron subscriptions]", error);
    return NextResponse.json({ error: "Query failed" }, { status: 500 });
  }

  let notified = 0;
  for (const row of rows ?? []) {
    const { data: profile } = await admin
      .from("profiles")
      .select("email")
      .eq("id", row.user_id)
      .maybeSingle();
    const email = profile?.email;
    if (!email || !row.end_date) continue;
    await sendPlanExpiryWarningEmail(email, new Date(row.end_date).toLocaleDateString());
    notified += 1;
  }

  return NextResponse.json({ ok: true, checked: rows?.length ?? 0, notified });
}

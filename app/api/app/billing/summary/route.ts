import { countUserFilesToday, getEffectivePlanForUser } from "@/lib/billing/enforcement";
import { limitsForPlan } from "@/lib/billing/plans";
import { requireUser } from "@/lib/controllers/require-user";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET() {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;

  const { data: sub, error: sErr } = await auth.supabase
    .from("subscriptions")
    .select("*")
    .eq("user_id", auth.user.id)
    .maybeSingle();

  if (sErr) {
    return NextResponse.json({ error: "Could not load subscription." }, { status: 500 });
  }

  const plan = await getEffectivePlanForUser(auth.supabase, auth.user.id);
  const limits = limitsForPlan(plan);
  const filesToday = await countUserFilesToday(auth.supabase, auth.user.id);

  const since = new Date();
  since.setUTCDate(since.getUTCDate() - 14);
  since.setUTCHours(0, 0, 0, 0);

  const { data: logs, error: lErr } = await auth.supabase
    .from("usage_logs")
    .select("type, usage_amount, created_at")
    .eq("user_id", auth.user.id)
    .gte("created_at", since.toISOString())
    .order("created_at", { ascending: true });

  if (lErr) {
    return NextResponse.json({ error: "Could not load usage." }, { status: 500 });
  }

  const byDay: Record<
    string,
    { words: number; minutes: number }
  > = {};

  for (const row of logs ?? []) {
    const d = row.created_at.slice(0, 10);
    if (!byDay[d]) byDay[d] = { words: 0, minutes: 0 };
    if (row.type === "audio" || row.type === "video") {
      byDay[d].minutes += Number(row.usage_amount);
    } else {
      byDay[d].words += Number(row.usage_amount);
    }
  }

  const chart = Object.entries(byDay).map(([date, v]) => ({
    date,
    words: v.words,
    minutes: Math.round(v.minutes * 100) / 100,
  }));

  const { data: stats } = await auth.supabase
    .from("usage_stats")
    .select("*")
    .eq("user_id", auth.user.id)
    .maybeSingle();

  return NextResponse.json({
    subscription: sub,
    plan,
    limits: {
      maxFileMB: Math.floor(limits.maxFileBytes / (1024 * 1024)),
      maxFilesPerDay: limits.maxFilesPerDay,
      filesToday,
      allowVideo: limits.allowVideo,
      allowApiKeys: limits.allowApiKeys,
    },
    aggregates: stats,
    chart,
  });
}

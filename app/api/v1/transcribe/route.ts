import { getEffectivePlanForUser } from "@/lib/billing/enforcement";
import { limitsForPlan } from "@/lib/billing/plans";
import { recordApiCallUsage } from "@/lib/billing/usage-api-call";
import { resolveApiKeyFromRequest } from "@/lib/api-v1/resolve-api-key";
import { createServiceSupabaseClient } from "@/lib/supabase/admin";
import { transcribeAudio } from "@/lib/services/transcription-service";
import { minutesFromSegments } from "@/lib/utils/media-duration";
import { rateLimitApiKey } from "@/lib/rate-limit";
import { formatUserFacingError } from "@/lib/user-facing-errors";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(request: Request) {
  const resolved = await resolveApiKeyFromRequest(request);
  if (!resolved) {
    return NextResponse.json(
      { error: "Missing or invalid API key." },
      { status: 401 },
    );
  }

  const rl = await rateLimitApiKey(resolved.keyId);
  if (!rl.ok) {
    return NextResponse.json(
      { error: "Rate limit exceeded." },
      { status: 429, headers: rl.headers },
    );
  }

  const admin = createServiceSupabaseClient();
  const plan = await getEffectivePlanForUser(admin, resolved.userId);
  if (!limitsForPlan(plan).allowApiKeys) {
    return NextResponse.json(
      { error: "Business plan required for API access." },
      { status: 403 },
    );
  }

  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.includes("multipart/form-data")) {
    return NextResponse.json(
      { error: "Use multipart/form-data with field \"file\"." },
      { status: 400 },
    );
  }

  const formData = await request.formData();
  const file = formData.get("file");
  if (!file || !(file instanceof File)) {
    return NextResponse.json(
      { error: "Missing file field \"file\"." },
      { status: 400 },
    );
  }

  const buf = Buffer.from(await file.arrayBuffer());
  const name = file.name || "audio.mp3";

  try {
    const result = await transcribeAudio(buf, name);
    const minutes = Math.max(
      minutesFromSegments(result.segments),
      1 / 60,
    );
    const sec =
      result.segments.length > 0
        ? Math.max(...result.segments.map((s) => s.end))
        : 0;
    await recordApiCallUsage(admin, {
      userId: resolved.userId,
      apiKeyId: resolved.keyId,
      type: "audio",
      usageAmount: minutes,
      audioSecondsForStats: sec,
    });
    return NextResponse.json(
      {
        transcript: result.transcript,
        transcriptPlain: result.transcriptPlain,
        timestamps: result.timestamps,
        segments: result.segments,
        language: result.language,
      },
      { headers: rl.headers },
    );
  } catch (err) {
    console.error("[v1/transcribe]", err);
    return NextResponse.json(
      { error: formatUserFacingError(err) },
      { status: 500 },
    );
  }
}

import { detectLanguage, translateToEnglish } from "@/lib/ai";
import { getEffectivePlanForUser } from "@/lib/billing/enforcement";
import { limitsForPlan } from "@/lib/billing/plans";
import { recordApiCallUsage } from "@/lib/billing/usage-api-call";
import { resolveApiKeyFromRequest } from "@/lib/api-v1/resolve-api-key";
import { createServiceSupabaseClient } from "@/lib/supabase/admin";
import { extractTextFromImage } from "@/lib/services/ocr-service";
import { countWords } from "@/lib/utils/usage-metrics";
import { rateLimitApiKey } from "@/lib/rate-limit";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 120;

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
      { error: "Use multipart/form-data with field \"file\" (image)." },
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

  try {
    const originalText = await extractTextFromImage(buf);
    const { detectedLanguage, confidence } = await detectLanguage(originalText);
    const translatedText = await translateToEnglish(originalText);
    const words = countWords(originalText) + countWords(translatedText);
    await recordApiCallUsage(admin, {
      userId: resolved.userId,
      apiKeyId: resolved.keyId,
      type: "ocr",
      usageAmount: words,
      wordsForStats: words,
    });
    return NextResponse.json(
      {
        originalText,
        translatedText,
        detectedLanguage,
        confidence,
      },
      { headers: rl.headers },
    );
  } catch (err) {
    console.error("[v1/ocr]", err);
    const message = err instanceof Error ? err.message : "OCR failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

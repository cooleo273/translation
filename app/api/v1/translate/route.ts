import { detectLanguage, translateWithOptions } from "@/lib/ai";
import { getEffectivePlanForUser } from "@/lib/billing/enforcement";
import { limitsForPlan } from "@/lib/billing/plans";
import { recordApiCallUsage } from "@/lib/billing/usage-api-call";
import { resolveApiKeyFromRequest } from "@/lib/api-v1/resolve-api-key";
import { createServiceSupabaseClient } from "@/lib/supabase/admin";
import { extractText } from "@/lib/extract-text";
import type { DocumentKind } from "@/lib/types";
import { countWords } from "@/lib/utils/usage-metrics";
import { rateLimitApiKey } from "@/lib/rate-limit";
import { formatUserFacingError } from "@/lib/user-facing-errors";
import { NextResponse } from "next/server";
import { z } from "zod";

export const runtime = "nodejs";
export const maxDuration = 120;

const jsonSchema = z.object({
  text: z.string().min(1).max(500_000),
  targetLanguage: z.string().min(1).max(120).optional(),
});

export async function POST(request: Request) {
  const resolved = await resolveApiKeyFromRequest(request);
  if (!resolved) {
    return NextResponse.json(
      { error: "Missing or invalid API key. Use Authorization: Bearer trl_… or x-api-key." },
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

  try {
    if (contentType.includes("multipart/form-data")) {
      const formData = await request.formData();
      const file = formData.get("file");
      if (!file || !(file instanceof File)) {
        return NextResponse.json(
          { error: "Missing file field \"file\"." },
          { status: 400 },
        );
      }
      const targetLanguageRaw = formData.get("targetLanguage");
      const targetLanguage =
        typeof targetLanguageRaw === "string" && targetLanguageRaw.trim()
          ? targetLanguageRaw.trim()
          : "English";
      const buf = Buffer.from(await file.arrayBuffer());
      const name = file.name || "doc";
      const ext = name.slice(name.lastIndexOf(".")).toLowerCase();
      const kind =
        ext === ".pdf"
          ? "pdf"
          : ext === ".docx"
            ? "docx"
            : ext === ".txt"
              ? "txt"
              : null;
      if (!kind) {
        return NextResponse.json(
          { error: "Unsupported document type for v1 translate (use .pdf, .docx, .txt)." },
          { status: 400 },
        );
      }
      const originalText = await extractText(buf, kind as DocumentKind);
      const { detectedLanguage, confidence } = await detectLanguage(originalText);
      const translatedText = await translateWithOptions(originalText, {
        targetLanguage,
      });
      const words = countWords(originalText) + countWords(translatedText);
      await recordApiCallUsage(admin, {
        userId: resolved.userId,
        apiKeyId: resolved.keyId,
        type: "doc",
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
    }

    const json: unknown = await request.json();
    const parsed = jsonSchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "JSON body must be { text: string } or use multipart file." },
        { status: 400 },
      );
    }
    const originalText = parsed.data.text;
    const { detectedLanguage, confidence } = await detectLanguage(originalText);
    const translatedText = await translateWithOptions(originalText, {
      targetLanguage: parsed.data.targetLanguage ?? "English",
    });
    const words = countWords(originalText) + countWords(translatedText);
    await recordApiCallUsage(admin, {
      userId: resolved.userId,
      apiKeyId: resolved.keyId,
      type: "doc",
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
    console.error("[v1/translate]", err);
    return NextResponse.json(
      { error: formatUserFacingError(err) },
      { status: 500 },
    );
  }
}

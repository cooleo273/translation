import { detectLanguage, translateWithOptions, type DocumentPipelineTranslation } from "@/lib/ai";
import { requireUser } from "@/lib/controllers/require-user";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(request: Request) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid body." }, { status: 400 });
  }

  const b = body as {
    title?: unknown;
    text?: unknown;
    translation?: DocumentPipelineTranslation;
  };

  const text = typeof b.text === "string" ? b.text : "";
  const trimmed = text.trim();
  if (!trimmed) {
    return NextResponse.json({ error: "Text is required." }, { status: 400 });
  }

  const tr = b.translation;
  const targetLanguage = tr?.targetLanguage?.trim() || "English";
  const mode = tr?.mode ?? "standard";

  const { detectedLanguage } = await detectLanguage(trimmed);
  const translatedText = await translateWithOptions(trimmed, {
    targetLanguage,
    mode,
    customInstructions: tr?.customInstructions,
    documentTypeHint: tr?.documentTypeHint,
    glossaryBlock: tr?.glossaryBlock,
    glossaryRevision: tr?.glossaryRevision,
  });

  const title =
    typeof b.title === "string" && b.title.trim() ? b.title.trim() : "Text";

  const { data, error } = await auth.supabase
    .from("text_documents")
    .insert({
      user_id: auth.user.id,
      title,
      original_text: trimmed,
      translated_text: translatedText,
      detected_language: detectedLanguage,
      target_language: targetLanguage,
      mode,
    })
    .select("id")
    .single();

  if (error || !data) {
    console.error("[text_documents insert]", error);
    return NextResponse.json({ error: "Failed to save text translation." }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    id: data.id,
    detectedLanguage,
    translatedText,
  });
}


import { requireUser } from "@/lib/controllers/require-user";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;
  const { id } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const translatedTextRaw =
    body && typeof body === "object" && "translated_text" in body
      ? (body as { translated_text?: unknown }).translated_text
      : "";
  const translatedText = typeof translatedTextRaw === "string" ? translatedTextRaw : "";
  if (!translatedText.trim()) {
    return NextResponse.json({ error: "translated_text is required." }, { status: 400 });
  }

  const { data: doc, error: docErr } = await auth.supabase
    .from("text_documents")
    .select("id")
    .eq("id", id)
    .eq("user_id", auth.user.id)
    .maybeSingle();

  if (docErr || !doc) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  const { data: latest } = await auth.supabase
    .from("text_versions")
    .select("version")
    .eq("text_document_id", id)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();

  const nextVersion = (latest?.version ?? 0) + 1;

  const { error } = await auth.supabase.from("text_versions").insert({
    text_document_id: id,
    translated_text: translatedText,
    version: nextVersion,
  });

  if (error) {
    console.error("[text_versions insert]", error);
    return NextResponse.json({ error: "Failed to save version." }, { status: 500 });
  }

  await auth.supabase
    .from("text_documents")
    .update({ translated_text: translatedText, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", auth.user.id);

  return NextResponse.json({ ok: true, version: nextVersion });
}


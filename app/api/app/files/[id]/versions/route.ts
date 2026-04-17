import { requireUser } from "@/lib/controllers/require-user";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;
  const { id: fileId } = await params;
  const translationId = new URL(request.url).searchParams
    .get("translationId")
    ?.trim();

  if (translationId) {
    const { data, error } = await auth.supabase
      .from("translation_versions")
      .select("id, translation_id, version, translated_text, created_at")
      .eq("translation_id", translationId)
      .order("version", { ascending: false });

    if (error) {
      return NextResponse.json({ error: "Failed to load versions." }, { status: 500 });
    }
    return NextResponse.json({ versions: data ?? [] });
  }

  const { data: trans, error: tErr } = await auth.supabase
    .from("translations")
    .select("id")
    .eq("file_id", fileId)
    .order("created_at", { ascending: false });

  if (tErr) {
    return NextResponse.json({ error: "Failed to load translations." }, { status: 500 });
  }

  if (!trans?.length) {
    return NextResponse.json({ versions: [] });
  }

  const ids = trans.map((t) => t.id);
  const { data: vers, error: vErr } = await auth.supabase
    .from("translation_versions")
    .select("id, translation_id, version, translated_text, created_at")
    .in("translation_id", ids)
    .order("created_at", { ascending: false });

  if (vErr) {
    return NextResponse.json({ error: "Failed to load versions." }, { status: 500 });
  }

  return NextResponse.json({ versions: vers ?? [] });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;
  const { id: fileId } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const translatedText =
    typeof body === "object" &&
    body !== null &&
    "translated_text" in body &&
    typeof (body as { translated_text: unknown }).translated_text === "string"
      ? (body as { translated_text: string }).translated_text
      : null;

  if (!translatedText?.trim()) {
    return NextResponse.json({ error: "translated_text is required." }, { status: 400 });
  }

  let translationId: string | null =
    typeof body === "object" &&
    body !== null &&
    "translation_id" in body &&
    typeof (body as { translation_id: unknown }).translation_id === "string"
      ? (body as { translation_id: string }).translation_id
      : null;

  if (!translationId) {
    const { data: tr } = await auth.supabase
      .from("translations")
      .select("id")
      .eq("file_id", fileId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!tr) {
      return NextResponse.json(
        { error: "No translation exists for this file yet." },
        { status: 400 },
      );
    }
    translationId = tr.id;
  }

  const { data: trow, error: tErr } = await auth.supabase
    .from("translations")
    .select("id, file_id")
    .eq("id", translationId)
    .maybeSingle();

  if (tErr || trow?.file_id !== fileId) {
    return NextResponse.json({ error: "Invalid translation." }, { status: 400 });
  }

  const { data: maxVer } = await auth.supabase
    .from("translation_versions")
    .select("version")
    .eq("translation_id", translationId)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();

  const nextVersion = (maxVer?.version ?? 0) + 1;

  const { data: inserted, error: insErr } = await auth.supabase
    .from("translation_versions")
    .insert({
      translation_id: translationId,
      translated_text: translatedText,
      version: nextVersion,
    })
    .select("id, translation_id, version, translated_text, created_at")
    .single();

  if (insErr || !inserted) {
    console.error("[translation_versions insert]", insErr);
    return NextResponse.json({ error: "Could not save version." }, { status: 500 });
  }

  await auth.supabase
    .from("translations")
    .update({ translated_text: translatedText })
    .eq("id", translationId);

  return NextResponse.json({ version: inserted });
}

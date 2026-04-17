import { requireUser } from "@/lib/controllers/require-user";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;
  const { id } = await params;

  const { data: file, error: fErr } = await auth.supabase
    .from("files")
    .select("*")
    .eq("id", id)
    .eq("user_id", auth.user.id)
    .maybeSingle();

  if (fErr || !file) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  const { data: translations } = await auth.supabase
    .from("translations")
    .select("*")
    .eq("file_id", id)
    .order("created_at", { ascending: false });

  return NextResponse.json({ file, translations: translations ?? [] });
}

export async function PATCH(
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
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const fav =
    typeof body === "object" &&
    body !== null &&
    "is_favorite" in body &&
    typeof (body as { is_favorite: unknown }).is_favorite === "boolean"
      ? (body as { is_favorite: boolean }).is_favorite
      : undefined;

  if (fav === undefined) {
    return NextResponse.json({ error: "is_favorite required" }, { status: 400 });
  }

  const { error } = await auth.supabase
    .from("files")
    .update({ is_favorite: fav })
    .eq("id", id)
    .eq("user_id", auth.user.id);

  if (error) {
    return NextResponse.json({ error: "Update failed." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;
  const { id } = await params;

  const { error } = await auth.supabase
    .from("files")
    .delete()
    .eq("id", id)
    .eq("user_id", auth.user.id);

  if (error) {
    return NextResponse.json({ error: "Delete failed." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

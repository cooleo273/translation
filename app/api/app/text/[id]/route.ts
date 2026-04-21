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

  const { data, error } = await auth.supabase
    .from("text_documents")
    .select("*")
    .eq("id", id)
    .eq("user_id", auth.user.id)
    .maybeSingle();

  if (error || !data) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  const { data: versions } = await auth.supabase
    .from("text_versions")
    .select("*")
    .eq("text_document_id", id)
    .order("version", { ascending: false });

  return NextResponse.json({ doc: data, versions: versions ?? [] });
}


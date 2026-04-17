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
    .from("processing_jobs")
    .select("id, status, error, created_at, updated_at")
    .eq("id", id)
    .eq("user_id", auth.user.id)
    .maybeSingle();

  if (error || !data) {
    return NextResponse.json({ error: "Job not found." }, { status: 404 });
  }

  return NextResponse.json({
    id: data.id,
    status: data.status,
    error: data.error,
    created_at: data.created_at,
    updated_at: data.updated_at,
  });
}

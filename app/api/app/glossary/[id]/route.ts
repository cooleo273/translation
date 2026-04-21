import { requireUser } from "@/lib/controllers/require-user";
import { NextResponse } from "next/server";
import { z } from "zod";

export const runtime = "nodejs";

const patchSchema = z.object({
  source_term: z.string().min(1).max(500).optional(),
  target_term: z.string().min(1).max(500).optional(),
});

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
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid body." }, { status: 400 });
  }

  const updates: Record<string, string> = {};
  if (parsed.data.source_term !== undefined) {
    updates.source_term = parsed.data.source_term.trim();
  }
  if (parsed.data.target_term !== undefined) {
    updates.target_term = parsed.data.target_term.trim();
  }
  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No updates." }, { status: 400 });
  }

  const { data, error } = await auth.supabase
    .from("glossary_terms")
    .update(updates)
    .eq("id", id)
    .eq("user_id", auth.user.id)
    .select("id, source_term, target_term, created_at")
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: "Update failed." }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  return NextResponse.json({ term: data });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;
  const { id } = await params;

  const { error } = await auth.supabase
    .from("glossary_terms")
    .delete()
    .eq("id", id)
    .eq("user_id", auth.user.id);

  if (error) {
    return NextResponse.json({ error: "Delete failed." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

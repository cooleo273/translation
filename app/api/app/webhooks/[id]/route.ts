import { requireUser } from "@/lib/controllers/require-user";
import { NextResponse } from "next/server";
import { z } from "zod";

export const runtime = "nodejs";

const patchSchema = z.object({
  url: z.string().url().max(2048).optional(),
  secret: z.string().max(256).optional(),
  events: z.array(z.enum(["job.completed", "job.failed"])).optional(),
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

  const updates: Record<string, unknown> = {};
  if (parsed.data.url !== undefined) updates.url = parsed.data.url;
  if (parsed.data.secret !== undefined) updates.secret = parsed.data.secret;
  if (parsed.data.events !== undefined) updates.events = parsed.data.events;

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No updates." }, { status: 400 });
  }

  const { data, error } = await auth.supabase
    .from("webhook_endpoints")
    .update(updates)
    .eq("id", id)
    .eq("user_id", auth.user.id)
    .select("id, url, events, created_at")
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: "Update failed." }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  return NextResponse.json({ webhook: data });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;
  const { id } = await params;

  const { error } = await auth.supabase
    .from("webhook_endpoints")
    .delete()
    .eq("id", id)
    .eq("user_id", auth.user.id);

  if (error) {
    return NextResponse.json({ error: "Delete failed." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

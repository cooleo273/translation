import { requireUser } from "@/lib/controllers/require-user";
import { NextResponse } from "next/server";
import { z } from "zod";

export const runtime = "nodejs";

const createSchema = z.object({
  url: z.string().url().max(2048),
  secret: z.string().max(256).optional(),
  events: z.array(z.enum(["job.completed", "job.failed"])).optional(),
});

export async function GET() {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;

  const { data, error } = await auth.supabase
    .from("webhook_endpoints")
    .select("id, url, events, created_at")
    .eq("user_id", auth.user.id)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: "Could not load webhooks." }, { status: 500 });
  }

  return NextResponse.json({ webhooks: data ?? [] });
}

export async function POST(request: Request) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid body." }, { status: 400 });
  }

  const { data, error } = await auth.supabase
    .from("webhook_endpoints")
    .insert({
      user_id: auth.user.id,
      url: parsed.data.url,
      secret: parsed.data.secret ?? "",
      events: parsed.data.events?.length
        ? parsed.data.events
        : ["job.completed", "job.failed"],
    })
    .select("id, url, events, created_at")
    .single();

  if (error || !data) {
    console.error("[webhook insert]", error);
    return NextResponse.json({ error: "Could not create webhook." }, { status: 500 });
  }

  return NextResponse.json({ webhook: data });
}

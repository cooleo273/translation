import { requireUser } from "@/lib/controllers/require-user";
import { NextResponse } from "next/server";
import { z } from "zod";

export const runtime = "nodejs";

const createSchema = z.object({
  source_term: z.string().min(1).max(500),
  target_term: z.string().min(1).max(500),
});

export async function GET() {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;

  const { data, error } = await auth.supabase
    .from("glossary_terms")
    .select("id, source_term, target_term, created_at")
    .eq("user_id", auth.user.id)
    .order("source_term", { ascending: true });

  if (error) {
    return NextResponse.json({ error: "Could not load glossary." }, { status: 500 });
  }

  return NextResponse.json({ terms: data ?? [] });
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
    .from("glossary_terms")
    .upsert(
      {
        user_id: auth.user.id,
        source_term: parsed.data.source_term.trim(),
        target_term: parsed.data.target_term.trim(),
      },
      { onConflict: "user_id,source_term" },
    )
    .select("id, source_term, target_term, created_at")
    .single();

  if (error) {
    console.error("[glossary insert]", error);
    return NextResponse.json({ error: "Could not save term." }, { status: 500 });
  }

  return NextResponse.json({ term: data });
}

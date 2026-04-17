import { requireUser } from "@/lib/controllers/require-user";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;

  const url = new URL(request.url);
  const type = url.searchParams.get("type");
  const q = url.searchParams.get("q");

  let query = auth.supabase
    .from("files")
    .select("*")
    .eq("user_id", auth.user.id)
    .order("created_at", { ascending: false });

  if (type && type !== "all") {
    query = query.eq("file_type", type);
  }

  const { data, error } = await query;

  if (error) {
    console.error("[files GET]", error);
    return NextResponse.json({ error: "Failed to load files." }, { status: 500 });
  }

  let rows = data ?? [];
  if (q?.trim()) {
    const needle = q.trim().toLowerCase();
    rows = rows.filter((f: { file_name: string }) =>
      f.file_name.toLowerCase().includes(needle),
    );
  }

  return NextResponse.json({ files: rows });
}

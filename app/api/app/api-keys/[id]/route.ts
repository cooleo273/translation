import { requireUser } from "@/lib/controllers/require-user";
import { NextResponse } from "next/server";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;
  const { id } = await params;

  const { error } = await auth.supabase
    .from("api_keys")
    .delete()
    .eq("id", id)
    .eq("user_id", auth.user.id);

  if (error) {
    return NextResponse.json({ error: "Could not revoke key." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

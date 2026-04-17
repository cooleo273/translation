import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { User } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

export async function requireUser(): Promise<
  | { user: User; supabase: Awaited<ReturnType<typeof createServerSupabaseClient>> }
  | { error: NextResponse }
> {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) {
    return {
      error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }
  return { user, supabase };
}

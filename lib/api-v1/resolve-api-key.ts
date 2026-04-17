import { createHash } from "crypto";
import { createServiceSupabaseClient } from "@/lib/supabase/admin";

export function hashApiKey(secret: string): string {
  return createHash("sha256").update(secret, "utf8").digest("hex");
}

export async function resolveApiKeyFromRequest(
  request: Request,
): Promise<{ userId: string; keyId: string } | null> {
  const auth = request.headers.get("authorization");
  const xKey = request.headers.get("x-api-key");
  const raw =
    auth?.startsWith("Bearer ") ? auth.slice(7).trim() : xKey?.trim();
  if (!raw || !raw.startsWith("trl_")) {
    return null;
  }

  const keyHash = hashApiKey(raw);
  const admin = createServiceSupabaseClient();
  const { data, error } = await admin
    .from("api_keys")
    .select("id, user_id")
    .eq("key_hash", keyHash)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  await admin
    .from("api_keys")
    .update({ last_used_at: new Date().toISOString() })
    .eq("id", data.id);

  return { userId: data.user_id, keyId: data.id };
}

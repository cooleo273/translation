import { randomBytes } from "crypto";
import { getEffectivePlanForUser } from "@/lib/billing/enforcement";
import { limitsForPlan } from "@/lib/billing/plans";
import { hashApiKey } from "@/lib/api-v1/resolve-api-key";
import { requireUser } from "@/lib/controllers/require-user";
import { NextResponse } from "next/server";
import { z } from "zod";

const createSchema = z.object({
  name: z.string().max(120).optional(),
});

export async function GET() {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;

  const { data, error } = await auth.supabase
    .from("api_keys")
    .select("id, key_prefix, name, created_at, last_used_at")
    .eq("user_id", auth.user.id)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: "Could not load keys." }, { status: 500 });
  }

  return NextResponse.json({ keys: data ?? [] });
}

export async function POST(request: Request) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;

  const plan = await getEffectivePlanForUser(auth.supabase, auth.user.id);
  if (!limitsForPlan(plan).allowApiKeys) {
    return NextResponse.json(
      {
        error:
          "API keys are available on the Business plan. Upgrade to create keys.",
        upgrade: true,
      },
      { status: 403 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    body = {};
  }
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid body." }, { status: 400 });
  }

  const secret = randomBytes(32).toString("hex");
  const fullKey = `trl_${secret}`;
  const keyPrefix = fullKey.slice(0, 12);
  const keyHash = hashApiKey(fullKey);

  const { data, error } = await auth.supabase
    .from("api_keys")
    .insert({
      user_id: auth.user.id,
      key_prefix: keyPrefix,
      key_hash: keyHash,
      name: parsed.data.name ?? null,
    })
    .select("id")
    .single();

  if (error || !data) {
    console.error("[api-keys insert]", error);
    return NextResponse.json({ error: "Could not create key." }, { status: 500 });
  }

  return NextResponse.json({
    id: data.id,
    key: fullKey,
    keyPrefix,
    message: "Store this key securely; it will not be shown again.",
  });
}

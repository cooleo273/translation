import type { SupabaseClient } from "@supabase/supabase-js";
import type { MediaCategory } from "@/lib/types";
import {
  effectivePlanFromRow,
  GLOBAL_APP_MAX_BYTES,
  limitsForPlan,
  type PlanId,
} from "@/lib/billing/plans";

export const LIMIT_ERROR_CODE = "LIMIT_EXCEEDED" as const;

export type LimitErrorBody = {
  error: string;
  code: typeof LIMIT_ERROR_CODE;
  upgrade?: boolean;
  suggestedPlan?: "pro" | "business";
  detail?: string;
};

export async function getEffectivePlanForUser(
  supabase: SupabaseClient,
  userId: string,
): Promise<PlanId> {
  const { data } = await supabase
    .from("subscriptions")
    .select("plan_name, status")
    .eq("user_id", userId)
    .maybeSingle();

  if (!data) return "free";
  return effectivePlanFromRow(data.plan_name, data.status);
}

function utcDayStartIso(): string {
  const d = new Date();
  return new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0, 0),
  ).toISOString();
}

export async function countUserFilesToday(
  supabase: SupabaseClient,
  userId: string,
): Promise<number> {
  const { count, error } = await supabase
    .from("files")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .gte("created_at", utcDayStartIso());

  if (error) {
    console.error("[countUserFilesToday]", error);
    return 0;
  }
  return count ?? 0;
}

export type AssertUploadInput = {
  supabase: SupabaseClient;
  userId: string;
  bytes: number;
  category: MediaCategory;
};

export type AssertProcessInput = {
  supabase: SupabaseClient;
  userId: string;
  category: MediaCategory;
};

/**
 * New uploads: size, video tier, and daily file quota.
 */
export async function assertUploadAllowedForPlan(
  input: AssertUploadInput,
): Promise<{ status: number; body: LimitErrorBody } | null> {
  const plan = await getEffectivePlanForUser(input.supabase, input.userId);
  const limits = limitsForPlan(plan);

  if (input.bytes > GLOBAL_APP_MAX_BYTES) {
    return {
      status: 413,
      body: {
        error: `File exceeds maximum size (${Math.floor(GLOBAL_APP_MAX_BYTES / (1024 * 1024))}MB).`,
        code: LIMIT_ERROR_CODE,
        upgrade: plan === "free",
        suggestedPlan: "pro",
        detail: "size_global",
      },
    };
  }

  if (input.bytes > limits.maxFileBytes) {
    return {
      status: 413,
      body: {
        error: `File exceeds your plan limit (${Math.floor(limits.maxFileBytes / (1024 * 1024))}MB). Upgrade for higher limits.`,
        code: LIMIT_ERROR_CODE,
        upgrade: true,
        suggestedPlan: plan === "free" ? "pro" : "business",
        detail: "size_plan",
      },
    };
  }

  if (input.category === "video" && !limits.allowVideo) {
    return {
      status: 403,
      body: {
        error:
          "Video processing is not available on the Free plan. Upgrade to Pro or Business.",
        code: LIMIT_ERROR_CODE,
        upgrade: true,
        suggestedPlan: "pro",
        detail: "video_blocked",
      },
    };
  }

  if (limits.maxFilesPerDay !== null) {
    const n = await countUserFilesToday(input.supabase, input.userId);
    if (n >= limits.maxFilesPerDay) {
      return {
        status: 403,
        body: {
          error: `Daily file limit reached (${limits.maxFilesPerDay}/day). Upgrade or try again tomorrow.`,
          code: LIMIT_ERROR_CODE,
          upgrade: true,
          suggestedPlan: plan === "free" ? "pro" : "business",
          detail: "daily_files",
        },
      };
    }
  }

  return null;
}

/**
 * Processing an existing file: re-check video tier (plan may have changed).
 */
export async function assertProcessAllowedForPlan(
  input: AssertProcessInput,
): Promise<{ status: number; body: LimitErrorBody } | null> {
  const plan = await getEffectivePlanForUser(input.supabase, input.userId);
  const limits = limitsForPlan(plan);

  if (input.category === "video" && !limits.allowVideo) {
    return {
      status: 403,
      body: {
        error:
          "Video processing is not available on the Free plan. Upgrade to Pro or Business.",
        code: LIMIT_ERROR_CODE,
        upgrade: true,
        suggestedPlan: "pro",
        detail: "video_blocked",
      },
    };
  }

  return null;
}

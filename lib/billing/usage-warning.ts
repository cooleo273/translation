import type { SupabaseClient } from "@supabase/supabase-js";
import { countUserFilesToday, getEffectivePlanForUser } from "@/lib/billing/enforcement";
import { limitsForPlan } from "@/lib/billing/plans";
import { sendUsageWarningEmail } from "@/lib/email/resend";

export async function notifyUsageWarningIfNeeded(
  supabase: SupabaseClient,
  userId: string,
  email: string | undefined,
): Promise<void> {
  if (!email) return;
  const plan = await getEffectivePlanForUser(supabase, userId);
  const limits = limitsForPlan(plan);
  if (limits.maxFilesPerDay === null) return;

  const n = await countUserFilesToday(supabase, userId);
  const threshold = Math.ceil(limits.maxFilesPerDay * 0.8);
  /** Notify once when crossing the 80% threshold, not on every subsequent upload. */
  if (n !== threshold) return;

  await sendUsageWarningEmail(
    email,
    `You have used ${n} of ${limits.maxFilesPerDay} files today on your ${plan} plan. Consider upgrading if you need more capacity.`,
  );
}

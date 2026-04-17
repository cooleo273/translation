import type { UsageLogType } from "@/lib/billing/usage";
import { incrementUsage } from "@/lib/services/usage-service";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  ratePerAudioMinuteUsd,
  ratePerVideoMinuteUsd,
  ratePerWordUsd,
} from "@/lib/billing/rates";

function costForType(type: UsageLogType, amount: number): number {
  switch (type) {
    case "doc":
    case "ocr":
    case "spreadsheet":
      return amount * ratePerWordUsd();
    case "audio":
      return amount * ratePerAudioMinuteUsd();
    case "video":
      return amount * ratePerVideoMinuteUsd();
    default:
      return 0;
  }
}

export async function recordApiCallUsage(
  supabase: SupabaseClient,
  opts: {
    userId: string;
    apiKeyId: string;
    type: UsageLogType;
    usageAmount: number;
    wordsForStats?: number;
    audioSecondsForStats?: number;
  },
): Promise<void> {
  const cost = costForType(opts.type, opts.usageAmount);
  await incrementUsage(supabase, opts.userId, {
    files: 0,
    words: opts.wordsForStats ?? 0,
    audioSeconds: opts.audioSecondsForStats ?? 0,
  });

  const { error } = await supabase.from("usage_logs").insert({
    user_id: opts.userId,
    file_id: null,
    api_key_id: opts.apiKeyId,
    type: opts.type,
    usage_amount: opts.usageAmount,
    cost,
    metadata: { source: "api_v1" },
  });

  if (error) {
    console.error("[usage_logs api]", error);
  }
}

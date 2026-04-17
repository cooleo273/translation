import type { SupabaseClient } from "@supabase/supabase-js";

export async function incrementUsage(
  supabase: SupabaseClient,
  userId: string,
  delta: {
    files?: number;
    words?: number;
    audioSeconds?: number;
  },
) {
  const { data: row } = await supabase
    .from("usage_stats")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  await supabase.from("usage_stats").upsert(
    {
      user_id: userId,
      files_processed: (row?.files_processed ?? 0) + (delta.files ?? 0),
      words_translated: Number(row?.words_translated ?? 0) + (delta.words ?? 0),
      audio_seconds_processed:
        (row?.audio_seconds_processed ?? 0) + (delta.audioSeconds ?? 0),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );
}

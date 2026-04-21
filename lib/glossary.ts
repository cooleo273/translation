import { createHash } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

export type GlossaryPayload = {
  /** Short stable hash of current rows; included in translation cache key */
  revision: string;
  /** Human-readable block appended to translator system instructions */
  block: string;
};

/**
 * Loads glossary rows for a user and builds prompt + cache-revision material.
 */
export async function loadGlossaryForUser(
  supabase: SupabaseClient,
  userId: string,
): Promise<GlossaryPayload> {
  const { data, error } = await supabase
    .from("glossary_terms")
    .select("source_term, target_term")
    .eq("user_id", userId)
    .order("source_term", { ascending: true });

  if (error || !data?.length) {
    return { revision: "", block: "" };
  }

  const lines = data.map(
    (r) => `${r.source_term.trim()}\t${r.target_term.trim()}`,
  );
  const revision = createHash("sha256")
    .update(lines.join("\n"), "utf8")
    .digest("hex")
    .slice(0, 32);

  const block =
    "Preferred translations for these terms (apply consistently; keep natural phrasing elsewhere):\n" +
    data
      .map(
        (r) =>
          `- Source: ${r.source_term.trim()} → Target: ${r.target_term.trim()}`,
      )
      .join("\n");

  return { revision, block };
}

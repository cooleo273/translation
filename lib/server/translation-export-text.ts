import type { SupabaseClient } from "@supabase/supabase-js";

function baseName(fileName: string, fallback: string): string {
  const n = fileName?.trim() || fallback;
  return n.replace(/\.[^.]+$/, "") || fallback;
}

export type TranslationExportTextResult =
  | { ok: true; stem: string; text: string }
  | { ok: false; message: string };

/**
 * Latest non-spreadsheet translation text for export (txt/pdf/docx).
 */
export async function getTranslatedPlainTextForFile(
  supabase: SupabaseClient,
  userId: string,
  fileId: string,
): Promise<TranslationExportTextResult> {
  const { data: fileRow, error: fErr } = await supabase
    .from("files")
    .select("file_name")
    .eq("id", fileId)
    .eq("user_id", userId)
    .maybeSingle();

  if (fErr || !fileRow) {
    return { ok: false, message: "Not found." };
  }

  const { data: tr } = await supabase
    .from("translations")
    .select("translated_text, document_type")
    .eq("file_id", fileId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const text = tr?.translated_text;
  if (
    !text?.trim() ||
    tr?.document_type === "spreadsheet" ||
    text === "[spreadsheet translated]"
  ) {
    return {
      ok: false,
      message:
        "No plain translation text for export. Process the file or use spreadsheet export.",
    };
  }

  return {
    ok: true,
    stem: baseName(fileRow.file_name, "translation"),
    text,
  };
}

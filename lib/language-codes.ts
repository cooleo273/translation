/**
 * Normalize Gemini / user language hints to ISO 639-1 (two lowercase letters).
 */
export function normalizeIso6391(raw?: string | null): string | null {
  if (!raw || typeof raw !== "string") return null;
  const t = raw.trim().toLowerCase();
  if (!t || t === "unknown" || t === "und" || t === "unk") return null;
  if (/^[a-z]{2}$/.test(t)) return t;
  return null;
}

/**
 * English display name for an ISO 639-1 code (e.g. "fr" → "French").
 */
export function englishLanguageNameFromIso6391(code: string): string | null {
  const c = normalizeIso6391(code);
  if (!c) return null;
  try {
    const name = new Intl.DisplayNames(["en"], { type: "language" }).of(c);
    return typeof name === "string" && name.length > 0 ? name : null;
  } catch {
    return null;
  }
}

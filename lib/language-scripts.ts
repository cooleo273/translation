/**
 * Infer ISO 639-1 from dominant Unicode script (when the model mislabels language as English).
 */

function isEthiopicCodePoint(cp: number): boolean {
  return (
    (cp >= 0x1200 && cp <= 0x137f) ||
    (cp >= 0x1380 && cp <= 0x139f) ||
    (cp >= 0x2d80 && cp <= 0x2ddf) ||
    (cp >= 0xab00 && cp <= 0xab2f)
  );
}

/**
 * If the transcript contains Ge'ez / Ethiopic letters, the language is almost certainly
 * Amharic or a related Ethiopian language; we map to `am` for UI/translation routing.
 */
export function inferIso639FromScripts(text: string): string | null {
  const t = text.trim();
  if (t.length === 0) return null;

  let ethiopic = 0;
  let i = 0;
  while (i < t.length) {
    const cp = t.codePointAt(i)!;
    if (isEthiopicCodePoint(cp)) ethiopic++;
    i += cp > 0xffff ? 2 : 1;
  }

  if (ethiopic === 0) return null;
  // Any Ethiopic content is a strong signal (models often return language "en" anyway).
  if (ethiopic >= 2) return "am";
  if (ethiopic >= 1 && t.length <= 32) return "am";
  return ethiopic / t.length >= 0.03 ? "am" : null;
}

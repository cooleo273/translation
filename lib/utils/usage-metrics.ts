export function countWords(text?: string | null): number {
  const t = text?.trim();
  if (!t) return 0;
  return t
    .split(/\s+/)
    .filter((w) => w.length > 0).length;
}

/** Rough estimate when duration unknown (placeholder for billing). */
export function estimateAudioSecondsFromBytes(bytes: number): number {
  return Math.max(1, Math.round(bytes / 16000));
}

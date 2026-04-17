export function countWords(text: string): number {
  return text
    .trim()
    .split(/\s+/)
    .filter((w) => w.length > 0).length;
}

/** Rough estimate when duration unknown (placeholder for billing). */
export function estimateAudioSecondsFromBytes(bytes: number): number {
  return Math.max(1, Math.round(bytes / 16000));
}

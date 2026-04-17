import type { TranscriptSegment } from "./transcription-service";

function formatSrtTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.round((seconds % 1) * 1000);
  const pad = (n: number, w: number) => n.toString().padStart(w, "0");
  return `${pad(h, 2)}:${pad(m, 2)}:${pad(s, 2)},${pad(ms, 3)}`;
}

/**
 * Build SRT file content from segments (1-based indices).
 */
export function segmentsToSrt(
  segments: TranscriptSegment[],
  texts?: string[],
): string {
  const lines: string[] = [];
  segments.forEach((seg, idx) => {
    const text = texts?.[idx] ?? seg.text;
    const t = text.trim();
    if (!t) return;
    lines.push(String(idx + 1));
    lines.push(
      `${formatSrtTime(seg.start)} --> ${formatSrtTime(seg.end)}`,
    );
    lines.push(t);
    lines.push("");
  });
  return lines.join("\n").trimEnd();
}

import type { TranscriptSegment } from "@/lib/services/transcription-service";
import { estimateAudioSecondsFromBytes } from "@/lib/utils/usage-metrics";

/** Duration in whole seconds from transcript segments (last end time). */
export function secondsFromSegments(segments: TranscriptSegment[]): number {
  if (!segments.length) return 0;
  const lastEnd = Math.max(...segments.map((s) => s.end));
  return Math.max(0, lastEnd);
}

export function minutesFromSegments(segments: TranscriptSegment[]): number {
  const sec = secondsFromSegments(segments);
  if (sec <= 0) return 0;
  return Math.max(1 / 60, sec / 60);
}

export function minutesFromAudioOrVideo(
  segments: TranscriptSegment[],
  bufferSize: number,
): number {
  const m = minutesFromSegments(segments);
  if (m > 0) return m;
  const estSec = estimateAudioSecondsFromBytes(bufferSize);
  return Math.max(1 / 60, estSec / 60);
}

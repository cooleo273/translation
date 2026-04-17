/** Convert SRT timing commas to WebVTT (period ms separator). */
export function srtToVtt(srt: string): string {
  const lines = srt.split(/\r?\n/);
  const out: string[] = ["WEBVTT", ""];
  for (const line of lines) {
    if (line.includes("-->")) {
      out.push(line.replace(/,/g, "."));
    } else {
      out.push(line);
    }
  }
  return out.join("\n");
}

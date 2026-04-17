import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { getFfmpegPath } from "@/lib/ffmpeg-path";

/**
 * Extract mono WAV audio from video buffer for transcription (Gemini).
 * Cleans up temp files in `finally`.
 */
export async function extractAudioFromVideo(
  videoBuffer: Buffer,
  originalName: string,
): Promise<{ audioBuffer: Buffer; cleanup: () => Promise<void> }> {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "vid-"));
  const ext = path.extname(originalName) || ".mp4";
  const inPath = path.join(tmpDir, `input${ext}`);
  const outPath = path.join(tmpDir, "audio.wav");

  await fs.writeFile(inPath, videoBuffer);

  const ffmpegPath = await getFfmpegPath();

  await new Promise<void>((resolve, reject) => {
    const args = [
      "-y",
      "-i",
      inPath,
      "-vn",
      "-acodec",
      "pcm_s16le",
      "-ac",
      "1",
      "-ar",
      "16000",
      outPath,
    ];
    const child = spawn(ffmpegPath, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stderr = "";
    child.stderr?.on("data", (d: Buffer) => {
      stderr += d.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg exited with ${code}: ${stderr.slice(-500)}`));
    });
  });

  const audioBuffer = await fs.readFile(outPath);

  const cleanup = async () => {
    try {
      await fs.rm(tmpDir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  };

  return { audioBuffer, cleanup };
}

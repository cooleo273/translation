import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { getFfmpegPath } from "@/lib/ffmpeg-path";

/** Long audio is transcribed in chunks to avoid model output limits and coverage gaps. */
export const AUDIO_TRANSCRIBE_CHUNK_SECONDS = 300;

async function runFfmpeg(args: string[]): Promise<void> {
  const ffmpegPath = await getFfmpegPath();
  await new Promise<void>((resolve, reject) => {
    const child = spawn(ffmpegPath, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stderr = "";
    child.stderr?.on("data", (d: Buffer) => {
      stderr += d.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg exited with ${code}: ${stderr.slice(-800)}`));
    });
  });
}

/**
 * Parse duration from ffmpeg -i stderr (seconds, fractional).
 * Returns null if parsing fails.
 */
export async function probeAudioDurationSeconds(
  buffer: Buffer,
  fileName: string,
): Promise<number | null> {
  const ext = path.extname(fileName) || ".mp3";
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "auddur-"));
  const inPath = path.join(tmpDir, `input${ext}`);
  await fs.writeFile(inPath, buffer);
  try {
    const ffmpegPath = await getFfmpegPath();
    const stderr = await new Promise<string>((resolve, reject) => {
      const child = spawn(ffmpegPath, ["-i", inPath], {
        stdio: ["ignore", "ignore", "pipe"],
      });
      let err = "";
      child.stderr?.on("data", (d: Buffer) => {
        err += d.toString();
      });
      child.on("error", reject);
      child.on("close", () => resolve(err));
    });
    const m = stderr.match(/Duration:\s*(\d+):(\d+):(\d+\.?\d*)/);
    if (!m) return null;
    const h = parseInt(m[1], 10);
    const min = parseInt(m[2], 10);
    const sec = parseFloat(m[3]);
    if (!Number.isFinite(h) || !Number.isFinite(min) || !Number.isFinite(sec)) {
      return null;
    }
    return h * 3600 + min * 60 + sec;
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
}

/**
 * Extract [startSec, startSec + durationSec) as mono 16kHz WAV for Gemini.
 */
export async function extractAudioChunkAsWav(
  buffer: Buffer,
  fileName: string,
  startSec: number,
  durationSec: number,
): Promise<Buffer> {
  const ext = path.extname(fileName) || ".mp3";
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "audchk-"));
  const inPath = path.join(tmpDir, `input${ext}`);
  const outPath = path.join(tmpDir, "chunk.wav");
  await fs.writeFile(inPath, buffer);
  try {
    await runFfmpeg([
      "-y",
      "-ss",
      String(startSec),
      "-i",
      inPath,
      "-t",
      String(durationSec),
      "-vn",
      "-acodec",
      "pcm_s16le",
      "-ac",
      "1",
      "-ar",
      "16000",
      outPath,
    ]);
    return await fs.readFile(outPath);
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
}

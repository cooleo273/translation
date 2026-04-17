/** Shared path to the ffmpeg binary from @ffmpeg-installer/ffmpeg. */
export async function getFfmpegPath(): Promise<string> {
  const { default: ffmpegInstaller } = await import("@ffmpeg-installer/ffmpeg");
  return ffmpegInstaller.path;
}

/** PAYG rates (USD); override via env if needed */
export function ratePerWordUsd(): number {
  const v = Number(process.env.PAYG_RATE_PER_WORD_USD);
  return Number.isFinite(v) && v >= 0 ? v : 0.00002;
}

export function ratePerAudioMinuteUsd(): number {
  const v = Number(process.env.PAYG_RATE_AUDIO_MINUTE_USD);
  return Number.isFinite(v) && v >= 0 ? v : 0.02;
}

export function ratePerVideoMinuteUsd(): number {
  const v = Number(process.env.PAYG_RATE_VIDEO_MINUTE_USD);
  return Number.isFinite(v) && v >= 0 ? v : 0.04;
}

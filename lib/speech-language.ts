import {
  detectLanguage,
  detectLanguageSkepticalOfEnglishSpeech,
  type DetectionResult,
} from "@/lib/ai";
import {
  englishLanguageNameFromIso6391,
  normalizeIso6391,
} from "@/lib/language-codes";
import { inferIso639FromScripts } from "@/lib/language-scripts";

function looksEnglishLabel(r: DetectionResult): boolean {
  return r.detectedLanguage.trim().toLowerCase() === "english";
}

/**
 * Combines: Ge'ez script → Amharic; dedicated audio language ID; transcription
 * metadata (unreliable for "en"); text-based detection last.
 */
export async function resolveSpeechLanguage(
  transcriptPlain: string,
  transcriptionLanguageHint?: string | null,
  audioLanguageCode?: string | null,
): Promise<DetectionResult> {
  const scriptIso = inferIso639FromScripts(transcriptPlain);
  if (scriptIso) {
    const name = englishLanguageNameFromIso6391(scriptIso);
    if (name) {
      return { detectedLanguage: name, confidence: 0.93 };
    }
  }

  const fromAudio = normalizeIso6391(audioLanguageCode ?? undefined);
  if (fromAudio && fromAudio !== "en") {
    const name = englishLanguageNameFromIso6391(fromAudio);
    if (name) {
      return { detectedLanguage: name, confidence: 0.91 };
    }
  }

  const code = normalizeIso6391(transcriptionLanguageHint ?? undefined);
  if (code && code !== "en") {
    const name = englishLanguageNameFromIso6391(code);
    if (name) {
      return { detectedLanguage: name, confidence: 0.88 };
    }
  }

  const primary = await detectLanguage(transcriptPlain);
  const t = transcriptPlain.trim();
  if (t.length >= 12 && looksEnglishLabel(primary)) {
    try {
      const alt = await detectLanguageSkepticalOfEnglishSpeech(transcriptPlain);
      if (!looksEnglishLabel(alt)) {
        return alt;
      }
    } catch {
      /* keep primary */
    }
  }

  return primary;
}

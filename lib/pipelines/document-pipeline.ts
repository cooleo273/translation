import {
  detectDocumentType,
  detectLanguage,
  translateToEnglish,
  translateWithOptions,
  type DocumentPipelineTranslation,
} from "@/lib/ai";
import { extractText } from "@/lib/extract-text";
import type { DocumentKind } from "@/lib/types";

/** Phase 1 document path: extract → detect → translate (unchanged when `translation` omitted). */
export async function runDocumentPipeline(
  buffer: Buffer,
  kind: DocumentKind,
  onStep?: (phase: "extracting" | "translating") => void,
  translation?: DocumentPipelineTranslation,
) {
  onStep?.("extracting");
  const originalText = await extractText(buffer, kind);
  onStep?.("translating");
  const { detectedLanguage, confidence } = await detectLanguage(originalText);

  let translatedText: string;
  if (!translation) {
    translatedText = await translateToEnglish(originalText);
  } else {
    let docHint = translation.documentTypeHint;
    if (
      translation.autoDetectDocumentType !== false &&
      !docHint
    ) {
      docHint = await detectDocumentType(originalText);
    }
    translatedText = await translateWithOptions(originalText, {
      targetLanguage: translation.targetLanguage ?? "English",
      mode: translation.mode ?? "standard",
      customInstructions: translation.customInstructions,
      documentTypeHint: docHint,
    });
  }

  return {
    originalText,
    translatedText,
    detectedLanguage,
    confidence,
  };
}

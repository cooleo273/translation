import type { ProcessPayload } from "@/lib/process-types";

export function primaryTextsFromPayload(
  payload: ProcessPayload,
): { original: string; translated: string; detectedLanguage: string } | null {
  switch (payload.category) {
    case "document":
    case "image":
      return {
        original: payload.originalText,
        translated: payload.translatedText,
        detectedLanguage: payload.detectedLanguage,
      };
    case "audio":
    case "video":
      return {
        original: payload.transcriptPlain ?? payload.transcript,
        translated: payload.translatedText,
        detectedLanguage: payload.detectedLanguage,
      };
    case "spreadsheet":
      return null;
  }
}

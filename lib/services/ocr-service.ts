import { createWorker } from "tesseract.js";

/**
 * Extract text from image buffer (JPG/PNG).
 */
export async function extractTextFromImage(
  buffer: Buffer,
): Promise<string> {
  const worker = await createWorker("eng", 1, {
    logger: () => {
      /* quiet */
    },
  });
  try {
    const {
      data: { text },
    } = await worker.recognize(buffer);
    const trimmed = text.trim();
    if (!trimmed) {
      throw new Error(
        "No text could be read from this image. Try a clearer scan or higher resolution.",
      );
    }
    return trimmed;
  } finally {
    await worker.terminate();
  }
}

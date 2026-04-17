import mammoth from "mammoth";
import type { DocumentKind } from "./types";

const MAX_CHARS = 120_000;

function stripBom(text: string): string {
  if (text.charCodeAt(0) === 0xfeff) {
    return text.slice(1);
  }
  return text;
}

function assertNonEmpty(text: string, label: string): string {
  const t = text.trim();
  if (!t) {
    throw new Error(`No extractable text found in ${label} file.`);
  }
  return text;
}

function capLength(text: string): string {
  if (text.length > MAX_CHARS) {
    throw new Error(
      `Extracted text exceeds ${MAX_CHARS.toLocaleString()} characters. Please use a smaller document.`,
    );
  }
  return text;
}

export async function extractText(
  buffer: Buffer,
  kind: DocumentKind,
): Promise<string> {
  let raw: string;

  switch (kind) {
    case "txt": {
      raw = stripBom(buffer.toString("utf8"));
      break;
    }
    case "docx": {
      const result = await mammoth.extractRawText({ buffer });
      raw = result.value;
      break;
    }
    case "pdf": {
      const { PDFParse } = await import("pdf-parse");
      const parser = new PDFParse({ data: buffer });
      try {
        const textResult = await parser.getText();
        raw = textResult.text;
      } finally {
        await parser.destroy();
      }
      break;
    }
  }

  const text = capLength(assertNonEmpty(raw, kind));
  return text;
}

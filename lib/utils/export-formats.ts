import { Document, Packer, Paragraph, TextRun } from "docx";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";

let cachedUnicodeFont: Uint8Array | null = null;
async function getUnicodeFontBytes(): Promise<Uint8Array> {
  if (cachedUnicodeFont) return cachedUnicodeFont;
  // Noto Sans Ethiopic includes Ethiopic + Latin; good general Unicode fallback for our use-case.
  const url =
    "https://cdn.jsdelivr.net/fontsource/fonts/noto-sans-ethiopic@latest/ethiopic-400-normal.ttf";
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error("Could not load Unicode font for PDF export.");
  }
  const buf = new Uint8Array(await res.arrayBuffer());
  cachedUnicodeFont = buf;
  return buf;
}

function needsUnicodeFont(text: string): boolean {
  // If any non-Latin1 characters are present, standard PDF fonts will fail.
  return /[^\u0000-\u00FF]/.test(text);
}

export async function buildTxtBuffer(text: string): Promise<Buffer> {
  return Buffer.from(text, "utf8");
}

export async function buildDocxBuffer(text: string): Promise<Buffer> {
  const lines = text.split(/\n/);
  const doc = new Document({
    sections: [
      {
        children: lines.map(
          (line) =>
            new Paragraph({
              children: [new TextRun(line)],
            }),
        ),
      },
    ],
  });
  const buf = await Packer.toBuffer(doc);
  return Buffer.from(buf);
}

async function choosePdfFont(pdfDoc: PDFDocument, text: string) {
  const unicode = needsUnicodeFont(text);
  if (unicode) {
    pdfDoc.registerFontkit(fontkit);
    return await pdfDoc.embedFont(await getUnicodeFontBytes(), { subset: true });
  }
  return await pdfDoc.embedFont(StandardFonts.Helvetica);
}

export async function buildPdfBuffer(text: string): Promise<Buffer> {
  const pdfDoc = await PDFDocument.create();
  const font = await choosePdfFont(pdfDoc, text);
  const fontSize = 10;
  let page = pdfDoc.addPage([595.28, 841.89]);
  let y = 800;
  const margin = 50;
  const lineHeight = fontSize * 1.35;
  const maxLineWidth = 495;

  const drawLine = (s: string) => {
    page.drawText(s.slice(0, 5000), {
      x: margin,
      y,
      size: fontSize,
      font,
      color: rgb(0.1, 0.1, 0.1),
    });
    y -= lineHeight;
    if (y < 60) {
      page = pdfDoc.addPage([595.28, 841.89]);
      y = 800;
    }
  };

  const paragraphs = text.split(/\n/);
  for (const para of paragraphs) {
    const words = para.split(/\s+/);
    let line = "";
    for (const w of words) {
      const test = line ? `${line} ${w}` : w;
      const tw = font.widthOfTextAtSize(test, fontSize);
      if (tw > maxLineWidth && line) {
        drawLine(line);
        line = w;
      } else {
        line = test;
      }
    }
    if (line) drawLine(line);
  }

  const bytes = await pdfDoc.save();
  return Buffer.from(bytes);
}

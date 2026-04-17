import { Document, Packer, Paragraph, TextRun } from "docx";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

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

export async function buildPdfBuffer(text: string): Promise<Buffer> {
  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontSize = 10;
  let page = pdfDoc.addPage([595.28, 841.89]);
  let y = 800;
  const margin = 50;
  const lineHeight = fontSize * 1.35;
  const maxLineWidth = 495;

  const paragraphs = text.split(/\n/);
  for (const para of paragraphs) {
    const words = para.split(/\s+/);
    let line = "";
    for (const w of words) {
      const test = line ? `${line} ${w}` : w;
      const tw = font.widthOfTextAtSize(test, fontSize);
      if (tw > maxLineWidth && line) {
        page.drawText(line, {
          x: margin,
          y,
          size: fontSize,
          font,
          color: rgb(0.1, 0.1, 0.1),
        });
        y -= lineHeight;
        line = w;
        if (y < 60) {
          page = pdfDoc.addPage([595.28, 841.89]);
          y = 800;
        }
      } else {
        line = test;
      }
    }
    if (line) {
      page.drawText(line.slice(0, 5000), {
        x: margin,
        y,
        size: fontSize,
        font,
        color: rgb(0.1, 0.1, 0.1),
      });
      y -= lineHeight;
    }
    if (y < 60) {
      page = pdfDoc.addPage([595.28, 841.89]);
      y = 800;
    }
  }

  const bytes = await pdfDoc.save();
  return Buffer.from(bytes);
}

import * as XLSX from "xlsx";
import {
  translateToEnglish,
  translateWithOptions,
  type TranslateOptions,
} from "@/lib/ai";

async function translateCellText(
  raw: string,
  opts?: TranslateOptions,
): Promise<string> {
  if (!opts) return translateToEnglish(raw);
  return translateWithOptions(raw, {
    targetLanguage: opts.targetLanguage ?? "English",
    mode: opts.mode ?? "standard",
    customInstructions: opts.customInstructions,
    documentTypeHint: opts.documentTypeHint,
  });
}

const MAX_CELL_CHARS = 8000;

function getCellString(cell: XLSX.CellObject): string {
  if (cell.w != null) return String(cell.w);
  if (cell.v != null && typeof cell.v === "string") return cell.v;
  if (cell.v != null) return String(cell.v);
  return "";
}

function isPlainTextCell(cell: XLSX.CellObject | undefined): cell is XLSX.CellObject {
  if (!cell) return false;
  if (cell.f) return false;
  const raw = getCellString(cell).trim();
  if (!raw) return false;
  const t = cell.t as string | undefined;
  return t === "s" || t === "str" || t === "inlineStr" || typeof cell.v === "string";
}

/**
 * Translate display text in spreadsheets; leaves formulas and numeric cells unchanged.
 */
export async function translateSpreadsheetBuffer(
  buffer: Buffer,
  fileName: string,
  translateOptions?: TranslateOptions,
): Promise<{ data: Buffer; fileName: string }> {
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".csv")) {
    return translateCsv(buffer, fileName, translateOptions);
  }

  const wb = XLSX.read(buffer, { type: "buffer", cellFormula: true, cellDates: true });

  for (const sheetName of wb.SheetNames) {
    const sheet = wb.Sheets[sheetName];
    if (!sheet["!ref"]) continue;
    const range = XLSX.utils.decode_range(sheet["!ref"]);

    for (let R = range.s.r; R <= range.e.r; R++) {
      for (let C = range.s.c; C <= range.e.c; C++) {
        const addr = XLSX.utils.encode_cell({ r: R, c: C });
        const cell = sheet[addr];
        if (!isPlainTextCell(cell)) continue;
        const raw = getCellString(cell).trim();
        if (!raw || raw.length > MAX_CELL_CHARS) continue;
        const translated = await translateCellText(raw, translateOptions);
        cell.v = translated;
        cell.w = translated;
        cell.t = "s";
        delete cell.f;
      }
    }
  }

  const out = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
  const base = fileName.replace(/\.[^.]+$/, "") || "spreadsheet";
  return { data: out, fileName: `${base}-translated.xlsx` };
}

async function translateCsv(
  buffer: Buffer,
  fileName: string,
  translateOptions?: TranslateOptions,
): Promise<{ data: Buffer; fileName: string }> {
  const text = buffer.toString("utf8");
  const lines = text.split(/\r?\n/);
  const outLines: string[] = [];

  for (const line of lines) {
    if (!line.trim()) {
      outLines.push(line);
      continue;
    }
    const parts = line.split(",");
    const translatedParts = await Promise.all(
      parts.map(async (p) => {
        const u = p.trim();
        if (!u || /^-?\d+(\.\d+)?$/.test(u)) return p;
        const t = await translateCellText(u, translateOptions);
        return t.includes(",") ? `"${t.replace(/"/g, '""')}"` : t;
      }),
    );
    outLines.push(translatedParts.join(","));
  }

  const out = Buffer.from(outLines.join("\n"), "utf8");
  const base = fileName.replace(/\.[^.]+$/, "") || "spreadsheet";
  return { data: out, fileName: `${base}-translated.csv` };
}

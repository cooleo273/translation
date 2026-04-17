import { requireUser } from "@/lib/controllers/require-user";
import {
  buildDocxBuffer,
  buildPdfBuffer,
  buildTxtBuffer,
} from "@/lib/utils/export-formats";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

function baseName(fileName: string, fallback: string): string {
  const n = fileName?.trim() || fallback;
  return n.replace(/\.[^.]+$/, "") || fallback;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;
  const { id } = await params;
  const fmt = new URL(request.url).searchParams.get("format")?.toLowerCase();

  if (!fmt) {
    return NextResponse.json(
      { error: "Missing format (txt|pdf|docx|srt|spreadsheet)." },
      { status: 400 },
    );
  }

  const { data: fileRow, error: fErr } = await auth.supabase
    .from("files")
    .select("*")
    .eq("id", id)
    .eq("user_id", auth.user.id)
    .maybeSingle();

  if (fErr || !fileRow) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  const spreadsheetKeys = new Set(["spreadsheet", "xlsx", "csv", "excel"]);
  if (spreadsheetKeys.has(fmt)) {
    const pu = fileRow.processed_url as {
      spreadsheetUrl?: string;
    } | null;
    const url = pu?.spreadsheetUrl;
    if (!url) {
      return NextResponse.json(
        { error: "No spreadsheet output for this file." },
        { status: 400 },
      );
    }
    return NextResponse.redirect(url);
  }

  if (fmt === "srt") {
    const pu = fileRow.processed_url as { srtEnglish?: string } | null;
    const srt = pu?.srtEnglish;
    if (!srt?.trim()) {
      return NextResponse.json(
        { error: "No subtitles available. Process a video file first." },
        { status: 400 },
      );
    }
    const buf = await buildTxtBuffer(srt);
    const name = `${baseName(fileRow.file_name, "subtitles")}.srt`;
    return new NextResponse(new Uint8Array(buf), {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Content-Disposition": `attachment; filename="${encodeURIComponent(name)}"`,
      },
    });
  }

  if (!["txt", "pdf", "docx"].includes(fmt)) {
    return NextResponse.json({ error: "Unsupported format." }, { status: 400 });
  }

  const { data: tr } = await auth.supabase
    .from("translations")
    .select("translated_text, document_type")
    .eq("file_id", id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const text = tr?.translated_text;
  if (
    !text?.trim() ||
    tr?.document_type === "spreadsheet" ||
    text === "[spreadsheet translated]"
  ) {
    return NextResponse.json(
      {
        error:
          "No plain translation text for export. Use format=spreadsheet for spreadsheets.",
      },
      { status: 400 },
    );
  }

  const stem = baseName(fileRow.file_name, "translation");
  const txtName = encodeURIComponent(`${stem}.txt`);
  const docxName = encodeURIComponent(`${stem}.docx`);
  const pdfName = encodeURIComponent(`${stem}.pdf`);

  if (fmt === "txt") {
    const buf = await buildTxtBuffer(text);
    return new NextResponse(new Uint8Array(buf), {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Content-Disposition": `attachment; filename="${txtName}"`,
      },
    });
  }

  if (fmt === "docx") {
    const buf = await buildDocxBuffer(text);
    return new NextResponse(new Uint8Array(buf), {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename="${docxName}"`,
      },
    });
  }

  const buf = await buildPdfBuffer(text);
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${pdfName}"`,
    },
  });
}

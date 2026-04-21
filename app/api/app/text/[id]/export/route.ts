import { requireUser } from "@/lib/controllers/require-user";
import {
  buildDocxBuffer,
  buildPdfBuffer,
  buildTxtBuffer,
} from "@/lib/utils/export-formats";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

function safeStem(title: string): string {
  const t = title?.trim() || "translation";
  return t.replaceAll(/[\\/:*?"<>|]+/g, "_").slice(0, 80) || "translation";
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;
  const { id } = await params;

  const fmt = new URL(request.url).searchParams.get("format")?.toLowerCase();
  if (!fmt || !["txt", "pdf", "docx"].includes(fmt)) {
    return NextResponse.json({ error: "Missing/unsupported format (txt|pdf|docx)." }, { status: 400 });
  }

  const { data, error } = await auth.supabase
    .from("text_documents")
    .select("title, translated_text")
    .eq("id", id)
    .eq("user_id", auth.user.id)
    .maybeSingle();

  if (error || !data) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  const stem = safeStem(data.title);
  const text = data.translated_text ?? "";
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


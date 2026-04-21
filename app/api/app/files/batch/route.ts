import type { DocumentPipelineTranslation } from "@/lib/ai";
import { requireUser } from "@/lib/controllers/require-user";
import { getTranslatedPlainTextForFile } from "@/lib/server/translation-export-text";
import { triggerFileProcess } from "@/lib/server/trigger-file-process";
import {
  buildDocxBuffer,
  buildPdfBuffer,
  buildTxtBuffer,
} from "@/lib/utils/export-formats";
import { strToU8, zipSync } from "fflate";
import { NextResponse } from "next/server";
import { z } from "zod";

export const runtime = "nodejs";
export const maxDuration = 300;

const translationSchema = z
  .object({
    targetLanguage: z.string().max(120).optional(),
    mode: z
      .enum(["standard", "formal", "casual", "technical", "legal"])
      .optional(),
    customInstructions: z.string().max(4000).optional(),
    autoDetectDocumentType: z.boolean().optional(),
  })
  .optional();

const bodySchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("process"),
    fileIds: z.array(z.string().uuid()).min(1).max(40),
    translation: translationSchema,
  }),
  z.object({
    action: z.literal("export"),
    fileIds: z.array(z.string().uuid()).min(1).max(40),
    format: z.enum(["txt", "pdf", "docx"]),
  }),
]);

export async function POST(request: Request) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid body." }, { status: 400 });
  }

  if (parsed.data.action === "process") {
    const translation = parsed.data.translation as
      | DocumentPipelineTranslation
      | undefined;
    const results: { fileId: string; ok: boolean; error?: string; jobId?: string }[] =
      [];

    for (const fileId of parsed.data.fileIds) {
      const r = await triggerFileProcess(auth.supabase, {
        userId: auth.user.id,
        fileId,
        translation,
      });
      if (!r.ok) {
        results.push({ fileId, ok: false, error: r.message });
      } else {
        results.push({
          fileId,
          ok: true,
          jobId: r.jobId,
        });
      }
    }

    return NextResponse.json({ ok: true, results });
  }

  const fmt = parsed.data.format;
  const archive: Record<string, Uint8Array> = {};

  for (const fileId of parsed.data.fileIds) {
    const payload = await getTranslatedPlainTextForFile(
      auth.supabase,
      auth.user.id,
      fileId,
    );
    if (!payload.ok) {
      archive[`${fileId}-error.txt`] = strToU8(
        `Export skipped: ${payload.message}\n`,
      );
      continue;
    }

    const safeStem = payload.stem.replace(/[^\w\-]+/g, "_").slice(0, 80);
    let buf: Buffer;
    let ext: string;
    if (fmt === "txt") {
      buf = await buildTxtBuffer(payload.text);
      ext = "txt";
    } else if (fmt === "docx") {
      buf = await buildDocxBuffer(payload.text);
      ext = "docx";
    } else {
      buf = await buildPdfBuffer(payload.text);
      ext = "pdf";
    }
    archive[`${safeStem}-${fileId.slice(0, 8)}.${ext}`] = new Uint8Array(buf);
  }

  const zipped = zipSync(archive);
  const name = encodeURIComponent(`exports-${Date.now()}.zip`);

  return new NextResponse(Buffer.from(zipped), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${name}"`,
    },
  });
}

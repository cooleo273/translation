import type { DocumentPipelineTranslation } from "@/lib/ai";
import { requireUser } from "@/lib/controllers/require-user";
import { triggerFileProcess } from "@/lib/server/trigger-file-process";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;
  const { id } = await params;

  let translation: DocumentPipelineTranslation | undefined;
  try {
    const j: unknown = await request.json();
    if (
      j &&
      typeof j === "object" &&
      "translation" in j &&
      (j as { translation?: DocumentPipelineTranslation }).translation
    ) {
      translation = (j as { translation: DocumentPipelineTranslation })
        .translation;
    }
  } catch {
    /* empty body is fine */
  }

  const result = await triggerFileProcess(auth.supabase, {
    userId: auth.user.id,
    fileId: id,
    translation,
  });

  if (!result.ok) {
    return NextResponse.json(
      result.body ?? { error: result.message },
      { status: result.status ?? 500 },
    );
  }

  if (result.queued) {
    return NextResponse.json({
      ok: true,
      queued: true,
      jobId: result.jobId,
    });
  }

  return NextResponse.json({
    ok: true,
    queued: false,
  });
}

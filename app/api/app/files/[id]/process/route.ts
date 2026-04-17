import type { DocumentPipelineTranslation } from "@/lib/ai";
import { assertProcessAllowedForPlan } from "@/lib/billing/enforcement";
import { requireUser } from "@/lib/controllers/require-user";
import { processAppFile } from "@/lib/server/app-file-process";
import { maybeEnqueueFileJob } from "@/lib/queue/enqueue-app-job";
import type { MediaCategory } from "@/lib/types";
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

  const { data: fileRow, error: fErr } = await auth.supabase
    .from("files")
    .select("id, file_type, user_id, original_url")
    .eq("id", id)
    .eq("user_id", auth.user.id)
    .maybeSingle();

  if (fErr || !fileRow?.original_url) {
    return NextResponse.json({ error: "File not found." }, { status: 404 });
  }

  const category = fileRow.file_type as MediaCategory;

  const blocked = await assertProcessAllowedForPlan({
    supabase: auth.supabase,
    userId: auth.user.id,
    category,
  });
  if (blocked) {
    return NextResponse.json(blocked.body, { status: blocked.status });
  }

  const resFetch = await fetch(fileRow.original_url);
  if (!resFetch.ok) {
    return NextResponse.json(
      { error: "Could not download original file from storage." },
      { status: 502 },
    );
  }
  const buffer = Buffer.from(await resFetch.arrayBuffer());

  const queued = await maybeEnqueueFileJob({
    supabase: auth.supabase,
    userId: auth.user.id,
    fileId: id,
    bufferSize: buffer.length,
    category,
    translation,
  });

  if (queued) {
    return NextResponse.json({
      ok: true,
      queued: true,
      jobId: queued.jobId,
    });
  }

  const result = await processAppFile(auth.supabase, {
    userId: auth.user.id,
    fileId: id,
    translation,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    queued: false,
  });
}

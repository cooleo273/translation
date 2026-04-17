import type { DocumentPipelineTranslation } from "@/lib/ai";
import { rateLimitGuest } from "@/lib/rate-limit";
import { runPipelineForRecord } from "@/lib/server/pipeline-executor";
import { deleteUpload, takeUpload } from "@/lib/upload-store";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(request: Request) {
  const rl = await rateLimitGuest(request);
  if (!rl.ok) {
    return new Response(JSON.stringify({ error: "Too many requests." }), {
      status: 429,
      headers: {
        "Content-Type": "application/json",
        ...rl.headers,
      },
    });
  }

  let uploadId = "";
  try {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return new Response(JSON.stringify({ error: "Invalid JSON body." }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (
      typeof body !== "object" ||
      body === null ||
      !("uploadId" in body) ||
      typeof (body as { uploadId: unknown }).uploadId !== "string"
    ) {
      return new Response(
        JSON.stringify({ error: "Request body must include { \"uploadId\": string }." }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }

    const b = body as {
      uploadId: string;
      translation?: DocumentPipelineTranslation;
    };

    uploadId = b.uploadId.trim();
    if (!uploadId) {
      return new Response(JSON.stringify({ error: "uploadId is required." }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const record = takeUpload(uploadId);
    if (!record) {
      return new Response(
        JSON.stringify({
          error: "Upload not found or expired. Please upload your file again.",
        }),
        { status: 404, headers: { "Content-Type": "application/json" } },
      );
    }

    const translation = b.translation;
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const send = (obj: object) => {
          controller.enqueue(encoder.encode(`${JSON.stringify(obj)}\n`));
        };

        try {
          send({ step: "processing", detail: "starting" });
          await runPipelineForRecord(record, send, { translation });
        } catch (err) {
          console.error("[process]", err);
          const message =
            err instanceof Error ? err.message : "Processing failed.";
          send({ step: "error", message });
        } finally {
          deleteUpload(uploadId);
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "application/x-ndjson; charset=utf-8",
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    console.error("[process]", err);
    return new Response(JSON.stringify({ error: "Processing failed." }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}

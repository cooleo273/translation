import { rateLimitGuest } from "@/lib/rate-limit";
import { formatUserFacingError } from "@/lib/user-facing-errors";
import { NextResponse } from "next/server";
import { transcribeAudio } from "@/lib/services/transcription-service";
import { deleteUpload, takeUpload } from "@/lib/upload-store";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(request: Request) {
  try {
    const rl = await rateLimitGuest(request);
    if (!rl.ok) {
      return NextResponse.json(
        { error: "Too many requests." },
        { status: 429, headers: rl.headers },
      );
    }

    const contentType = request.headers.get("content-type") ?? "";

    if (contentType.includes("multipart/form-data")) {
      const formData = await request.formData();
      const file = formData.get("file");
      if (!file || !(file instanceof File)) {
        return NextResponse.json(
          { error: "Missing file field \"file\"." },
          { status: 400 },
        );
      }
      const buf = Buffer.from(await file.arrayBuffer());
      const name = file.name || "audio.mp3";
      const result = await transcribeAudio(buf, name);
      return NextResponse.json({
        transcript: result.transcript,
        transcriptPlain: result.transcriptPlain,
        timestamps: result.timestamps,
        segments: result.segments,
        language: result.language,
      });
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
    }
    if (
      typeof body !== "object" ||
      body === null ||
      !("uploadId" in body) ||
      typeof (body as { uploadId: unknown }).uploadId !== "string"
    ) {
      return NextResponse.json(
        { error: "Provide multipart file or JSON { \"uploadId\": string }." },
        { status: 400 },
      );
    }
    const uploadId = (body as { uploadId: string }).uploadId.trim();
    const record = takeUpload(uploadId);
    if (!record) {
      return NextResponse.json(
        { error: "Upload not found or expired." },
        { status: 404 },
      );
    }
    if (record.category !== "audio") {
      deleteUpload(uploadId);
      return NextResponse.json(
        { error: "Uploaded file is not an audio file." },
        { status: 400 },
      );
    }
    try {
      const result = await transcribeAudio(record.buffer, record.fileName);
      return NextResponse.json({
        transcript: result.transcript,
        transcriptPlain: result.transcriptPlain,
        timestamps: result.timestamps,
        segments: result.segments,
        language: result.language,
      });
    } finally {
      deleteUpload(uploadId);
    }
  } catch (err) {
    console.error("[transcribe]", err);
    const raw = err instanceof Error ? err.message : "";
    const isUser =
      err instanceof Error &&
      (raw.includes("Gemini API keys") ||
        raw.includes("GEMINI_API_KEY") ||
        raw.includes("Transcription returned no text") ||
        raw.includes("Transcription response"));
    return NextResponse.json(
      { error: formatUserFacingError(err) },
      { status: isUser ? 400 : 500 },
    );
  }
}

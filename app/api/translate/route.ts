import { rateLimitGuest } from "@/lib/rate-limit";
import { NextResponse } from "next/server";
import { detectLanguage, translateToEnglish } from "@/lib/ai";
import { extractText } from "@/lib/extract-text";
import type { DocumentKind } from "@/lib/types";
import { deleteUpload, takeUpload } from "@/lib/upload-store";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(request: Request) {
  try {
    const rl = await rateLimitGuest(request);
    if (!rl.ok) {
      return NextResponse.json(
        { error: "Too many requests." },
        { status: 429, headers: rl.headers },
      );
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: "Invalid JSON body." },
        { status: 400 },
      );
    }

    if (
      typeof body !== "object" ||
      body === null ||
      !("uploadId" in body) ||
      typeof (body as { uploadId: unknown }).uploadId !== "string"
    ) {
      return NextResponse.json(
        { error: "Request body must include { \"uploadId\": string }." },
        { status: 400 },
      );
    }

    const uploadId = (body as { uploadId: string }).uploadId.trim();
    if (!uploadId) {
      return NextResponse.json({ error: "uploadId is required." }, { status: 400 });
    }

    const record = takeUpload(uploadId);
    if (!record) {
      return NextResponse.json(
        {
          error:
            "Upload not found or expired. Please upload your file again.",
        },
        { status: 404 },
      );
    }

    try {
      if (record.category !== "document") {
        return NextResponse.json(
          {
            error:
              "This file type must be processed via POST /api/process, not /api/translate.",
          },
          { status: 400 },
        );
      }
      const originalText = await extractText(
        record.buffer,
        record.kind as DocumentKind,
      );
      const { detectedLanguage, confidence } = await detectLanguage(
        originalText,
      );
      const translatedText = await translateToEnglish(originalText);

      return NextResponse.json({
        originalText,
        translatedText,
        detectedLanguage,
        confidence,
      });
    } finally {
      deleteUpload(uploadId);
    }
  } catch (err) {
    console.error("[translate]", err);
    const message =
      err instanceof Error ? err.message : "Translation failed.";
    const isUser =
      err instanceof Error &&
      (message.includes("Gemini API keys") ||
        message.includes("GEMINI_API_KEY") ||
        message.includes("No extractable text") ||
        message.includes("exceeds") ||
        message.includes("Could not determine"));

    return NextResponse.json(
      { error: isUser ? message : "Translation failed. Please try again." },
      { status: isUser ? 400 : 500 },
    );
  }
}

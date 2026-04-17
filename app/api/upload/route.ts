import { rateLimitGuest } from "@/lib/rate-limit";
import { NextResponse } from "next/server";
import {
  extensionToCategory,
  extensionToKind,
  getExtension,
  isAllowedExtension,
  MAX_BYTES,
} from "@/lib/validation";
import { saveUpload } from "@/lib/upload-store";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const rl = await rateLimitGuest(request);
    if (!rl.ok) {
      return NextResponse.json(
        { error: "Too many requests." },
        { status: 429, headers: rl.headers },
      );
    }
    const contentLength = request.headers.get("content-length");
    if (contentLength && Number(contentLength) > MAX_BYTES) {
      return NextResponse.json(
        { error: "File is too large. Maximum size is 10MB." },
        { status: 413 },
      );
    }

    const formData = await request.formData();
    const file = formData.get("file");

    if (!file || !(file instanceof File)) {
      return NextResponse.json(
        { error: "Missing file field. Use multipart field name \"file\"." },
        { status: 400 },
      );
    }

    if (file.size > MAX_BYTES) {
      return NextResponse.json(
        { error: "File is too large. Maximum size is 10MB." },
        { status: 413 },
      );
    }

    const fileName = file.name || "document";
    const ext = getExtension(fileName);
    if (!isAllowedExtension(ext)) {
      return NextResponse.json(
        {
          error:
            "Unsupported file type. Supported: PDF, DOCX, TXT, audio, video, images, XLSX, CSV.",
        },
        { status: 400 },
      );
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const kind = extensionToKind(ext);
    const category = extensionToCategory(ext);

    const uploadId = saveUpload({
      buffer,
      fileName,
      mimeType: file.type || "application/octet-stream",
      category,
      kind,
      createdAt: Date.now(),
    });

    return NextResponse.json({
      uploadId,
      fileName,
      size: buffer.length,
      category,
    });
  } catch (err) {
    console.error("[upload]", err);
    return NextResponse.json(
      { error: "Upload failed. Please try again." },
      { status: 500 },
    );
  }
}

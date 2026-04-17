import { NextResponse } from "next/server";
import { takeDownload } from "@/lib/download-tokens";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const token = url.searchParams.get("token")?.trim();
  if (!token) {
    return NextResponse.json({ error: "Missing token query parameter." }, { status: 400 });
  }

  const rec = takeDownload(token);
  if (!rec) {
    return NextResponse.json(
      { error: "Download link expired or invalid." },
      { status: 404 },
    );
  }

  return new NextResponse(new Uint8Array(rec.data), {
    status: 200,
    headers: {
      "Content-Type": rec.mimeType,
      "Content-Disposition": `attachment; filename="${encodeURIComponent(rec.fileName)}"`,
    },
  });
}

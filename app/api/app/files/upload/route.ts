import { assertUploadAllowedForPlan } from "@/lib/billing/enforcement";
import { notifyUsageWarningIfNeeded } from "@/lib/billing/usage-warning";
import { sha256Buffer } from "@/lib/crypto/sha256";
import { requireUser } from "@/lib/controllers/require-user";
import { uploadBuffer } from "@/lib/services/cloudinary-service";
import {
  extensionToCategory,
  getExtension,
  isAllowedExtension,
} from "@/lib/validation";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;

  const formData = await request.formData();
  const file = formData.get("file");
  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: "Missing file field." }, { status: 400 });
  }

  const fileName = file.name || "upload";
  const ext = getExtension(fileName);
  if (!isAllowedExtension(ext)) {
    return NextResponse.json({ error: "Unsupported file type." }, { status: 400 });
  }

  const fileType = extensionToCategory(ext);

  const blocked = await assertUploadAllowedForPlan({
    supabase: auth.supabase,
    userId: auth.user.id,
    bytes: file.size,
    category: fileType,
  });
  if (blocked) {
    return NextResponse.json(blocked.body, { status: blocked.status });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const contentSha = sha256Buffer(buffer);

  let secureUrl: string;
  try {
    const up = await uploadBuffer(buffer, `users/${auth.user.id}`, fileName);
    secureUrl = up.secureUrl;
  } catch (e) {
    console.error("[upload]", e);
    const msg = e instanceof Error ? e.message : "Upload to storage failed.";
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  const { data, error } = await auth.supabase
    .from("files")
    .insert({
      user_id: auth.user.id,
      file_name: fileName,
      file_type: fileType,
      status: "uploaded",
      original_url: secureUrl,
      metadata: { content_sha256: contentSha },
    })
    .select("id")
    .single();

  if (error || !data) {
    console.error("[files insert]", error);
    return NextResponse.json({ error: "Failed to save file record." }, { status: 500 });
  }

  void notifyUsageWarningIfNeeded(
    auth.supabase,
    auth.user.id,
    auth.user.email ?? undefined,
  );

  return NextResponse.json({ id: data.id, fileName, fileType });
}

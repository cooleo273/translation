import { requireUser } from "@/lib/controllers/require-user";
import { signedUrl } from "@/lib/services/cloudinary-service";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 30;

function inferCloudinaryPublicIdFromUrl(url: string): string | null {
  // Example:
  // https://res.cloudinary.com/<cloud>/image/upload/v123/translation-saas/users/<uid>/file_abc.pdf
  const re = /\/upload\/v\d+\/(.+)\.[a-z0-9]+$/i;
  const m = re.exec(url);
  if (!m) return null;
  return m[1];
}

function inferResourceTypeFromUrl(url: string): "image" | "raw" | "video" | null {
  if (url.includes("/image/upload/")) return "image";
  if (url.includes("/raw/upload/")) return "raw";
  if (url.includes("/video/upload/")) return "video";
  return null;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;
  const { id } = await params;

  const { data: file, error } = await auth.supabase
    .from("files")
    .select("id, original_url, metadata")
    .eq("id", id)
    .eq("user_id", auth.user.id)
    .maybeSingle();

  if (error || !file?.original_url) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  const meta =
    file.metadata && typeof file.metadata === "object" && !Array.isArray(file.metadata)
      ? (file.metadata as Record<string, unknown>)
      : {};

  const metaPublicId =
    typeof meta.cloudinary_public_id === "string" ? meta.cloudinary_public_id : null;
  const metaResourceType =
    typeof meta.cloudinary_resource_type === "string"
      ? (meta.cloudinary_resource_type as "image" | "raw" | "video")
      : null;

  const publicId = metaPublicId ?? inferCloudinaryPublicIdFromUrl(file.original_url);
  const resourceType = metaResourceType ?? inferResourceTypeFromUrl(file.original_url);

  if (!publicId || !resourceType) {
    return NextResponse.json(
      { error: "Could not derive signed URL for this file." },
      { status: 400 },
    );
  }

  const url = signedUrl(publicId, resourceType);
  return NextResponse.json({ ok: true, url });
}


import { v2 as cloudinary } from "cloudinary";

function ensureConfig() {
  const name = process.env.CLOUDINARY_CLOUD_NAME;
  const key = process.env.CLOUDINARY_API_KEY;
  const secret = process.env.CLOUDINARY_API_SECRET;
  if (!name || !key || !secret) {
    throw new Error(
      "Cloudinary is not configured. Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET.",
    );
  }
  cloudinary.config({
    cloud_name: name,
    api_key: key,
    api_secret: secret,
  });
}

export async function uploadBuffer(
  buffer: Buffer,
  folder: string,
  fileName: string,
  resourceType: "image" | "video" | "raw" | "auto" = "auto",
): Promise<{ secureUrl: string; publicId: string; bytes: number }> {
  ensureConfig();
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder: `translation-saas/${folder}`,
        resource_type: resourceType,
        // Some Cloudinary accounts restrict delivery unless explicitly public.
        // Ensure PDFs (and all uploads) are publicly deliverable via their secure_url.
        access_mode: "public",
        type: "upload",
        use_filename: true,
        unique_filename: true,
        filename_override: fileName,
      },
      (err, result) => {
        if (err || !result) {
          reject(err instanceof Error ? err : new Error("Cloudinary upload failed"));
          return;
        }
        resolve({
          secureUrl: result.secure_url,
          publicId: result.public_id,
          bytes: result.bytes ?? buffer.length,
        });
      },
    );
    stream.end(buffer);
  });
}

/** Time-limited signed URL for private reads (requires authenticated download route in production). */
export function signedUrl(publicId: string, resourceType: "raw" | "video" | "image" | "auto" = "auto") {
  ensureConfig();
  return cloudinary.url(publicId, {
    type: "upload",
    sign_url: true,
    secure: true,
    resource_type: resourceType,
  });
}

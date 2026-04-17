import type { MediaCategory, UploadResponse } from "./types";

function parseJsonResponse(xhr: XMLHttpRequest): unknown {
  try {
    return JSON.parse(xhr.responseText);
  } catch {
    return null;
  }
}

export function uploadFileWithProgress(
  file: File,
  onProgress: (percent: number) => void,
): Promise<UploadResponse> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/upload");
    xhr.responseType = "text";

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && e.total > 0) {
        onProgress(Math.min(100, Math.round((e.loaded / e.total) * 100)));
      }
    };

    xhr.onload = () => {
      const data = parseJsonResponse(xhr);
      if (xhr.status >= 200 && xhr.status < 300 && data && typeof data === "object") {
        const o = data as Record<string, unknown>;
        if (
          typeof o.uploadId === "string" &&
          typeof o.fileName === "string" &&
          typeof o.size === "number" &&
          typeof o.category === "string"
        ) {
          resolve({
            uploadId: o.uploadId,
            fileName: o.fileName,
            size: o.size,
            category: o.category as MediaCategory,
          });
          return;
        }
      }
      const err =
        data && typeof data === "object" && "error" in data
          ? String((data as { error: unknown }).error)
          : "Upload failed.";
      reject(new Error(err));
    };

    xhr.onerror = () => reject(new Error("Network error during upload."));
    xhr.onabort = () => reject(new Error("Upload cancelled."));

    const formData = new FormData();
    formData.append("file", file);
    xhr.send(formData);
  });
}

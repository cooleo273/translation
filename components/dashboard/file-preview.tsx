"use client";

import { useEffect, useMemo, useState } from "react";
import type { FileRow } from "@/lib/types/saas";

function extension(fileName: string): string {
  return fileName.split(".").pop()?.toLowerCase() ?? "";
}

/** Microsoft Office Online viewer — requires a publicly reachable HTTPS URL. */
function officeEmbedUrl(originalUrl: string): string {
  return `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(originalUrl)}`;
}

function googleDocsEmbedUrl(url: string): string {
  return `https://docs.google.com/viewer?url=${encodeURIComponent(url)}&embedded=true`;
}

function TextFilePreview({ url }: Readonly<{ url: string }>) {
  const [text, setText] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(url, { mode: "cors" });
        if (!res.ok) throw new Error("fetch failed");
        const t = await res.text();
        if (!cancelled) setText(t.slice(0, 200_000));
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [url]);

  if (failed) {
    return (
      <p className="text-[13px] text-muted-foreground">
        Preview unavailable (browser blocked the request).{" "}
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="font-medium text-foreground underline underline-offset-2"
        >
          Open file
        </a>
      </p>
    );
  }

  if (text === null) {
    return <p className="text-[13px] text-muted-foreground">Loading preview…</p>;
  }

  return (
    <pre className="max-h-[min(45vh,320px)] overflow-auto whitespace-pre-wrap break-words text-[12px] leading-relaxed text-foreground">
      {text}
      {text.length >= 200_000 ? "\n\n…" : ""}
    </pre>
  );
}

export function FilePreview({ file }: Readonly<{ file: FileRow }>) {
  const url = file.original_url;
  const ext = extension(file.file_name);
  const [signedUrl, setSignedUrl] = useState<string | null>(null);

  const mode = useMemo(() => {
    const t = file.file_type?.toLowerCase() ?? "";
    if (t === "audio") return "audio" as const;
    if (t === "video") return "video" as const;
    if (t === "image") return "image" as const;
    if (t === "spreadsheet") return "spreadsheet" as const;
    if (t === "document") {
      if (ext === "pdf") return "pdf" as const;
      if (ext === "txt") return "text" as const;
      if (ext === "docx" || ext === "doc" || ext === "odt") return "office" as const;
      return "document_fallback" as const;
    }
    return "unknown" as const;
  }, [file.file_type, ext]);

  const looksLikeCloudinaryRawPdf =
    ext === "pdf" && !!url && /res\.cloudinary\.com\/.+\/raw\/upload\//.test(url);

  useEffect(() => {
    if (
      !url ||
      !(file.file_type?.toLowerCase() === "document" && ext === "pdf")
    ) {
      setSignedUrl(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(`/api/app/files/${file.id}/signed-url`);
        if (!res.ok) throw new Error("signed url failed");
        const j = (await res.json()) as { url?: string };
        if (!cancelled) setSignedUrl(j.url ?? null);
      } catch {
        if (!cancelled) setSignedUrl(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [ext, file.id, file.file_type, url]);

  if (!url) {
    return (
      <p className="text-[13px] text-muted-foreground">
        No file URL on record — re-upload to enable preview.
      </p>
    );
  }

  const effectiveUrl = signedUrl ?? url;

  const openTab = (
    <a
      href={effectiveUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="text-[12px] font-medium text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
    >
      Open in new tab
    </a>
  );

  switch (mode) {
    case "audio":
      return (
        <div className="space-y-2">
          {/* eslint-disable-next-line jsx-a11y/media-has-caption -- user-uploaded audio, no captions file */}
          <audio controls className="w-full" preload="metadata" src={url} />
          <p className="text-[12px] text-muted-foreground">{openTab}</p>
        </div>
      );
    case "video":
      return (
        <div className="space-y-2">
          {/* eslint-disable-next-line jsx-a11y/media-has-caption -- user-uploaded video */}
          <video
            controls
            className="max-h-[min(50vh,360px)] w-full bg-black object-contain"
            preload="metadata"
            src={url}
          />
          <p className="text-[12px] text-muted-foreground">{openTab}</p>
        </div>
      );
    case "image":
      return (
        <div className="space-y-2">
          {/* eslint-disable-next-line @next/next/no-img-element -- remote Cloudinary URL */}
          <img
            src={url}
            alt=""
            className="max-h-[min(50vh,400px)] w-full max-w-full object-contain"
          />
          <p className="text-[12px] text-muted-foreground">{openTab}</p>
        </div>
      );
    case "pdf":
      return (
        <div className="space-y-2">
          {looksLikeCloudinaryRawPdf && (
            <p className="rounded-lg border border-border bg-muted/30 p-3 text-[12px] text-muted-foreground">
              This PDF link is stored as a Cloudinary <span className="font-medium">raw</span>{" "}
              asset and may be blocked (401). Re-upload this PDF to fix preview.
            </p>
          )}
          <iframe
            title="PDF preview"
            src={googleDocsEmbedUrl(effectiveUrl)}
            className="h-[min(55vh,480px)] w-full border-0 bg-muted/30"
          />
          <p className="text-[12px] text-muted-foreground">
            Preview via Google viewer. {openTab}
          </p>
        </div>
      );
    case "spreadsheet":
      return (
        <div className="space-y-2">
          <iframe
            title={file.file_name}
            src={officeEmbedUrl(url)}
            className="h-[min(55vh,480px)] w-full border-0 bg-muted/30"
          />
          <p className="text-[12px] text-muted-foreground">
            Spreadsheet preview via Microsoft viewer. {openTab}
          </p>
        </div>
      );
    case "office":
      return (
        <div className="space-y-2">
          <iframe
            title={file.file_name}
            src={officeEmbedUrl(url)}
            className="h-[min(55vh,480px)] w-full border-0 bg-muted/30"
          />
          <p className="text-[12px] text-muted-foreground">
            Document preview via Microsoft viewer. {openTab}
          </p>
        </div>
      );
    case "text":
      return (
        <div className="space-y-2">
          <TextFilePreview url={url} />
          <p className="text-[12px] text-muted-foreground">{openTab}</p>
        </div>
      );
    case "document_fallback":
      return (
        <div className="space-y-2">
          <iframe
            title="Document preview"
            src={googleDocsEmbedUrl(url)}
            className="h-[min(55vh,480px)] w-full border-0 bg-muted/30"
          />
          <p className="text-[12px] text-muted-foreground">
            Preview attempt via Google viewer. {openTab}
          </p>
        </div>
      );
    default:
      return (
        <div className="text-[13px] text-muted-foreground">
          <p>Preview not configured for this type.</p>
          <p className="mt-1">{openTab}</p>
        </div>
      );
  }
}

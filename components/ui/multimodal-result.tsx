"use client";

import { useEffect, useMemo, useState } from "react";
import type { MediaCategory } from "@/lib/types";
import type { ProcessPayload } from "@/lib/process-types";
import { srtToVtt } from "@/lib/srt-to-vtt";
import { categoryLabel, FileCategoryIcon } from "./file-type-icon";

type TabId = "original" | "transcript" | "translation" | "subtitles";

const tabs: { id: TabId; label: string }[] = [
  { id: "original", label: "Original" },
  { id: "transcript", label: "Transcript" },
  { id: "translation", label: "Translation" },
  { id: "subtitles", label: "Subtitles" },
];

export function MultimodalResult({
  category,
  payload,
  previewFile,
  videoObjectUrl,
  imageObjectUrl,
  targetLanguage,
  onDownloadTxt,
  onDownloadSrt,
  onDownloadSpreadsheet,
}: {
  category: MediaCategory;
  payload: ProcessPayload;
  previewFile: File | null;
  videoObjectUrl: string | null;
  imageObjectUrl: string | null;
  targetLanguage?: string;
  onDownloadTxt: (text: string, name: string) => void;
  onDownloadSrt: (srt: string, name: string) => void;
  onDownloadSpreadsheet?: (token: string, fileName: string) => void;
}) {
  const [active, setActive] = useState<TabId>("original");

  const tabAvailable = useMemo(() => {
    const a = {
      original: true,
      transcript: category === "audio" || category === "video",
      translation: true,
      subtitles: category === "video",
    };
    return a;
  }, [category]);

  useEffect(() => {
    if (!tabAvailable[active]) {
      setActive("original");
    }
  }, [active, tabAvailable]);

  const vttUrl = useMemo(() => {
    if (payload.category !== "video") return null;
    const vtt = srtToVtt(payload.srtEnglish);
    const blob = new Blob([vtt], { type: "text/vtt" });
    return URL.createObjectURL(blob);
  }, [payload]);

  useEffect(() => {
    return () => {
      if (vttUrl) URL.revokeObjectURL(vttUrl);
    };
  }, [vttUrl]);

  const detected =
    "detectedLanguage" in payload ? payload.detectedLanguage : undefined;
  const confidence =
    "confidence" in payload ? payload.confidence : undefined;

  return (
    <div className="mt-10 w-full space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <FileCategoryIcon category={category} />
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {categoryLabel(category)}
            </p>
            {previewFile && (
              <p className="text-sm font-medium text-foreground truncate max-w-[240px]">
                {previewFile.name}
              </p>
            )}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {detected && (
            <>
              <span className="text-xs text-muted-foreground">Detected</span>
              <span className="rounded-full bg-muted px-3 py-1 text-sm text-foreground">
                {detected}
              </span>
              {confidence != null && (
                <span className="text-xs text-muted-foreground">
                  {(confidence * 100).toFixed(0)}%
                </span>
              )}
            </>
          )}
        </div>
      </div>

      <div className="flex flex-wrap gap-1 rounded-2xl bg-muted/80 p-1 ring-1 ring-border">
        {tabs.map((t) => {
          const ok = tabAvailable[t.id];
          return (
            <button
              key={t.id}
              type="button"
              disabled={!ok}
              onClick={() => ok && setActive(t.id)}
              className={`
                flex-1 min-w-[100px] rounded-xl px-3 py-2.5 text-sm font-medium transition
                ${active === t.id && ok ? "bg-card shadow-sm text-foreground" : "text-muted-foreground"}
                ${!ok ? "opacity-40 cursor-not-allowed" : "hover:text-foreground"}
              `}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="rounded-2xl border border-border bg-card/80 p-5 shadow-[0_8px_30px_rgb(0,0,0,0.06)] ring-1 ring-border min-h-[200px] dark:shadow-[0_8px_30px_rgb(0,0,0,0.35)]">
          {active === "original" && (
            <OriginalPane
              payload={payload}
              videoObjectUrl={videoObjectUrl}
              imageObjectUrl={imageObjectUrl}
            />
          )}
          {active === "transcript" && (
            <TranscriptPane category={category} payload={payload} />
          )}
          {active === "translation" && (
            <TranslationPane
              payload={payload}
              targetLanguage={targetLanguage}
            />
          )}
          {active === "subtitles" && (
            <SubtitlesPane payload={payload} targetLanguage={targetLanguage} />
          )}
        </div>

        <div className="rounded-2xl border border-border bg-card/80 p-5 shadow-[0_8px_30px_rgb(0,0,0,0.06)] ring-1 ring-border min-h-[200px] dark:shadow-[0_8px_30px_rgb(0,0,0,0.35)]">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">
            Side preview
          </p>
          <SidePreview
            active={active}
            category={category}
            payload={payload}
            videoObjectUrl={videoObjectUrl}
            imageObjectUrl={imageObjectUrl}
            vttUrl={vttUrl}
          />
          <DownloadActions
            payload={payload}
            onDownloadTxt={onDownloadTxt}
            onDownloadSrt={onDownloadSrt}
            onDownloadSpreadsheet={onDownloadSpreadsheet}
          />
        </div>
      </div>
    </div>
  );
}

function OriginalPane({
  payload,
  videoObjectUrl,
  imageObjectUrl,
}: {
  payload: ProcessPayload;
  videoObjectUrl: string | null;
  imageObjectUrl: string | null;
}) {
  if (payload.category === "document") {
    return (
      <>
        <h3 className="text-xs font-semibold uppercase text-muted-foreground mb-2">
          Original
        </h3>
        <pre className="whitespace-pre-wrap text-sm text-foreground max-h-[min(50vh,28rem)] overflow-y-auto">
          {payload.originalText}
        </pre>
      </>
    );
  }
  if (payload.category === "image") {
    return (
      <>
        <h3 className="text-xs font-semibold uppercase text-muted-foreground mb-2">
          Image & OCR
        </h3>
        {imageObjectUrl && (
          // eslint-disable-next-line @next/next/no-img-element -- local blob preview
          <img
            src={imageObjectUrl}
            alt="Uploaded"
            className="max-h-64 rounded-lg object-contain mb-3"
          />
        )}
        <pre className="whitespace-pre-wrap text-sm text-foreground max-h-48 overflow-y-auto">
          {payload.originalText}
        </pre>
      </>
    );
  }
  if (payload.category === "video" && videoObjectUrl) {
    return (
      <>
        <h3 className="text-xs font-semibold uppercase text-muted-foreground mb-2">
          Video
        </h3>
        <video
          src={videoObjectUrl}
          controls
          className="w-full rounded-xl bg-black max-h-[min(50vh,360px)]"
        />
      </>
    );
  }
  if (payload.category === "audio") {
    return (
      <>
        <h3 className="text-xs font-semibold uppercase text-muted-foreground mb-2">
          Audio
        </h3>
        <p className="text-sm text-muted-foreground">
          Open the Transcript tab to read the full transcription.
        </p>
      </>
    );
  }
  if (payload.category === "spreadsheet") {
    return (
      <>
        <h3 className="text-xs font-semibold uppercase text-muted-foreground mb-2">
          Spreadsheet
        </h3>
        <p className="text-sm text-muted-foreground">
          Text cells were translated. Numbers and formulas were left unchanged.
          Use Download to save the translated file.
        </p>
      </>
    );
  }
  return (
    <p className="text-sm text-muted-foreground">No preview for this category.</p>
  );
}

function TranscriptPane({
  category,
  payload,
}: {
  category: MediaCategory;
  payload: ProcessPayload;
}) {
  if (category !== "audio" && category !== "video") {
    return <p className="text-sm text-muted-foreground">No transcript for this file type.</p>;
  }
  if (payload.category !== "audio" && payload.category !== "video") {
    return null;
  }
  return (
    <>
      <h3 className="text-xs font-semibold uppercase text-muted-foreground mb-2">
        Transcript
      </h3>
      <pre className="whitespace-pre-wrap text-sm text-foreground max-h-[min(50vh,28rem)] overflow-y-auto">
        {payload.transcript}
      </pre>
      {payload.speechLanguage && (
        <p className="mt-2 text-xs text-muted-foreground">
          Spoken language (detected): {payload.speechLanguage}
        </p>
      )}
    </>
  );
}

function TranslationPane({
  payload,
  targetLanguage,
}: {
  payload: ProcessPayload;
  targetLanguage?: string;
}) {
  const text =
    payload.category === "document" || payload.category === "image"
      ? payload.translatedText
      : payload.category === "spreadsheet"
        ? ""
        : payload.translatedText;

  if (payload.category === "spreadsheet") {
    return (
      <p className="text-sm text-muted-foreground">
        Translation is embedded in the downloaded spreadsheet file.
      </p>
    );
  }

  return (
    <>
      <h3 className="text-xs font-semibold uppercase text-muted-foreground mb-2">
        {targetLanguage?.trim() || "Translation"}
      </h3>
      <pre className="whitespace-pre-wrap text-sm text-foreground max-h-[min(50vh,28rem)] overflow-y-auto">
        {text}
      </pre>
    </>
  );
}

function SubtitlesPane({
  payload,
  targetLanguage,
}: {
  payload: ProcessPayload;
  targetLanguage?: string;
}) {
  if (payload.category !== "video") {
    return (
      <p className="text-sm text-muted-foreground">Subtitles are only available for video.</p>
    );
  }
  return (
    <>
      <h3 className="text-xs font-semibold uppercase text-muted-foreground mb-2">
        {(targetLanguage?.trim() || "Translated") + " SRT"}
      </h3>
      <pre className="whitespace-pre-wrap text-xs font-mono text-foreground max-h-[min(50vh,28rem)] overflow-y-auto">
        {payload.srtEnglish}
      </pre>
    </>
  );
}

function SidePreview({
  active,
  category,
  payload,
  videoObjectUrl,
  imageObjectUrl,
  vttUrl,
}: {
  active: TabId;
  category: MediaCategory;
  payload: ProcessPayload;
  videoObjectUrl: string | null;
  imageObjectUrl: string | null;
  vttUrl: string | null;
}) {
  if (active === "subtitles" && category === "video" && videoObjectUrl && vttUrl) {
    return (
      <video
        src={videoObjectUrl}
        controls
        className="w-full rounded-xl bg-black max-h-[min(45vh,320px)]"
      >
        <track kind="subtitles" src={vttUrl} srcLang="en" label="English" default />
      </video>
    );
  }
  if (active === "translation" && payload.category === "image" && imageObjectUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- local blob preview
      <img
        src={imageObjectUrl}
        alt=""
        className="max-h-48 rounded-lg object-contain opacity-90"
      />
    );
  }
  return (
    <p className="text-sm text-muted-foreground">
      {active === "original" && category === "video" && videoObjectUrl
        ? "Video preview is shown in the left column."
        : "Contextual preview for the selected tab."}
    </p>
  );
}

function DownloadActions({
  payload,
  onDownloadTxt,
  onDownloadSrt,
  onDownloadSpreadsheet,
}: {
  payload: ProcessPayload;
  onDownloadTxt: (text: string, name: string) => void;
  onDownloadSrt: (srt: string, name: string) => void;
  onDownloadSpreadsheet?: (token: string, fileName: string) => void;
}) {
  const txt =
    payload.category === "document" || payload.category === "image"
      ? payload.translatedText
      : payload.category === "audio" || payload.category === "video"
        ? payload.translatedText
        : "";

  return (
    <div className="mt-4 flex flex-wrap gap-2">
      {txt ? (
        <button
          type="button"
          onClick={() => onDownloadTxt(txt, "translation.txt")}
          className="rounded-xl bg-foreground px-4 py-2 text-sm font-medium text-background shadow-sm transition hover:opacity-90"
        >
          Download .txt
        </button>
      ) : null}
      {(payload.category === "audio" || payload.category === "video") &&
        payload.transcript.trim() && (
          <button
            type="button"
            onClick={() => onDownloadTxt(payload.transcript, "transcript.txt")}
            className="rounded-xl border border-border bg-card px-4 py-2 text-sm font-medium text-foreground shadow-sm transition hover:bg-muted"
          >
            Download transcript
          </button>
        )}
      {payload.category === "video" && (
        <button
          type="button"
          onClick={() => onDownloadSrt(payload.srtEnglish, "subtitles-en.srt")}
          className="rounded-xl border border-border bg-card px-4 py-2 text-sm font-medium text-foreground shadow-sm transition hover:bg-muted"
        >
          Download .srt
        </button>
      )}
      {payload.category === "spreadsheet" && onDownloadSpreadsheet && (
        <button
          type="button"
          onClick={() =>
            onDownloadSpreadsheet(payload.downloadToken, payload.downloadFileName)
          }
          className="rounded-xl bg-foreground px-4 py-2 text-sm font-medium text-background shadow-sm transition hover:opacity-90"
        >
          Download spreadsheet
        </button>
      )}
    </div>
  );
}

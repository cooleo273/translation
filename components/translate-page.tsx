"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { MultimodalResult } from "@/components/ui/multimodal-result";
import { UploadZone } from "@/components/ui/upload-zone";
import { Spinner } from "@/components/ui/spinner";
import type { MediaCategory } from "@/lib/types";
import type { ProcessPayload, ProcessStreamEvent } from "@/lib/process-types";
import { processUploadStream } from "@/lib/process-client";
import type { DocumentPipelineTranslation } from "@/lib/ai";
import {
  extensionToCategory,
  getExtension,
  isAllowedExtension,
  MAX_BYTES,
} from "@/lib/validation";
import { SiteHeader } from "@/components/site-header";
import { uploadFileWithProgress } from "@/lib/upload-client";
import { COMMON_LANGUAGES } from "@/lib/languages";

type Phase = "idle" | "uploading" | "processing";

function describeStep(ev: ProcessStreamEvent): string {
  if (ev.step === "processing" && ev.detail) {
    return "Preparing…";
  }
  switch (ev.step) {
    case "extracting":
      return "Extracting text…";
    case "extracting_audio":
      return "Extracting audio from video…";
    case "transcribing":
      return "Transcribing…";
    case "ocr":
      return "Reading text from image (OCR)…";
    case "translating":
      return "Translating…";
    case "spreadsheet":
      return "Translating spreadsheet cells…";
    case "subtitles":
      return "Translating subtitles…";
    case "completed":
      return "Completed.";
    default:
      return "Processing…";
  }
}

export function TranslatePage() {
  const [file, setFile] = useState<File | null>(null);
  const [category, setCategory] = useState<MediaCategory | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [uploadPct, setUploadPct] = useState(0);
  const [statusLine, setStatusLine] = useState("");
  const [payload, setPayload] = useState<ProcessPayload | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [targetLanguage, setTargetLanguage] = useState<string>("English");
  const [customTarget, setCustomTarget] = useState<string>("");
  const [mode, setMode] = useState<
    NonNullable<DocumentPipelineTranslation["mode"]>
  >("standard");

  const busy = phase !== "idle";

  useEffect(() => {
    if (!file) {
      setVideoUrl(null);
      setImageUrl(null);
      return;
    }
    const ext = getExtension(file.name);
    if (!isAllowedExtension(ext)) return;
    const cat = extensionToCategory(ext);
    if (cat === "video") {
      const u = URL.createObjectURL(file);
      setVideoUrl(u);
      setImageUrl(null);
      return () => URL.revokeObjectURL(u);
    }
    if (cat === "image") {
      const u = URL.createObjectURL(file);
      setImageUrl(u);
      setVideoUrl(null);
      return () => URL.revokeObjectURL(u);
    }
    setVideoUrl(null);
    setImageUrl(null);
  }, [file]);

  const validateClientFile = useCallback((f: File | null) => {
    if (!f) {
      setFile(null);
      setCategory(null);
      setPayload(null);
      return;
    }
    if (f.size > MAX_BYTES) {
      toast.error("File is too large. Maximum size is 10MB.");
      return;
    }
    const ext = getExtension(f.name);
    if (!isAllowedExtension(ext)) {
      toast.error("Unsupported file type.");
      return;
    }
    setFile(f);
    setCategory(extensionToCategory(ext));
    setPayload(null);
  }, []);

  const runProcess = useCallback(async () => {
    if (!file) return;

    setPayload(null);
    setUploadPct(0);
    setStatusLine("");

    try {
      setPhase("uploading");
      const up = await uploadFileWithProgress(file, setUploadPct);
      setPhase("processing");
      setStatusLine("Starting…");

      const tl = (targetLanguage === "__custom__"
        ? customTarget.trim()
        : targetLanguage.trim()) || "English";

      const translation: DocumentPipelineTranslation = {
        targetLanguage: tl,
        mode,
      };

      const result = await processUploadStream(
        up.uploadId,
        (ev) => {
          setStatusLine(describeStep(ev));
        },
        translation,
      );

      setPayload(result);
      toast.success("Processing complete.");
    } catch (e) {
      const message = e instanceof Error ? e.message : "Something went wrong.";
      toast.error(message);
    } finally {
      setPhase("idle");
      setUploadPct(0);
      setStatusLine("");
    }
  }, [customTarget, file, mode, targetLanguage]);

  const downloadTxt = useCallback((text: string, name: string) => {
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Download started.");
  }, []);

  const downloadSrt = useCallback((srt: string, name: string) => {
    const blob = new Blob([srt], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Download started.");
  }, []);

  const downloadSpreadsheet = useCallback((token: string, fileName: string) => {
    const url = `/api/download?token=${encodeURIComponent(token)}`;
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    a.click();
    toast.success("Download started.");
  }, []);

  const showResult = payload && category;

  const buttonLabel = useMemo(() => {
    if (phase === "uploading") return "Uploading…";
    if (phase === "processing") return "Processing…";
    return "Process & translate";
  }, [phase]);

  return (
    <div className="min-h-screen bg-gradient-to-b from-background via-card to-background px-4 pb-16 pt-0 sm:px-6 lg:px-8">
      <SiteHeader />
      <div className="mx-auto max-w-5xl pt-12">
        <header className="mb-10 text-center">
          <h1 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
            Translate
          </h1>
          <p className="mx-auto mt-2 max-w-xl text-sm text-muted-foreground sm:text-base">
            Upload documents, media, or spreadsheets — we route each type through
            the right pipeline and translate to your chosen language.
          </p>
        </header>

        <div className="rounded-2xl border border-border bg-card/80 p-6 shadow-[0_20px_50px_-12px_rgba(0,0,0,0.12)] backdrop-blur-sm transition-shadow duration-300 hover:shadow-[0_24px_60px_-12px_rgba(0,0,0,0.14)] dark:shadow-[0_20px_50px_-12px_rgba(0,0,0,0.4)] dark:hover:shadow-[0_24px_60px_-12px_rgba(0,0,0,0.5)] sm:p-8">
          <UploadZone
            file={file}
            category={category}
            disabled={busy}
            onFile={validateClientFile}
          />

          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-muted-foreground">
                Translate to
              </label>
              <select
                value={targetLanguage}
                disabled={busy}
                onChange={(e) => setTargetLanguage(e.target.value)}
                className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground"
              >
                {COMMON_LANGUAGES.map((l) => (
                  <option key={l} value={l}>
                    {l}
                  </option>
                ))}
                <option value="__custom__">Custom…</option>
              </select>
              {targetLanguage === "__custom__" && (
                <input
                  value={customTarget}
                  disabled={busy}
                  onChange={(e) => setCustomTarget(e.target.value)}
                  placeholder="Type any language Gemini supports (e.g. Somali)"
                  className="mt-2 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground"
                />
              )}
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground">
                Style
              </label>
              <select
                value={mode}
                disabled={busy}
                onChange={(e) =>
                  setMode(
                    e.target.value as NonNullable<
                      DocumentPipelineTranslation["mode"]
                    >,
                  )
                }
                className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground"
              >
                <option value="standard">Standard</option>
                <option value="formal">Formal</option>
                <option value="casual">Casual</option>
                <option value="technical">Technical</option>
                <option value="legal">Legal</option>
              </select>
            </div>
          </div>

          <div className="mt-6 flex flex-col items-stretch gap-4 sm:flex-row sm:items-center sm:justify-between">
            <button
              type="button"
              disabled={!file || busy}
              onClick={runProcess}
              className="inline-flex items-center justify-center gap-2 rounded-2xl bg-foreground px-8 py-3.5 text-sm font-semibold text-background shadow-md transition enabled:hover:opacity-90 enabled:active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-40"
            >
              {(phase === "uploading" || phase === "processing") && (
                <Spinner className="!h-4 !w-4 border-background/30 border-t-background" />
              )}
              {buttonLabel}
            </button>
            {file && !busy && (
              <p className="text-center text-xs text-muted-foreground sm:text-right">
                {(file.size / 1024).toFixed(1)} KB
              </p>
            )}
          </div>

          {phase === "uploading" && (
            <div className="mt-6 space-y-2">
              <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-foreground transition-all duration-200 ease-out"
                  style={{ width: `${uploadPct}%` }}
                />
              </div>
              <p className="text-center text-xs text-muted-foreground">
                Uploading {uploadPct}%
              </p>
            </div>
          )}

          {phase === "processing" && (
            <div className="mt-6 space-y-3">
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                <div className="h-full w-full animate-pulse rounded-full bg-muted-foreground/50" />
              </div>
              <p className="text-center text-sm text-muted-foreground">{statusLine}</p>
            </div>
          )}
        </div>

        {showResult && (
          <MultimodalResult
            category={category}
            payload={payload}
            previewFile={file}
            videoObjectUrl={videoUrl}
            imageObjectUrl={imageUrl}
            targetLanguage={
              (targetLanguage === "__custom__"
                ? customTarget.trim()
                : targetLanguage.trim()) || "English"
            }
            onDownloadTxt={downloadTxt}
            onDownloadSrt={downloadSrt}
            onDownloadSpreadsheet={downloadSpreadsheet}
          />
        )}
      </div>
    </div>
  );
}

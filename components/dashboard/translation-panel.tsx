"use client";

import { diffLines } from "diff";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import type { FileRow, TranslationRow } from "@/lib/types/saas";
import { COMMON_LANGUAGES } from "@/lib/languages";
import type { DocumentPipelineTranslation } from "@/lib/ai";
import { Button } from "@/components/ui/button";
import { FilePreview } from "@/components/dashboard/file-preview";

type DetailResponse = {
  file: FileRow;
  translations: TranslationRow[];
};

export function TranslationPanel({
  fileId,
  onClose,
  onChanged,
}: Readonly<{
  fileId: string;
  onClose: () => void;
  onChanged: () => void;
}>) {
  const [detail, setDetail] = useState<DetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [editorText, setEditorText] = useState("");
  const [baselineText, setBaselineText] = useState("");
  const [translationId, setTranslationId] = useState<string | null>(null);
  const [versions, setVersions] = useState<
    Array<{ id: string; translation_id: string; version: number; created_at: string; translated_text: string }>
  >([]);
  const [showDiff, setShowDiff] = useState(false);
  const [saving, setSaving] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [targetLanguage, setTargetLanguage] = useState<string>("English");
  const [customTarget, setCustomTarget] = useState<string>("");
  const [mode, setMode] = useState<
    NonNullable<DocumentPipelineTranslation["mode"]>
  >("standard");
  const [jobStatusLine, setJobStatusLine] = useState<string | null>(null);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [splitView, setSplitView] = useState(true);
  const leftScrollRef = useRef<HTMLDivElement>(null);
  const rightScrollRef = useRef<HTMLDivElement>(null);
  const syncingScroll = useRef(false);
  const processAbortRef = useRef<AbortController | null>(null);
  const stopPollingRef = useRef(false);

  const transcribeOnly = useMemo(() => {
    const t = detail?.file.file_type;
    return t === "audio" || t === "video";
  }, [detail?.file.file_type]);

  function onScrollSync(from: "left" | "right") {
    if (syncingScroll.current) return;
    const a = from === "left" ? leftScrollRef.current : rightScrollRef.current;
    const b = from === "left" ? rightScrollRef.current : leftScrollRef.current;
    if (!a || !b) return;
    const maxA = a.scrollHeight - a.clientHeight;
    const maxB = b.scrollHeight - b.clientHeight;
    if (maxA <= 0 || maxB <= 0) return;
    const ratio = a.scrollTop / maxA;
    syncingScroll.current = true;
    b.scrollTop = ratio * maxB;
    requestAnimationFrame(() => {
      syncingScroll.current = false;
    });
  }

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/app/files/${fileId}`);
      if (!res.ok) throw new Error("Failed to load file");
      const data = (await res.json()) as DetailResponse;
      setDetail(data);
      const latest = data.translations[0];
      const t = latest?.translated_text ?? "";
      setEditorText(t);
      setBaselineText(t);
      setTranslationId(latest?.id ?? null);
      setVersions([]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Load failed");
    } finally {
      setLoading(false);
    }
  }, [fileId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!translationId) {
      setVersions([]);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(
          `/api/app/files/${fileId}/versions?translationId=${encodeURIComponent(translationId)}`,
        );
        if (!res.ok) return;
        const j = (await res.json()) as {
          versions?: Array<{
            id: string;
            translation_id: string;
            version: number;
            created_at: string;
            translated_text: string;
          }>;
        };
        if (!cancelled) setVersions(j.versions ?? []);
      } catch {
        if (!cancelled) setVersions([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [fileId, translationId]);

  async function saveVersion() {
    if (!translationId) {
      toast.error("Nothing to save yet — process the file first.");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/app/files/${fileId}/versions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          translation_id: translationId,
          translated_text: editorText,
        }),
      });
      if (!res.ok) {
        const j = (await res.json()) as { error?: string };
        throw new Error(j.error ?? "Save failed");
      }
      toast.success("Version saved.");
      setBaselineText(editorText);
      onChanged();
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function runProcess() {
    setProcessing(true);
    setJobStatusLine(null);
    setActiveJobId(null);
    stopPollingRef.current = false;
    try {
      const tl = (targetLanguage === "__custom__"
        ? customTarget.trim()
        : targetLanguage.trim()) || "English";
      const translation: DocumentPipelineTranslation | undefined = transcribeOnly
        ? undefined
        : {
            targetLanguage: tl,
            mode,
          };
      const controller = new AbortController();
      processAbortRef.current = controller;
      const res = await fetch(`/api/app/files/${fileId}/process`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: translation ? JSON.stringify({ translation }) : "{}",
        signal: controller.signal,
      });
      const j = (await res.json()) as {
        error?: string;
        ok?: boolean;
        queued?: boolean;
        jobId?: string;
      };
      if (!res.ok) throw new Error(j.error ?? "Process failed");

      if (j.queued && j.jobId) {
        setActiveJobId(j.jobId);
        const t0 = Date.now();
        const pollMs = 2000;
        const maxMs = 15 * 60 * 1000;
        setJobStatusLine("Queued…");
        while (Date.now() - t0 < maxMs) {
          if (stopPollingRef.current) {
            setJobStatusLine(null);
            return;
          }
          await new Promise((r) => setTimeout(r, pollMs));
          const elapsed = Math.floor((Date.now() - t0) / 1000);
          const mm = Math.floor(elapsed / 60);
          const ss = elapsed % 60;
          setJobStatusLine(
            `Background job running… ${mm}:${ss.toString().padStart(2, "0")}`,
          );
          const r = await fetch(`/api/app/jobs/${j.jobId}`);
          const s = (await r.json()) as {
            status?: string;
            error?: string | null;
          };
          if (!r.ok) throw new Error("Could not poll job status.");
          if (s.status === "completed") {
            setJobStatusLine(null);
            toast.success("Processing complete.");
            onChanged();
            await load();
            return;
          }
          if (s.status === "failed") {
            throw new Error(s.error?.trim() || "Job failed.");
          }
          if (s.status === "canceled") {
            setJobStatusLine(null);
            toast.message("Canceled.");
            onChanged();
            await load();
            return;
          }
        }
        setJobStatusLine(null);
        throw new Error(
          "Still processing after 15 minutes. Refresh this file or check the Files list.",
        );
      } else {
        toast.success("Processing complete.");
      }

      onChanged();
      await load();
    } catch (e) {
      setJobStatusLine(null);
      const msg = e instanceof Error ? e.message : "Process failed";
      if (msg !== "Canceled") toast.error(msg);
    } finally {
      processAbortRef.current = null;
      setProcessing(false);
    }
  }

  async function stopProcessing() {
    processAbortRef.current?.abort();
    if (!activeJobId) return;
    stopPollingRef.current = true;
    try {
      await fetch(`/api/app/jobs/${activeJobId}/cancel`, { method: "POST" });
    } catch {
      // best-effort
    }
  }

  async function removeFile() {
    if (!confirm("Delete this file and its translations?")) return;
    const res = await fetch(`/api/app/files/${fileId}`, { method: "DELETE" });
    if (!res.ok) {
      toast.error("Delete failed.");
      return;
    }
    toast.success("Deleted.");
    onChanged();
    onClose();
  }

  if (loading || !detail) {
    return (
      <div className="flex h-full flex-col">
        <div className="border-b border-border/60 px-5 py-4">
          <div className="h-5 w-40 animate-pulse bg-muted" />
        </div>
        <div className="flex flex-1 items-center justify-center p-8 text-[15px] text-muted-foreground">
          Loading…
        </div>
      </div>
    );
  }

  const { file, translations } = detail;
  const latest = translations[0];
  const original = latest?.original_text ?? "";
  const isSheet =
    latest?.document_type === "spreadsheet" ||
    latest?.translated_text === "[spreadsheet translated]";
  const pu = file.processed_url as {
    srtEnglish?: string;
    spreadsheetUrl?: string;
  } | null;

  const diffParts =
    showDiff && !isSheet
      ? diffLines(baselineText || original, editorText)
      : null;

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <header className="shrink-0 border-b border-border/60 px-4 py-3">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <h2
              id="file-drawer-title"
              className="truncate text-[15px] font-semibold leading-snug tracking-tight text-foreground"
            >
              {file.file_name}
            </h2>
            <p className="mt-1 text-[12px] text-muted-foreground">
              {file.file_type} · {new Date(file.created_at).toLocaleString()}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-3">
            <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              {file.status}
            </span>
            <button
              type="button"
              onClick={onClose}
              className="p-1 text-muted-foreground transition-colors hover:text-foreground"
              aria-label="Close"
            >
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" aria-hidden>
                <path
                  d="M6 6l12 12M18 6L6 18"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
              </svg>
            </button>
          </div>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4">
        <div className="space-y-6 pb-8">
          <section className="border-b border-border/40 pb-6">
            <h3 className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Preview
            </h3>
            <FilePreview file={file} />
          </section>

          {jobStatusLine && (
            <p className="rounded-md border border-border/60 bg-muted/40 px-3 py-2 text-[13px] text-foreground">
              {jobStatusLine}
            </p>
          )}

          <div className="flex flex-wrap gap-3">
            <Button
              type="button"
              disabled={processing}
              onClick={() => void runProcess()}
              size="sm"
            >
              {processing ? "Processing…" : transcribeOnly ? "Transcribe" : "Translate"}
            </Button>
            {processing && (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => void stopProcessing()}
              >
                Stop
              </Button>
            )}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-destructive hover:text-destructive"
              onClick={() => void removeFile()}
            >
              Delete
            </Button>
          </div>

          <div className="space-y-3 border-b border-border/40 pb-6">
            <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              {transcribeOnly ? "Transcription" : "Translation"}
            </h3>
            <p className="text-[13px] text-muted-foreground">
              Detected:{" "}
              <span className="text-foreground">{latest?.detected_language ?? "—"}</span>
            </p>
            {!transcribeOnly ? (
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label
                    htmlFor="panelTargetLanguage"
                    className="mb-2 block text-[12px] font-medium text-muted-foreground"
                  >
                    Target language
                  </label>
                  <select
                    id="panelTargetLanguage"
                    value={targetLanguage}
                    disabled={processing}
                    onChange={(e) => setTargetLanguage(e.target.value)}
                    className="h-9 w-full border-0 border-b border-border bg-transparent px-0 py-1 text-[14px] text-foreground outline-none focus:border-foreground"
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
                      disabled={processing}
                      onChange={(e) => setCustomTarget(e.target.value)}
                      placeholder="Language name"
                      className="mt-3 h-9 w-full border-0 border-b border-border bg-transparent px-0 text-[14px] outline-none focus:border-foreground"
                    />
                  )}
                </div>
                <div>
                  <label
                    htmlFor="panelStyleMode"
                    className="mb-2 block text-[12px] font-medium text-muted-foreground"
                  >
                    Style
                  </label>
                  <select
                    id="panelStyleMode"
                    value={mode}
                    disabled={processing}
                    onChange={(e) =>
                      setMode(
                        e.target.value as NonNullable<
                          DocumentPipelineTranslation["mode"]
                        >,
                      )
                    }
                    className="h-9 w-full border-0 border-b border-border bg-transparent px-0 py-1 text-[14px] outline-none focus:border-foreground"
                  >
                    <option value="standard">Standard</option>
                    <option value="formal">Formal</option>
                    <option value="casual">Casual</option>
                    <option value="technical">Technical</option>
                    <option value="legal">Legal</option>
                  </select>
                </div>
              </div>
            ) : (
              <p className="text-[13px] text-muted-foreground">
                We’ll automatically detect the spoken language and return a transcript.
              </p>
            )}
          </div>

          <div className="space-y-3 border-b border-border/40 pb-6">
            <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Export
            </h3>
            <div className="flex flex-wrap gap-x-4 gap-y-2 text-[13px] font-medium">
              {!isSheet && latest && (
                <>
                  <a
                    className="text-foreground underline-offset-4 hover:underline"
                    href={`/api/app/files/${fileId}/export?format=txt`}
                  >
                    TXT
                  </a>
                  <a
                    className="text-foreground underline-offset-4 hover:underline"
                    href={`/api/app/files/${fileId}/export?format=pdf`}
                  >
                    PDF
                  </a>
                  <a
                    className="text-foreground underline-offset-4 hover:underline"
                    href={`/api/app/files/${fileId}/export?format=docx`}
                  >
                    DOCX
                  </a>
                </>
              )}
              {pu?.srtEnglish ? (
                <a
                  className="text-foreground underline-offset-4 hover:underline"
                  href={`/api/app/files/${fileId}/export?format=srt`}
                >
                  SRT
                </a>
              ) : null}
              {pu?.spreadsheetUrl ? (
                <a
                  className="text-foreground underline-offset-4 hover:underline"
                  href={`/api/app/files/${fileId}/export?format=spreadsheet`}
                >
                  Spreadsheet
                </a>
              ) : null}
            </div>
          </div>

          <div className="space-y-2 border-b border-border/40 pb-6">
            <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              History
            </h3>
            {versions.length === 0 ? (
              <p className="text-[13px] text-muted-foreground">
                No saved versions yet.
              </p>
            ) : (
              <ul className="space-y-1 text-[13px]">
                {versions.slice(0, 8).map((v) => (
                  <li key={v.id} className="text-muted-foreground">
                    v{v.version} · {new Date(v.created_at).toLocaleString()}
                  </li>
                ))}
              </ul>
            )}
          </div>

          {!isSheet && !latest && file.status !== "processing" && (
            <p className="text-[14px] leading-relaxed text-muted-foreground">
              Process this file to generate a translation.
            </p>
          )}

          {!isSheet && latest && (
            <div className="space-y-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Editor
                </h3>
                <label className="flex cursor-pointer items-center gap-2 text-[12px] text-muted-foreground">
                  <input
                    type="checkbox"
                    checked={splitView}
                    onChange={(e) => setSplitView(e.target.checked)}
                    className="size-3.5 rounded-sm border-border"
                  />
                  Side-by-side
                </label>
              </div>

              {splitView ? (
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="min-h-0">
                    <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Original
                    </h4>
                    <div
                      ref={leftScrollRef}
                      onScroll={() => onScrollSync("left")}
                      className="max-h-[min(52vh,520px)] overflow-auto rounded-md border border-border/40 bg-muted/20 p-3"
                    >
                      <pre className="whitespace-pre-wrap text-[13px] leading-relaxed text-foreground">
                        {original || "—"}
                      </pre>
                    </div>
                  </div>
                  <div className="min-h-0">
                    <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Translation
                    </h4>
                    <div
                      ref={rightScrollRef}
                      onScroll={() => onScrollSync("right")}
                      className="max-h-[min(52vh,520px)] overflow-auto rounded-md border border-border/40 bg-muted/20 p-1"
                    >
                      <textarea
                        value={editorText}
                        onChange={(e) => setEditorText(e.target.value)}
                        rows={14}
                        className="min-h-[220px] w-full resize-none border-0 bg-transparent px-2 py-2 text-[13px] leading-relaxed outline-none"
                      />
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-6">
                  <div>
                    <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Original
                    </h4>
                    <pre className="max-h-[min(28vh,200px)] overflow-auto whitespace-pre-wrap text-[13px] leading-relaxed text-foreground">
                      {original || "—"}
                    </pre>
                  </div>
                  <div>
                    <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Translation
                    </h4>
                    <textarea
                      value={editorText}
                      onChange={(e) => setEditorText(e.target.value)}
                      rows={10}
                      className="w-full resize-y border-0 bg-muted/40 px-3 py-3 text-[13px] leading-relaxed outline-none ring-0 focus:bg-muted/60"
                    />
                  </div>
                </div>
              )}
              <div className="flex flex-wrap items-center gap-4">
                <label className="flex cursor-pointer items-center gap-2 text-[13px] text-muted-foreground">
                  <input
                    type="checkbox"
                    checked={showDiff}
                    onChange={(e) => setShowDiff(e.target.checked)}
                    className="size-3.5 rounded-sm border-border"
                  />
                  Show diff
                </label>
                <Button
                  type="button"
                  size="sm"
                  disabled={saving}
                  onClick={() => void saveVersion()}
                >
                  {saving ? "Saving…" : "Save version"}
                </Button>
              </div>
              {showDiff && diffParts && (
                <div>
                  <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Diff
                  </h3>
                  <pre className="max-h-48 overflow-auto font-mono text-[11px] leading-relaxed whitespace-pre-wrap">
                    {diffParts.map((part, i) => (
                      <span
                        key={i}
                        className={
                          part.added
                            ? "bg-emerald-500/15 text-emerald-900 dark:text-emerald-100"
                            : part.removed
                              ? "bg-red-500/15 text-red-900 dark:text-red-100"
                              : "text-foreground/80"
                        }
                      >
                        {part.value}
                      </span>
                    ))}
                  </pre>
                </div>
              )}
            </div>
          )}

          {isSheet && file.status === "completed" && (
            <p className="text-[14px] text-muted-foreground">
              Use the spreadsheet export link above.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

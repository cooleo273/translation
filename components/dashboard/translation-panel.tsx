"use client";

import { diffLines } from "diff";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import type { FileRow, TranslationRow } from "@/lib/types/saas";
import { COMMON_LANGUAGES } from "@/lib/languages";
import type { DocumentPipelineTranslation } from "@/lib/ai";

type DetailResponse = {
  file: FileRow;
  translations: TranslationRow[];
};

export function TranslationPanel({
  fileId,
  onClose,
  onChanged,
}: {
  fileId: string;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [detail, setDetail] = useState<DetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [editorText, setEditorText] = useState("");
  const [baselineText, setBaselineText] = useState("");
  const [translationId, setTranslationId] = useState<string | null>(null);
  const [showDiff, setShowDiff] = useState(false);
  const [saving, setSaving] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [targetLanguage, setTargetLanguage] = useState<string>("English");
  const [customTarget, setCustomTarget] = useState<string>("");
  const [mode, setMode] = useState<
    NonNullable<DocumentPipelineTranslation["mode"]>
  >("standard");

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
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Load failed");
    } finally {
      setLoading(false);
    }
  }, [fileId]);

  useEffect(() => {
    void load();
  }, [load]);

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
    try {
      const tl = (targetLanguage === "__custom__"
        ? customTarget.trim()
        : targetLanguage.trim()) || "English";
      const translation: DocumentPipelineTranslation = {
        targetLanguage: tl,
        mode,
      };
      const res = await fetch(`/api/app/files/${fileId}/process`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ translation }),
      });
      const j = (await res.json()) as {
        error?: string;
        ok?: boolean;
        queued?: boolean;
        jobId?: string;
      };
      if (!res.ok) throw new Error(j.error ?? "Process failed");

      if (j.queued && j.jobId) {
        toast.message("Processing in the background…");
        for (let i = 0; i < 120; i++) {
          await new Promise((r) => setTimeout(r, 2500));
          const r = await fetch(`/api/app/jobs/${j.jobId}`);
          const s = (await r.json()) as {
            status?: string;
            error?: string | null;
          };
          if (!r.ok) throw new Error("Could not poll job status.");
          if (s.status === "completed") break;
          if (s.status === "failed") {
            throw new Error(s.error ?? "Job failed.");
          }
        }
        toast.success("Processing complete.");
      } else {
        toast.success("Processing complete.");
      }

      onChanged();
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Process failed");
    } finally {
      setProcessing(false);
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
      <div className="flex h-full min-h-0 flex-col bg-gradient-to-b from-card to-muted/15">
        <header className="flex shrink-0 items-center justify-between border-b border-border/80 px-4 py-4">
          <div className="h-10 w-40 animate-pulse rounded-xl bg-muted" />
          <div className="h-9 w-9 animate-pulse rounded-full bg-muted" />
        </header>
        <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-sm text-muted-foreground">
          <span className="inline-flex h-8 w-8 animate-spin rounded-full border-2 border-muted-foreground/25 border-t-foreground" />
          Loading file…
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
    <div className="flex h-full min-h-0 flex-col bg-gradient-to-b from-card via-card to-muted/20">
      <header className="shrink-0 border-b border-border/80 bg-card/95 px-4 py-4 backdrop-blur-md">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <h2
              id="file-drawer-title"
              className="truncate text-lg font-semibold leading-tight text-foreground"
            >
              {file.file_name}
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">
              {file.file_type} · {new Date(file.created_at).toLocaleString()}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <span
              className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                file.status === "completed"
                  ? "bg-emerald-500/15 text-emerald-800 dark:text-emerald-200"
                  : file.status === "failed"
                    ? "bg-red-500/15 text-red-800 dark:text-red-200"
                    : "bg-amber-500/15 text-amber-900 dark:text-amber-100"
              }`}
            >
              {file.status}
            </span>
            <button
              type="button"
              onClick={onClose}
              className="flex h-9 w-9 items-center justify-center rounded-xl border border-border/80 bg-background text-muted-foreground transition hover:bg-muted hover:text-foreground"
              aria-label="Close panel"
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
        <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
          Process, edit translation, and export — same flow as the translator, in a side
          panel.
        </p>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4">
        <div className="space-y-5 pb-8">
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={processing}
              onClick={() => void runProcess()}
              className="rounded-xl bg-foreground px-4 py-2.5 text-sm font-semibold text-background shadow-sm transition enabled:hover:opacity-90 disabled:opacity-50"
            >
              {processing ? "Processing…" : "Process / reprocess"}
            </button>
            <button
              type="button"
              onClick={() => void removeFile()}
              className="rounded-xl border border-red-500/30 bg-red-500/5 px-4 py-2.5 text-sm font-medium text-red-700 transition hover:bg-red-500/10 dark:text-red-400"
            >
              Delete
            </button>
          </div>

          <div className="rounded-2xl border border-border/80 bg-muted/25 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Translation settings
            </p>
            <div className="mt-3 grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <p className="text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">Detected:</span>{" "}
                  {latest?.detected_language ?? "—"}
                </p>
              </div>
              <div>
                <label className="block text-xs font-medium text-muted-foreground">
                  Translate to
                </label>
                <select
                  value={targetLanguage}
                  disabled={processing}
                  onChange={(e) => setTargetLanguage(e.target.value)}
                  className="mt-1.5 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground"
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
                    placeholder="Any language Gemini supports"
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
                  disabled={processing}
                  onChange={(e) =>
                    setMode(
                      e.target.value as NonNullable<
                        DocumentPipelineTranslation["mode"]
                      >,
                    )
                  }
                  className="mt-1.5 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground"
                >
                  <option value="standard">Standard</option>
                  <option value="formal">Formal</option>
                  <option value="casual">Casual</option>
                  <option value="technical">Technical</option>
                  <option value="legal">Legal</option>
                </select>
              </div>
            </div>
          </div>

          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Export
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {!isSheet && latest && (
                <>
                  <a
                    className="rounded-xl border border-border bg-background px-3 py-2 text-sm font-medium text-foreground shadow-sm transition hover:bg-muted"
                    href={`/api/app/files/${fileId}/export?format=txt`}
                  >
                    TXT
                  </a>
                  <a
                    className="rounded-xl border border-border bg-background px-3 py-2 text-sm font-medium text-foreground shadow-sm transition hover:bg-muted"
                    href={`/api/app/files/${fileId}/export?format=pdf`}
                  >
                    PDF
                  </a>
                  <a
                    className="rounded-xl border border-border bg-background px-3 py-2 text-sm font-medium text-foreground shadow-sm transition hover:bg-muted"
                    href={`/api/app/files/${fileId}/export?format=docx`}
                  >
                    DOCX
                  </a>
                </>
              )}
              {pu?.srtEnglish ? (
                <a
                  className="rounded-xl border border-border bg-background px-3 py-2 text-sm font-medium text-foreground shadow-sm transition hover:bg-muted"
                  href={`/api/app/files/${fileId}/export?format=srt`}
                >
                  SRT
                </a>
              ) : null}
              {pu?.spreadsheetUrl ? (
                <a
                  className="rounded-xl border border-border bg-background px-3 py-2 text-sm font-medium text-foreground shadow-sm transition hover:bg-muted"
                  href={`/api/app/files/${fileId}/export?format=spreadsheet`}
                >
                  Spreadsheet
                </a>
              ) : null}
            </div>
          </div>

          {!isSheet && !latest && file.status !== "processing" && (
            <p className="rounded-2xl border border-dashed border-border bg-muted/20 px-4 py-4 text-sm text-muted-foreground">
              Process this file to generate a translation. You can refine it here and save
              versions.
            </p>
          )}

          {!isSheet && latest && (
            <div className="space-y-4">
              <div className="grid gap-4 lg:grid-cols-1">
                <div>
                  <label className="text-xs font-semibold text-muted-foreground">
                    Original
                  </label>
                  <pre className="mt-2 max-h-[min(30vh,220px)] overflow-auto rounded-2xl border border-border/80 bg-muted/30 p-3 text-xs leading-relaxed text-foreground whitespace-pre-wrap">
                    {original || "—"}
                  </pre>
                </div>
                <div>
                  <label className="text-xs font-semibold text-muted-foreground">
                    Translation (editable)
                  </label>
                  <textarea
                    value={editorText}
                    onChange={(e) => setEditorText(e.target.value)}
                    rows={10}
                    className="mt-2 w-full resize-y rounded-2xl border border-border bg-background px-3 py-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-foreground/15"
                  />
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <label className="flex cursor-pointer items-center gap-2 text-sm text-muted-foreground">
                  <input
                    type="checkbox"
                    checked={showDiff}
                    onChange={(e) => setShowDiff(e.target.checked)}
                    className="rounded border-border"
                  />
                  Diff vs. last saved
                </label>
                <button
                  type="button"
                  disabled={saving || editorText === baselineText}
                  onClick={() => void saveVersion()}
                  className="rounded-xl bg-foreground px-4 py-2 text-sm font-semibold text-background transition enabled:hover:opacity-90 disabled:opacity-40"
                >
                  {saving ? "Saving…" : "Save new version"}
                </button>
              </div>
              {showDiff && diffParts && (
                <div className="rounded-2xl border border-border bg-muted/25 p-3">
                  <p className="mb-2 text-xs font-medium text-muted-foreground">Diff</p>
                  <pre className="max-h-48 overflow-auto font-mono text-xs leading-relaxed whitespace-pre-wrap">
                    {diffParts.map((part, i) => (
                      <span
                        key={i}
                        className={
                          part.added
                            ? "bg-emerald-500/25 text-emerald-900 dark:text-emerald-100"
                            : part.removed
                              ? "bg-red-500/25 text-red-900 dark:text-red-100"
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
            <p className="text-sm text-muted-foreground">
              Spreadsheet output is available via the Spreadsheet export link above.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

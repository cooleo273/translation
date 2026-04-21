"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";
import type { MediaCategory } from "@/lib/types";
import type { FileRow } from "@/lib/types/saas";
import { COMMON_LANGUAGES } from "@/lib/languages";
import { FileCategoryIcon, categoryLabel } from "@/components/ui/file-type-icon";
import { TranslationPanel } from "@/components/dashboard/translation-panel";
import { TextTranslator } from "@/components/dashboard/text-translator";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const TYPES = ["all", "document", "audio", "video", "image", "spreadsheet", "text"] as const;

function categoryFromFileType(t: string): MediaCategory {
  const k = t.toLowerCase();
  if (
    k === "document" ||
    k === "audio" ||
    k === "video" ||
    k === "image" ||
    k === "spreadsheet"
  ) {
    return k;
  }
  return "document";
}

function statusLabel(status: string) {
  const s = status.toLowerCase();
  if (s === "completed") return "Ready";
  if (s === "failed") return "Failed";
  if (s === "processing") return "Processing";
  return status;
}

export function FileBrowser() {
  const [files, setFiles] = useState<FileRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [type, setType] = useState<(typeof TYPES)[number]>("all");
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [batchTarget, setBatchTarget] = useState("English");
  const [batchMode, setBatchMode] = useState<
    "standard" | "formal" | "casual" | "technical" | "legal"
  >("standard");
  const [batchBusy, setBatchBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (type !== "all" && type !== "text") params.set("type", type);
      const res = await fetch(`/api/app/files?${params.toString()}`);
      if (!res.ok) throw new Error("Failed to load files");
      const data = (await res.json()) as { files: FileRow[] };
      setFiles(data.files);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Load failed");
    } finally {
      setLoading(false);
    }
  }, [type]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setSelectedId(null);
    }
    globalThis.addEventListener("keydown", onKey);
    return () => globalThis.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (!selectedId) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [selectedId]);

  const filtered = useMemo(() => {
    let rows = files;
    const needle = q.trim().toLowerCase();
    if (needle) {
      rows = rows.filter((f) => f.file_name.toLowerCase().includes(needle));
    }
    if (favoritesOnly) {
      rows = rows.filter((f) => f.is_favorite);
    }
    return rows;
  }, [files, q, favoritesOnly]);

  function toggleRowSelected(id: string) {
    setSelectedIds((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  function clearSelection() {
    setSelectedIds(new Set());
  }

  async function batchProcess() {
    if (selectedIds.size === 0) return;
    setBatchBusy(true);
    try {
      const res = await fetch("/api/app/files/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "process",
          fileIds: Array.from(selectedIds),
          translation: {
            targetLanguage: batchTarget,
            mode: batchMode,
          },
        }),
      });
      const j = (await res.json()) as {
        error?: string;
        results?: { fileId: string; ok: boolean; error?: string }[];
      };
      if (!res.ok) throw new Error(j.error ?? "Batch failed");
      const failed = j.results?.filter((r) => !r.ok) ?? [];
      if (failed.length) {
        toast.error(
          `${failed.length} file(s) could not be processed. Check plan limits or errors.`,
        );
      } else {
        toast.success("Batch process finished.");
      }
      clearSelection();
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Batch failed");
    } finally {
      setBatchBusy(false);
    }
  }

  async function batchExport(fmt: "txt" | "pdf" | "docx") {
    if (selectedIds.size === 0) return;
    setBatchBusy(true);
    try {
      const res = await fetch("/api/app/files/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "export",
          fileIds: Array.from(selectedIds),
          format: fmt,
        }),
      });
      if (!res.ok) {
        const j = (await res.json()) as { error?: string };
        throw new Error(j.error ?? "Export failed");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `translations-${fmt}-${Date.now()}.zip`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Download started.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Export failed");
    } finally {
      setBatchBusy(false);
    }
  }

  async function toggleFavorite(f: FileRow, e: React.MouseEvent) {
    e.stopPropagation();
    const res = await fetch(`/api/app/files/${f.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_favorite: !f.is_favorite }),
    });
    if (!res.ok) {
      toast.error("Could not update favorite.");
      return;
    }
    void load();
  }

  async function onUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const list = e.target.files;
    if (!list?.length) return;
    const file = list[0];
    setUploading(true);
    try {
      const fd = new FormData();
      fd.set("file", file);
      const res = await fetch("/api/app/files/upload", {
        method: "POST",
        body: fd,
      });
      const j = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(j.error ?? "Upload failed");
      toast.success("Uploaded.");
      e.target.value = "";
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  const drawer =
    mounted &&
    selectedId &&
    createPortal(
      <div className="fixed inset-0 z-[100] flex" role="presentation">
        <button
          type="button"
          className="absolute inset-0 bg-black/20 dark:bg-black/40"
          aria-label="Close panel"
          onClick={() => setSelectedId(null)}
        />
        <div
          className="relative ml-auto flex h-full w-full max-w-xl flex-col border-l border-border/80 bg-background shadow-[0_0_0_0.5px_rgba(0,0,0,0.06)] dark:shadow-[0_0_0_0.5px_rgba(255,255,255,0.06)] md:w-[min(44rem,48vw)]"
          role="dialog"
          aria-modal="true"
          aria-labelledby="file-drawer-title"
        >
          <TranslationPanel
            fileId={selectedId}
            onClose={() => setSelectedId(null)}
            onChanged={() => void load()}
          />
        </div>
      </div>,
      document.body,
    );

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-[28px] font-semibold tracking-tight text-foreground md:text-[32px]">
          Files
        </h1>
        <p className="text-[14px] leading-relaxed text-muted-foreground">
          Select a file to translate or export. Details open in the panel on the right.
        </p>
      </header>

      <div className="flex flex-col gap-5 border-b border-border/60 pb-5 md:flex-row md:items-end md:justify-between">
        <div className="min-w-0 flex-1 md:max-w-md">
          <label htmlFor="q" className="mb-2 block text-[13px] font-medium text-muted-foreground">
            Search
          </label>
          <Input
            id="q"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Filter by name"
            className="h-10"
          />
        </div>
        <div className="flex flex-wrap items-center gap-6">
          <label className="flex cursor-pointer items-center gap-2 text-[13px] text-muted-foreground">
            <input
              type="checkbox"
              checked={favoritesOnly}
              onChange={(e) => setFavoritesOnly(e.target.checked)}
              className="size-3.5 rounded-sm border-border"
            />
            Favorites only
          </label>
          <div className="flex items-center gap-3">
            <label className="cursor-pointer text-[13px] font-medium text-foreground underline-offset-4 hover:underline">
              <input
                type="file"
                className="hidden"
                disabled={uploading}
                onChange={(e) => void onUpload(e)}
              />
              {uploading ? "Uploading…" : "Upload"}
            </label>
            <button
              type="button"
              onClick={() => void load()}
              className="text-[13px] font-medium text-muted-foreground hover:text-foreground"
            >
              Refresh
            </button>
          </div>
        </div>
      </div>

      {selectedIds.size > 0 && (
        <div className="flex flex-col gap-4 rounded-lg border border-border/60 bg-muted/20 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-[14px] font-medium text-foreground">
              {selectedIds.size} selected
            </p>
            <button
              type="button"
              className="text-[13px] text-muted-foreground hover:text-foreground"
              onClick={clearSelection}
            >
              Clear
            </button>
          </div>
          <div className="flex flex-wrap items-end gap-4">
            <div>
              <label
                htmlFor="batchTarget"
                className="mb-1 block text-[12px] font-medium text-muted-foreground"
              >
                Batch target language
              </label>
              <select
                id="batchTarget"
                value={batchTarget}
                disabled={batchBusy}
                onChange={(e) => setBatchTarget(e.target.value)}
                className="h-9 min-w-[140px] border-0 border-b border-border bg-transparent px-0 text-[14px] outline-none"
              >
                {COMMON_LANGUAGES.map((l) => (
                  <option key={l} value={l}>
                    {l}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label
                htmlFor="batchMode"
                className="mb-1 block text-[12px] font-medium text-muted-foreground"
              >
                Style
              </label>
              <select
                id="batchMode"
                value={batchMode}
                disabled={batchBusy}
                onChange={(e) =>
                  setBatchMode(
                    e.target.value as typeof batchMode,
                  )
                }
                className="h-9 min-w-[120px] border-0 border-b border-border bg-transparent px-0 text-[14px] outline-none"
              >
                <option value="standard">Standard</option>
                <option value="formal">Formal</option>
                <option value="casual">Casual</option>
                <option value="technical">Technical</option>
                <option value="legal">Legal</option>
              </select>
            </div>
            <Button
              type="button"
              size="sm"
              disabled={batchBusy}
              onClick={() => void batchProcess()}
            >
              {batchBusy ? "Working…" : "Reprocess selected"}
            </Button>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={batchBusy}
                onClick={() => void batchExport("txt")}
              >
                ZIP · TXT
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={batchBusy}
                onClick={() => void batchExport("pdf")}
              >
                ZIP · PDF
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={batchBusy}
                onClick={() => void batchExport("docx")}
              >
                ZIP · DOCX
              </Button>
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-2 border-b border-border/40 pb-4">
        {TYPES.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setType(t)}
            className={`px-3 py-1.5 text-[13px] font-medium transition-colors ${
              type === t
                ? "text-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {t === "all"
              ? "All"
              : t === "text"
                ? "Text"
                : categoryLabel(categoryFromFileType(t))}
          </button>
        ))}
      </div>

      <section>
        {type === "text" ? (
          <TextTranslator />
        ) : (
          <>
            {loading && (
              <p className="py-16 text-center text-[15px] text-muted-foreground">Loading…</p>
            )}
            {!loading && filtered.length === 0 && (
              <p className="py-16 text-center text-[15px] leading-relaxed text-muted-foreground">
                No files match.
                <br />
                <span className="text-[13px]">Upload to see it listed here.</span>
              </p>
            )}
            {!loading && filtered.length > 0 && (
              <ul className="divide-y divide-border/60">
                {filtered.map((f) => {
                  const cat = categoryFromFileType(f.file_type);
                  const active = selectedId === f.id;
                  return (
                    <li key={f.id}>
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => setSelectedId(f.id)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        setSelectedId(f.id);
                      }
                    }}
                    className={`flex cursor-pointer items-center gap-4 py-4 pr-2 transition-colors outline-none focus-visible:bg-muted/40 ${
                      active ? "bg-muted/30" : "hover:bg-muted/20"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={selectedIds.has(f.id)}
                      onChange={(e) => {
                        e.stopPropagation();
                        toggleRowSelected(f.id);
                      }}
                      onClick={(e) => e.stopPropagation()}
                      className="size-4 shrink-0 rounded border-border"
                      aria-label={`Select ${f.file_name}`}
                    />
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center text-muted-foreground">
                      <div className="scale-[0.65]">
                        <FileCategoryIcon category={cat} />
                      </div>
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline gap-2">
                        <span className="truncate text-[15px] font-medium text-foreground">
                          {f.file_name}
                        </span>
                        {f.is_favorite && (
                          <span className="shrink-0 text-amber-500" aria-hidden>
                            ★
                          </span>
                        )}
                      </div>
                      <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[12px] text-muted-foreground">
                        <span>{categoryLabel(cat)}</span>
                        <span aria-hidden>·</span>
                        <span>{statusLabel(f.status)}</span>
                        <span aria-hidden>·</span>
                        <time dateTime={f.created_at}>
                          {new Date(f.created_at).toLocaleDateString(undefined, {
                            month: "short",
                            day: "numeric",
                            year: "numeric",
                          })}
                        </time>
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-3">
                      <button
                        type="button"
                        onClick={(e) => void toggleFavorite(f, e)}
                        className="text-[12px] font-medium text-muted-foreground hover:text-foreground"
                      >
                        {f.is_favorite ? "Unfavorite" : "Favorite"}
                      </button>
                      <span className="text-muted-foreground/40" aria-hidden>
                        →
                      </span>
                    </div>
                  </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </>
        )}
      </section>

      {drawer}
    </div>
  );
}

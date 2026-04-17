"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";
import type { MediaCategory } from "@/lib/types";
import type { FileRow } from "@/lib/types/saas";
import { FileCategoryIcon, categoryLabel } from "@/components/ui/file-type-icon";
import { TranslationPanel } from "@/components/dashboard/translation-panel";

const TYPES = ["all", "document", "audio", "video", "image", "spreadsheet"] as const;

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

function statusStyles(status: string) {
  const s = status.toLowerCase();
  if (s === "completed")
    return "bg-emerald-500/12 text-emerald-800 ring-1 ring-emerald-500/25 dark:text-emerald-200";
  if (s === "failed")
    return "bg-red-500/12 text-red-800 ring-1 ring-red-500/20 dark:text-red-200";
  if (s === "processing")
    return "bg-sky-500/12 text-sky-900 ring-1 ring-sky-500/20 dark:text-sky-100";
  return "bg-amber-500/12 text-amber-950 ring-1 ring-amber-500/20 dark:text-amber-100";
}

export function FileBrowser() {
  const [files, setFiles] = useState<FileRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [type, setType] = useState<(typeof TYPES)[number]>("all");
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (type !== "all") params.set("type", type);
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
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
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
      <div className="fixed inset-0 z-[100] flex md:pl-0" role="presentation">
        <button
          type="button"
          className="absolute inset-0 bg-background/70 backdrop-blur-[2px] transition-opacity dark:bg-background/80"
          aria-label="Close panel"
          onClick={() => setSelectedId(null)}
        />
        <div
          className="relative ml-auto flex h-full w-full max-w-[min(100vw,26rem)] flex-col border-l border-border/80 bg-card shadow-[-12px_0_48px_-12px_rgba(0,0,0,0.18)] dark:shadow-[-12px_0_48px_-12px_rgba(0,0,0,0.45)] sm:max-w-md"
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
    <div className="space-y-8 pb-8">
      <div className="relative overflow-hidden rounded-3xl border border-border/60 bg-gradient-to-br from-card via-card to-muted/30 p-8 shadow-sm">
        <div className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full bg-foreground/[0.04] blur-3xl dark:bg-foreground/[0.07]" />
        <div className="relative">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            Workspace
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
            Your files
          </h1>
          <p className="mt-3 max-w-xl text-sm leading-relaxed text-muted-foreground sm:text-base">
            Upload anything you translate on the home flow — open a file from the list to
            process, edit translations, and export. The detail panel opens on the right.
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="relative min-w-0 flex-1 lg:max-w-md">
          <label htmlFor="q" className="sr-only">
            Search files
          </label>
          <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground">
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" aria-hidden>
              <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="1.5" />
              <path d="M16 16l4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </span>
          <input
            id="q"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search by file name…"
            className="w-full rounded-2xl border border-border/80 bg-background py-3 pl-11 pr-4 text-sm text-foreground shadow-sm outline-none ring-0 transition placeholder:text-muted-foreground focus:border-foreground/25 focus:ring-2 focus:ring-foreground/10"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-2xl border border-border/80 bg-background px-4 py-2.5 text-sm text-muted-foreground shadow-sm transition hover:bg-muted/60">
            <input
              type="checkbox"
              checked={favoritesOnly}
              onChange={(e) => setFavoritesOnly(e.target.checked)}
              className="rounded border-border text-foreground"
            />
            Favorites
          </label>
          <label className="inline-flex cursor-pointer items-center justify-center rounded-2xl bg-foreground px-5 py-2.5 text-sm font-semibold text-background shadow-md transition hover:opacity-90 disabled:opacity-50">
            <input
              type="file"
              className="hidden"
              disabled={uploading}
              onChange={(e) => void onUpload(e)}
            />
            {uploading ? "Uploading…" : "Upload file"}
          </label>
          <button
            type="button"
            onClick={() => void load()}
            className="rounded-2xl border border-border bg-background px-4 py-2.5 text-sm font-medium text-foreground shadow-sm transition hover:bg-muted"
          >
            Refresh
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {TYPES.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setType(t)}
            className={`rounded-full px-4 py-1.5 text-sm font-medium transition ${
              type === t
                ? "bg-foreground text-background shadow-sm"
                : "bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground"
            }`}
          >
            {t === "all" ? "All types" : categoryLabel(categoryFromFileType(t))}
          </button>
        ))}
      </div>

      <div className="space-y-2">
        {loading && (
          <div className="flex items-center gap-3 rounded-2xl border border-dashed border-border bg-muted/20 px-6 py-12 text-sm text-muted-foreground">
            <span className="inline-flex h-5 w-5 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-foreground" />
            Loading your files…
          </div>
        )}
        {!loading && filtered.length === 0 && (
          <div className="rounded-3xl border border-dashed border-border/80 bg-muted/20 px-6 py-16 text-center">
            <p className="text-base font-medium text-foreground">Nothing here yet</p>
            <p className="mx-auto mt-2 max-w-sm text-sm text-muted-foreground">
              Upload a document, audio, video, image, or spreadsheet — it will show up in
              this list. Click a row to open the side panel.
            </p>
          </div>
        )}
        {!loading &&
          filtered.map((f) => {
            const cat = categoryFromFileType(f.file_type);
            const active = selectedId === f.id;
            return (
              <div
                key={f.id}
                role="button"
                tabIndex={0}
                onClick={() => setSelectedId(f.id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setSelectedId(f.id);
                  }
                }}
                className={`group flex w-full cursor-pointer items-center gap-4 rounded-2xl border px-4 py-3.5 text-left transition outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-foreground/20 ${
                  active
                    ? "border-foreground/25 bg-muted/50 shadow-md ring-1 ring-foreground/10"
                    : "border-border/80 bg-card hover:border-foreground/20 hover:bg-muted/40 hover:shadow-sm"
                }`}
              >
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-muted/80 text-muted-foreground ring-1 ring-border/50 transition group-hover:bg-muted">
                  <div className="scale-90">
                    <FileCategoryIcon category={cat} />
                  </div>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate font-medium text-foreground">{f.file_name}</span>
                    {f.is_favorite && (
                      <span className="shrink-0 text-amber-500" title="Favorite">
                        ★
                      </span>
                    )}
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                    <span>{categoryLabel(cat)}</span>
                    <span className="text-border">·</span>
                    <span
                      className={`inline-flex rounded-md px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${statusStyles(f.status)}`}
                    >
                      {f.status}
                    </span>
                    <span className="text-border">·</span>
                    <time dateTime={f.created_at}>
                      {new Date(f.created_at).toLocaleDateString(undefined, {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })}
                    </time>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <button
                    type="button"
                    onClick={(e) => void toggleFavorite(f, e)}
                    className="rounded-xl border border-border/80 bg-background px-3 py-1.5 text-xs font-medium text-foreground opacity-80 transition hover:bg-muted hover:opacity-100"
                  >
                    {f.is_favorite ? "Unfavorite" : "Favorite"}
                  </button>
                  <span className="text-muted-foreground/50 transition group-hover:text-muted-foreground">
                    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" aria-hidden>
                      <path
                        d="M9 6l6 6-6 6"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </span>
                </div>
              </div>
            );
          })}
      </div>

      {drawer}
    </div>
  );
}

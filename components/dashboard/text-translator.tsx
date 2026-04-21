"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import type { DocumentPipelineTranslation } from "@/lib/ai";
import { COMMON_LANGUAGES } from "@/lib/languages";
import { Button } from "@/components/ui/button";

type TranslateResponse = {
  ok: boolean;
  id: string;
  detectedLanguage: string;
  translatedText: string;
};

type VersionRow = {
  id: string;
  version: number;
  created_at: string;
  translated_text: string;
};

type DocRow = {
  id: string;
  title: string;
  original_text: string;
  translated_text: string;
  detected_language: string | null;
  target_language: string;
  mode: string;
  created_at: string;
  updated_at: string;
};

const LAST_TEXT_DOC_KEY = "translation:last_text_doc_id";

export function TextTranslator() {
  const [title, setTitle] = useState("Text");
  const [originalText, setOriginalText] = useState("");
  const [editorText, setEditorText] = useState("");
  const [docId, setDocId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [detected, setDetected] = useState<string | null>(null);
  const [versions, setVersions] = useState<VersionRow[]>([]);
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(null);

  const [targetLanguage, setTargetLanguage] = useState<string>("English");
  const [customTarget, setCustomTarget] = useState<string>("");
  const [mode, setMode] = useState<
    NonNullable<DocumentPipelineTranslation["mode"]>
  >("standard");

  const abortRef = useRef<AbortController | null>(null);

  const effectiveTarget = useMemo(() => {
    return (targetLanguage === "__custom__"
      ? customTarget.trim()
      : targetLanguage.trim()) || "English";
  }, [customTarget, targetLanguage]);

  const canTranslate = originalText.trim().length > 0 && !busy;

  const loadDoc = useCallback(async (id: string) => {
    const res = await fetch(`/api/app/text/${id}`);
    if (!res.ok) throw new Error("Failed to load text document");
    const j = (await res.json()) as { doc: DocRow; versions: VersionRow[] };
    setDocId(j.doc.id);
    setTitle(j.doc.title ?? "Text");
    setOriginalText(j.doc.original_text ?? "");
    setEditorText(j.doc.translated_text ?? "");
    setDetected(j.doc.detected_language ?? null);
    setVersions(j.versions ?? []);
    setSelectedVersionId(null);
    try {
      localStorage.setItem(LAST_TEXT_DOC_KEY, j.doc.id);
    } catch {
      // ignore
    }
  }, []);

  const runTranslate = useCallback(async () => {
    if (!originalText.trim()) return;
    setBusy(true);
    setDetected(null);
    try {
      const controller = new AbortController();
      abortRef.current = controller;
      const translation: DocumentPipelineTranslation = {
        targetLanguage: effectiveTarget,
        mode,
      };
      const res = await fetch("/api/app/text/translate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim() || "Text",
          text: originalText,
          translation,
        }),
        signal: controller.signal,
      });
      const j = (await res.json()) as Partial<TranslateResponse> & { error?: string };
      if (!res.ok || !j.id || !j.translatedText) {
        throw new Error(j.error ?? "Translate failed");
      }
      setDocId(j.id);
      setDetected(j.detectedLanguage ?? null);
      setEditorText(j.translatedText);
      setVersions([]);
      setSelectedVersionId(null);
      try {
        localStorage.setItem(LAST_TEXT_DOC_KEY, j.id);
      } catch {
        // ignore
      }
      toast.success("Translated.");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Translate failed";
      if (msg !== "Canceled") toast.error(msg);
    } finally {
      abortRef.current = null;
      setBusy(false);
    }
  }, [effectiveTarget, mode, originalText, title]);

  useEffect(() => {
    // Persist across refresh: reload last text document, if any.
    if (docId) return;
    try {
      const last = localStorage.getItem(LAST_TEXT_DOC_KEY);
      if (last) void loadDoc(last);
    } catch {
      // ignore
    }
  }, [docId, loadDoc]);

  useEffect(() => {
    if (!docId) return;
    // Keep versions fresh while staying on the same doc
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(`/api/app/text/${docId}`);
        if (!res.ok) return;
        const j = (await res.json()) as { versions?: VersionRow[] };
        if (!cancelled) setVersions(j.versions ?? []);
      } catch {
        if (!cancelled) setVersions([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [docId]);

  const stop = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const saveVersion = useCallback(async () => {
    if (!docId) {
      toast.error("Translate first.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/app/text/${docId}/versions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ translated_text: editorText }),
      });
      const j = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok) throw new Error(j.error ?? "Save failed");
      toast.success("Version saved.");
      await loadDoc(docId);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }, [docId, editorText, loadDoc]);

  const selectedVersion = useMemo(() => {
    if (!selectedVersionId) return null;
    return versions.find((v) => v.id === selectedVersionId) ?? null;
  }, [selectedVersionId, versions]);

  const exportLinks = docId ? (
    <div className="flex flex-wrap gap-x-4 gap-y-2 text-[13px] font-medium">
      <a className="text-foreground underline-offset-4 hover:underline" href={`/api/app/text/${docId}/export?format=txt`}>
        TXT
      </a>
      <a className="text-foreground underline-offset-4 hover:underline" href={`/api/app/text/${docId}/export?format=pdf`}>
        PDF
      </a>
      <a className="text-foreground underline-offset-4 hover:underline" href={`/api/app/text/${docId}/export?format=docx`}>
        DOCX
      </a>
    </div>
  ) : (
    <p className="text-[13px] text-muted-foreground">Translate text to enable export.</p>
  );

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <section className="space-y-3">
        <header className="space-y-1">
          <h2 className="text-[18px] font-semibold tracking-tight text-foreground">
            Text
          </h2>
          <p className="text-[12px] leading-relaxed text-muted-foreground">
            Paste or type text and translate it. You can export and save versions.
          </p>
        </header>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="textTitle" className="mb-2 block text-[12px] font-medium text-muted-foreground">
              Title
            </label>
            <input
              id="textTitle"
              value={title}
              disabled={busy}
              onChange={(e) => setTitle(e.target.value)}
              className="h-10 w-full rounded-lg border border-border bg-background px-3 text-[14px] text-foreground"
            />
          </div>
          <div>
            <label htmlFor="textMode" className="mb-2 block text-[12px] font-medium text-muted-foreground">
              Style
            </label>
            <select
              id="textMode"
              value={mode}
              disabled={busy}
              onChange={(e) =>
                setMode(
                  e.target.value as NonNullable<DocumentPipelineTranslation["mode"]>,
                )
              }
              className="h-10 w-full rounded-lg border border-border bg-background px-3 text-[14px] text-foreground"
            >
              <option value="standard">Standard</option>
              <option value="formal">Formal</option>
              <option value="casual">Casual</option>
              <option value="technical">Technical</option>
              <option value="legal">Legal</option>
            </select>
          </div>
          <div className="sm:col-span-2">
            <label htmlFor="textTarget" className="mb-2 block text-[12px] font-medium text-muted-foreground">
              Target language
            </label>
            <select
              id="textTarget"
              value={targetLanguage}
              disabled={busy}
              onChange={(e) => setTargetLanguage(e.target.value)}
              className="h-10 w-full rounded-lg border border-border bg-background px-3 text-[14px] text-foreground"
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
                placeholder="Language name"
                className="mt-2 h-10 w-full rounded-lg border border-border bg-background px-3 text-[14px] text-foreground"
              />
            )}
          </div>
        </div>

        <div>
          <label htmlFor="textInput" className="mb-2 block text-[12px] font-medium text-muted-foreground">
            Original text
          </label>
          <textarea
            id="textInput"
            value={originalText}
            disabled={busy}
            onChange={(e) => setOriginalText(e.target.value)}
            rows={10}
            className="w-full resize-y rounded-lg border border-border bg-background p-3 text-[13px] leading-relaxed text-foreground"
            placeholder="Paste text here…"
          />
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Button type="button" size="sm" disabled={!canTranslate} onClick={() => void runTranslate()}>
            {busy ? "Working…" : "Translate"}
          </Button>
          {busy && (
            <Button type="button" size="sm" variant="secondary" onClick={stop}>
              Stop
            </Button>
          )}
          {detected && (
            <span className="text-[13px] text-muted-foreground">
              Detected: <span className="text-foreground">{detected}</span>
            </span>
          )}
        </div>

        <div className="space-y-2 border-t border-border/60 pt-4">
          <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Export
          </h3>
          {exportLinks}
        </div>

        <div className="space-y-2 border-t border-border/60 pt-4">
          <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            History
          </h3>
          {docId ? (
            <div className="space-y-3">
              {versions.length === 0 ? (
                <p className="text-[13px] text-muted-foreground">No saved versions yet.</p>
              ) : (
                <ul className="space-y-1 text-[13px]">
                  {versions.map((v) => (
                    <li key={v.id}>
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedVersionId(v.id);
                          setEditorText(v.translated_text);
                        }}
                        className={`text-left underline-offset-4 hover:underline ${
                          selectedVersionId === v.id
                            ? "text-foreground"
                            : "text-muted-foreground"
                        }`}
                      >
                        v{v.version} · {new Date(v.created_at).toLocaleString()}
                      </button>
                    </li>
                  ))}
                </ul>
              )}

              {selectedVersion ? (
                <div className="rounded-md border border-border/60 bg-muted/20 p-3">
                  <p className="text-[12px] font-medium text-muted-foreground">
                    Original
                  </p>
                  <pre className="mt-1 max-h-32 overflow-auto whitespace-pre-wrap text-[12px] leading-relaxed text-foreground">
                    {originalText.trim() || "—"}
                  </pre>
                  <p className="mt-3 text-[12px] font-medium text-muted-foreground">
                    Translation (v{selectedVersion.version})
                  </p>
                  <pre className="mt-1 max-h-32 overflow-auto whitespace-pre-wrap text-[12px] leading-relaxed text-foreground">
                    {selectedVersion.translated_text}
                  </pre>
                </div>
              ) : null}
            </div>
          ) : (
            <p className="text-[13px] text-muted-foreground">
              Translate and save versions to see history.
            </p>
          )}
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Editor
          </h3>
          <Button
            type="button"
            size="sm"
            disabled={busy || !docId}
            onClick={() => void saveVersion()}
          >
            Save version
          </Button>
        </div>
        <div className="min-h-0">
          <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Translation
          </h4>
          <div className="max-h-[min(60vh,620px)] overflow-auto rounded-md border border-border/40 bg-muted/20 p-1">
            <textarea
              value={editorText}
              onChange={(e) => setEditorText(e.target.value)}
              rows={18}
              className="min-h-[360px] w-full resize-none border-0 bg-transparent px-2 py-2 text-[13px] leading-relaxed outline-none"
              placeholder={docId ? "Edit translation…" : "Translate to start…"}
            />
          </div>
        </div>
      </section>
    </div>
  );
}


"use client";

import type { TranslateResponse } from "@/lib/types";

type TranslationResultProps = {
  result: TranslateResponse;
  targetLanguage?: string;
  onDownload: () => void;
};

export function TranslationResult({
  result,
  targetLanguage,
  onDownload,
}: TranslationResultProps) {
  return (
    <div className="mt-10 w-full space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium uppercase tracking-wide text-neutral-500">
            Detected language
          </span>
          <span className="inline-flex items-center rounded-full bg-neutral-100 px-3 py-1 text-sm font-medium text-neutral-800">
            {result.detectedLanguage}
          </span>
          <span className="text-xs text-neutral-400">
            {(result.confidence * 100).toFixed(0)}% confidence
          </span>
        </div>
        <button
          type="button"
          onClick={onDownload}
          className="rounded-xl bg-neutral-900 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-neutral-800 active:scale-[0.98]"
        >
          Download .txt
        </button>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 lg:gap-6">
        <div className="rounded-2xl bg-white/80 p-5 shadow-[0_8px_30px_rgb(0,0,0,0.06)] ring-1 ring-black/5 transition hover:shadow-[0_12px_40px_rgb(0,0,0,0.08)]">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-500 mb-3">
            Original
          </h3>
          <pre className="whitespace-pre-wrap break-words text-sm leading-relaxed text-neutral-800 font-sans max-h-[min(50vh,28rem)] overflow-y-auto">
            {result.originalText}
          </pre>
        </div>
        <div className="rounded-2xl bg-white/80 p-5 shadow-[0_8px_30px_rgb(0,0,0,0.06)] ring-1 ring-black/5 transition hover:shadow-[0_12px_40px_rgb(0,0,0,0.08)]">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-500 mb-3">
            {targetLanguage?.trim() || "Translation"}
          </h3>
          <pre className="whitespace-pre-wrap break-words text-sm leading-relaxed text-neutral-800 font-sans max-h-[min(50vh,28rem)] overflow-y-auto">
            {result.translatedText}
          </pre>
        </div>
      </div>
    </div>
  );
}

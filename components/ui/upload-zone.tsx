"use client";

import { useCallback, useRef, useState } from "react";
import type { MediaCategory } from "@/lib/types";
import { CLIENT_ACCEPT_ATTR } from "@/lib/validation";
import { categoryLabel, FileCategoryIcon } from "./file-type-icon";

type UploadZoneProps = {
  file: File | null;
  category: MediaCategory | null;
  disabled: boolean;
  onFile: (file: File | null) => void;
};

export function UploadZone({ file, category, disabled, onFile }: UploadZoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  const handleFiles = useCallback(
    (list: FileList | null) => {
      const f = list?.[0];
      if (f) onFile(f);
    },
    [onFile],
  );

  return (
    <div
      className={`
        relative rounded-2xl border-2 border-dashed transition-all duration-300
        ${dragOver ? "border-foreground/30 bg-muted/80" : "border-border bg-card/60"}
        ${disabled ? "opacity-60 pointer-events-none" : "hover:border-border hover:bg-card/90"}
      `}
      onDragOver={(e) => {
        e.preventDefault();
        if (!disabled) setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        if (!disabled) handleFiles(e.dataTransfer.files);
      }}
    >
      <input
        ref={inputRef}
        type="file"
        accept={CLIENT_ACCEPT_ATTR}
        className="sr-only"
        disabled={disabled}
        onChange={(e) => handleFiles(e.target.files)}
      />
      <button
        type="button"
        disabled={disabled}
        onClick={() => inputRef.current?.click()}
        className="w-full py-12 px-6 text-center rounded-2xl focus:outline-none focus-visible:ring-2 focus-visible:ring-foreground/25 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      >
        <p className="text-sm font-medium text-foreground">
          Drop a file here or click to browse
        </p>
        <p className="mt-2 text-xs text-muted-foreground">
          Documents, audio, video, images, Excel, CSV — max 10MB
        </p>
        {file && category && (
          <div className="mt-5 flex flex-col items-center gap-2">
            <FileCategoryIcon category={category} />
            <span className="inline-flex items-center rounded-full bg-muted px-3 py-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {categoryLabel(category)}
            </span>
            <p className="text-sm font-medium truncate max-w-full px-2 text-foreground">
              {file.name}
            </p>
          </div>
        )}
        {file && !category && (
          <p className="mt-4 text-sm font-medium truncate max-w-full px-2 text-foreground">
            {file.name}
          </p>
        )}
      </button>
    </div>
  );
}

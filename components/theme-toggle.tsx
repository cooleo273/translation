"use client";

import { useTheme } from "next-themes";
import { useEffect, useState } from "react";

export function ThemeToggle({ className = "" }: { className?: string }) {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <span
        className={`inline-flex h-9 w-9 items-center justify-center rounded-xl border border-border bg-card ${className}`}
        aria-hidden
      />
    );
  }

  const dark = resolvedTheme === "dark";

  return (
    <button
      type="button"
      onClick={() => setTheme(dark ? "light" : "dark")}
      className={`inline-flex h-9 w-9 items-center justify-center rounded-xl border border-border bg-card text-foreground shadow-sm transition hover:bg-muted/50 ${className}`}
      title={dark ? "Light mode" : "Dark mode"}
      aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
    >
      {dark ? (
        <span className="text-lg leading-none">☀️</span>
      ) : (
        <span className="text-lg leading-none">🌙</span>
      )}
    </button>
  );
}

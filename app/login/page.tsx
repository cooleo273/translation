"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { ThemeToggle } from "@/components/theme-toggle";
import { getSupabaseBrowser } from "@/lib/supabase/client";

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const supabase = getSupabaseBrowser();
  const err = params.get("error");
  const errMsg =
    err === "config"
      ? "Server configuration error."
      : err === "auth"
        ? "Sign-in failed. Try again."
        : null;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!supabase) {
      toast.error("Supabase is not configured.");
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    const next = params.get("next") || "/dashboard";
    router.push(next.startsWith("/") ? next : "/dashboard");
    router.refresh();
  }

  async function google() {
    if (!supabase) {
      toast.error("Supabase is not configured.");
      return;
    }
    const next = params.get("next") || "/dashboard";
    const safeNext = next.startsWith("/") ? next : "/dashboard";
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(safeNext)}`,
      },
    });
    if (error) toast.error(error.message);
  }

  if (!supabase) {
    return (
      <div className="mx-auto max-w-md rounded-2xl border border-border bg-card p-8 text-center shadow-sm">
        <p className="text-sm text-muted-foreground">
          Add{" "}
          <code className="rounded bg-muted px-1 py-0.5 text-foreground">
            NEXT_PUBLIC_SUPABASE_URL
          </code>{" "}
          and{" "}
          <code className="rounded bg-muted px-1 py-0.5 text-foreground">
            NEXT_PUBLIC_SUPABASE_ANON_KEY
          </code>{" "}
          to your environment to enable sign-in.
        </p>
        <Link
          href="/"
          className="mt-6 inline-block text-sm font-medium text-foreground underline underline-offset-4"
        >
          Back to home
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-md rounded-2xl border border-border bg-card p-8 shadow-sm">
      <h1 className="text-center text-2xl font-semibold tracking-tight text-foreground">
        Sign in
      </h1>
      <p className="mt-2 text-center text-sm text-muted-foreground">
        Use your account to access the dashboard.
      </p>
      {errMsg && (
        <p className="mt-4 rounded-xl bg-red-500/10 px-3 py-2 text-center text-sm text-red-700 dark:text-red-300">
          {errMsg}
        </p>
      )}
      <form onSubmit={onSubmit} className="mt-8 space-y-4">
        <div>
          <label htmlFor="email" className="block text-xs font-medium text-muted-foreground">
            Email
          </label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground outline-none ring-offset-background focus:ring-2 focus:ring-foreground/20"
          />
        </div>
        <div>
          <label htmlFor="password" className="block text-xs font-medium text-muted-foreground">
            Password
          </label>
          <input
            id="password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground outline-none ring-offset-background focus:ring-2 focus:ring-foreground/20"
          />
        </div>
        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-2xl bg-foreground py-3 text-sm font-semibold text-background transition enabled:hover:opacity-90 disabled:opacity-50"
        >
          {loading ? "Signing in…" : "Sign in"}
        </button>
      </form>
      <div className="relative my-8">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-border" />
        </div>
        <div className="relative flex justify-center text-xs uppercase tracking-wide">
          <span className="bg-card px-2 text-muted-foreground">Or</span>
        </div>
      </div>
      <button
        type="button"
        onClick={google}
        className="w-full rounded-2xl border border-border bg-background py-3 text-sm font-medium text-foreground transition hover:bg-muted"
      >
        Continue with Google
      </button>
      <p className="mt-8 text-center text-sm text-muted-foreground">
        No account?{" "}
        <Link href="/signup" className="font-medium text-foreground underline underline-offset-4">
          Create one
        </Link>
      </p>
    </div>
  );
}

export default function LoginPage() {
  return (
    <div className="min-h-screen bg-background px-4 py-10">
      <div className="mx-auto mb-8 flex max-w-5xl items-center justify-end">
        <ThemeToggle />
      </div>
      <Suspense
        fallback={
          <div className="text-center text-sm text-muted-foreground">Loading…</div>
        }
      >
        <LoginForm />
      </Suspense>
    </div>
  );
}

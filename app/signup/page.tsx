"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { ThemeToggle } from "@/components/theme-toggle";
import { getSupabaseBrowser } from "@/lib/supabase/client";

export default function SignupPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);

  const supabase = getSupabaseBrowser();

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!supabase) {
      toast.error("Supabase is not configured.");
      return;
    }
    if (password !== confirm) {
      toast.error("Passwords do not match.");
      return;
    }
    if (password.length < 8) {
      toast.error("Use at least 8 characters for your password.");
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback?next=/dashboard`,
      },
    });
    setLoading(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Check your email to confirm your account, or sign in if already confirmed.");
    router.push("/login");
    router.refresh();
  }

  async function google() {
    if (!supabase) {
      toast.error("Supabase is not configured.");
      return;
    }
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback?next=/dashboard`,
      },
    });
    if (error) toast.error(error.message);
  }

  if (!supabase) {
    return (
      <div className="min-h-screen bg-background px-4 py-10">
        <div className="mx-auto mb-8 flex max-w-5xl items-center justify-end">
          <ThemeToggle />
        </div>
        <div className="mx-auto max-w-md rounded-2xl border border-border bg-card p-8 text-center shadow-sm">
          <p className="text-sm text-muted-foreground">
            Configure NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY to enable
            sign-up.
          </p>
          <Link
            href="/"
            className="mt-6 inline-block text-sm font-medium text-foreground underline underline-offset-4"
          >
            Back to home
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background px-4 py-10">
      <div className="mx-auto mb-8 flex max-w-5xl items-center justify-end">
        <ThemeToggle />
      </div>
      <div className="mx-auto w-full max-w-md rounded-2xl border border-border bg-card p-8 shadow-sm">
        <h1 className="text-center text-2xl font-semibold tracking-tight text-foreground">
          Create account
        </h1>
        <p className="mt-2 text-center text-sm text-muted-foreground">
          Save files, track usage, and manage translations in the cloud.
        </p>
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
              autoComplete="new-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground outline-none ring-offset-background focus:ring-2 focus:ring-foreground/20"
            />
          </div>
          <div>
            <label
              htmlFor="confirm"
              className="block text-xs font-medium text-muted-foreground"
            >
              Confirm password
            </label>
            <input
              id="confirm"
              type="password"
              autoComplete="new-password"
              required
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground outline-none ring-offset-background focus:ring-2 focus:ring-foreground/20"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-2xl bg-foreground py-3 text-sm font-semibold text-background transition enabled:hover:opacity-90 disabled:opacity-50"
          >
            {loading ? "Creating…" : "Sign up"}
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
          Already have an account?{" "}
          <Link href="/login" className="font-medium text-foreground underline underline-offset-4">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}

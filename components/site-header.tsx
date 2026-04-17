"use client";

import type { AuthChangeEvent, Session } from "@supabase/supabase-js";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { getSupabaseBrowser } from "@/lib/supabase/client";
import { ThemeToggle } from "@/components/theme-toggle";

export function SiteHeader() {
  const pathname = usePathname();
  const [session, setSession] = useState<boolean | null>(null);
  const configured = getSupabaseBrowser() !== null;

  useEffect(() => {
    const sb = getSupabaseBrowser();
    if (!sb) {
      setSession(false);
      return;
    }
    void (async () => {
      const { data } = await sb.auth.getSession();
      setSession(!!data.session);
    })();
    const { data: sub } = sb.auth.onAuthStateChange(
      (_event: AuthChangeEvent, sess: Session | null) => {
        setSession(!!sess);
      },
    );
    return () => sub.subscription.unsubscribe();
  }, [pathname]);

  return (
    <header className="sticky top-0 z-40 flex items-center justify-between border-b border-border bg-card/85 px-4 py-3 backdrop-blur-md sm:px-6">
      <Link
        href="/"
        className="text-sm font-semibold tracking-tight text-foreground sm:text-base"
      >
        Translate
      </Link>
      <div className="flex items-center gap-1 sm:gap-2">
        <ThemeToggle />
        {pathname !== "/" && session && (
          <Link
            href="/translate"
            className="rounded-xl px-3 py-2 text-sm font-medium text-muted-foreground transition hover:bg-muted hover:text-foreground"
          >
            Translate
          </Link>
        )}
        <Link
          href="/pricing"
          className="rounded-xl px-3 py-2 text-sm font-medium text-muted-foreground transition hover:bg-muted hover:text-foreground"
        >
          Pricing
        </Link>
        {configured && (
          <>
            {session ? (
              <Link
                href="/dashboard"
                className="rounded-xl px-3 py-2 text-sm font-medium text-foreground transition hover:bg-muted"
              >
                Dashboard
              </Link>
            ) : (
              <>
                <Link
                  href="/login"
                  className="rounded-xl px-3 py-2 text-sm font-medium text-muted-foreground transition hover:text-foreground"
                >
                  Sign in
                </Link>
                <Link
                  href="/signup"
                  className="rounded-xl bg-foreground px-3 py-2 text-sm font-semibold text-background transition hover:opacity-90 sm:px-4"
                >
                  Sign up
                </Link>
              </>
            )}
          </>
        )}
      </div>
    </header>
  );
}

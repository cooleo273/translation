"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { toast } from "sonner";
import { ThemeToggle } from "@/components/theme-toggle";
import { getSupabaseBrowser } from "@/lib/supabase/client";

const nav = [
  { href: "/dashboard", label: "Files", desc: "Upload & translate" },
  { href: "/dashboard/billing", label: "Billing", desc: "Usage & plans" },
  { href: "/dashboard/settings", label: "Account", desc: "Profile & security" },
];

export function DashboardSidebar() {
  const pathname = usePathname();
  const router = useRouter();

  async function signOut() {
    const sb = getSupabaseBrowser();
    if (!sb) {
      toast.error("Not configured.");
      return;
    }
    await sb.auth.signOut();
    router.push("/");
    router.refresh();
  }

  return (
    <aside
      className="flex w-full shrink-0 flex-row items-center justify-between gap-2 border-b border-border/80 bg-card/90 px-4 py-3 backdrop-blur-md md:h-[100dvh] md:w-[260px] md:flex-col md:items-stretch md:justify-between md:border-b-0 md:border-r md:py-8"
    >
      <div className="flex min-h-0 min-w-0 flex-1 flex-col md:flex-1 md:overflow-y-auto">
        <Link
          href="/"
          className="mb-1 hidden text-lg font-semibold tracking-tight text-foreground md:mb-8 md:block"
        >
          Translate
        </Link>
        <nav className="flex gap-1 overflow-x-auto pb-0 md:flex-col md:gap-1 md:overflow-visible md:pb-0">
          {nav.map((item) => {
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`group shrink-0 rounded-2xl px-3 py-2.5 transition md:px-4 ${
                  active
                    ? "bg-foreground text-background shadow-sm"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                }`}
              >
                <span className="block text-sm font-semibold">{item.label}</span>
                <span
                  className={`mt-0.5 hidden text-xs md:block ${
                    active ? "text-background/80" : "text-muted-foreground/80 group-hover:text-foreground/80"
                  }`}
                >
                  {item.desc}
                </span>
              </Link>
            );
          })}
        </nav>
      </div>
      <div className="flex shrink-0 items-center gap-2 md:flex-col md:items-stretch md:border-t md:border-border/60 md:pt-6">
        <div className="flex justify-end md:justify-start">
          <ThemeToggle />
        </div>
        <button
          type="button"
          onClick={() => void signOut()}
          className="rounded-xl px-3 py-2 text-sm font-medium text-muted-foreground transition hover:bg-muted hover:text-foreground md:text-left"
        >
          Sign out
        </button>
      </div>
    </aside>
  );
}

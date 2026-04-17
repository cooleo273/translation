"use client";

import { useEffect, useState } from "react";
import { getSupabaseBrowser } from "@/lib/supabase/client";

export default function DashboardSettingsPage() {
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    const sb = getSupabaseBrowser();
    if (!sb) return;
    void (async () => {
      const { data } = await sb.auth.getUser();
      setEmail(data.user?.email ?? null);
    })();
  }, []);

  return (
    <div className="space-y-2">
      <h1 className="text-2xl font-semibold tracking-tight text-foreground">Account</h1>
      <p className="text-sm text-muted-foreground">
        Signed in as{" "}
        <span className="font-medium text-foreground">{email ?? "…"}</span>
      </p>
      <p className="pt-4 text-sm text-muted-foreground">
        Profile and billing preferences can extend this screen later. Usage is tracked in
        Supabase <code className="rounded bg-muted px-1">usage_stats</code>.
      </p>
    </div>
  );
}

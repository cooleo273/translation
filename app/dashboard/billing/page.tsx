"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type Summary = {
  plan: string;
  subscription: Record<string, unknown> | null;
  limits: {
    maxFileMB: number;
    maxFilesPerDay: number | null;
    filesToday: number;
    allowVideo: boolean;
    allowApiKeys: boolean;
  };
  aggregates: {
    words_translated?: number | string;
    files_processed?: number;
    audio_seconds_processed?: number;
  } | null;
  chart: { date: string; words: number; minutes: number }[];
};

type ApiKey = {
  id: string;
  key_prefix: string;
  name: string | null;
  created_at: string;
};

export default function BillingPage() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [sRes, kRes] = await Promise.all([
        fetch("/api/app/billing/summary"),
        fetch("/api/app/api-keys"),
      ]);
      if (!sRes.ok) throw new Error("Could not load billing data.");
      const s = (await sRes.json()) as Summary;
      setSummary(s);
      if (kRes.ok) {
        const k = (await kRes.json()) as { keys: ApiKey[] };
        setKeys(k.keys ?? []);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Load failed");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function checkout(plan: "pro" | "business") {
    const res = await fetch("/api/payments/initiate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ plan }),
    });
    const j = (await res.json()) as { url?: string; error?: string };
    if (!res.ok || !j.url) {
      toast.error(j.error ?? "Checkout failed");
      return;
    }
    window.location.href = j.url;
  }

  async function openPortal() {
    const res = await fetch("/api/app/billing/portal", { method: "POST" });
    const j = (await res.json()) as { url?: string; error?: string };
    if (!res.ok || !j.url) {
      toast.error(j.error ?? "Portal unavailable");
      return;
    }
    window.location.href = j.url;
  }

  async function createApiKey() {
    const res = await fetch("/api/app/api-keys", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "default" }),
    });
    const j = (await res.json()) as { key?: string; error?: string; message?: string };
    if (!res.ok) {
      toast.error(j.error ?? "Could not create key");
      return;
    }
    if (j.key) {
      await navigator.clipboard.writeText(j.key);
      toast.success(j.message ?? "Key copied to clipboard.");
    }
    void load();
  }

  async function revokeKey(id: string) {
    const res = await fetch(`/api/app/api-keys/${id}`, { method: "DELETE" });
    if (!res.ok) {
      toast.error("Could not revoke");
      return;
    }
    toast.success("Key revoked.");
    void load();
  }

  if (loading || !summary) {
    return (
      <div className="p-6 text-sm text-muted-foreground">Loading billing…</div>
    );
  }

  const wordsTotal = Number(summary.aggregates?.words_translated ?? 0);
  const filesProc = Number(summary.aggregates?.files_processed ?? 0);
  const audioMin = Math.round(
    (Number(summary.aggregates?.audio_seconds_processed ?? 0) / 60) * 10,
  ) / 10;

  const dailyCap = summary.limits.maxFilesPerDay;
  const remaining =
    dailyCap === null ? null : Math.max(0, dailyCap - summary.limits.filesToday);

  return (
    <div className="space-y-10 p-4 sm:p-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Billing</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Plan, usage, and API keys (Business).
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-2xl border border-border bg-card p-4">
          <p className="text-xs font-medium uppercase text-muted-foreground">
            Current plan
          </p>
          <p className="mt-2 text-2xl font-semibold capitalize">{summary.plan}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Status:{" "}
            {(summary.subscription?.status as string) ?? "—"}
            {summary.subscription?.end_date
              ? ` · Renews / ends ${String(summary.subscription.end_date).slice(0, 10)}`
              : ""}
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void checkout("pro")}
              className="rounded-xl bg-foreground px-3 py-2 text-xs font-semibold text-background"
            >
              Upgrade Pro
            </button>
            <button
              type="button"
              onClick={() => void checkout("business")}
              className="rounded-xl border border-border px-3 py-2 text-xs font-semibold"
            >
              Upgrade Business
            </button>
            <button
              type="button"
              onClick={() => void openPortal()}
              className="rounded-xl border border-border px-3 py-2 text-xs font-semibold"
            >
              Manage subscription
            </button>
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-card p-4">
          <p className="text-xs font-medium uppercase text-muted-foreground">
            Quota (today)
          </p>
          <p className="mt-2 text-2xl font-semibold">
            {summary.limits.filesToday}
            {dailyCap !== null ? ` / ${dailyCap}` : ""} files
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {remaining !== null
              ? `${remaining} uploads remaining today (UTC).`
              : "Unlimited daily uploads."}
          </p>
          <p className="mt-2 text-xs text-muted-foreground">
            Max file size: {summary.limits.maxFileMB}MB · Video:{" "}
            {summary.limits.allowVideo ? "yes" : "no (upgrade)"}
          </p>
        </div>

        <div className="rounded-2xl border border-border bg-card p-4">
          <p className="text-xs font-medium uppercase text-muted-foreground">
            All-time (dashboard)
          </p>
          <p className="mt-2 text-sm text-foreground">
            Words translated:{" "}
            <span className="font-semibold">{wordsTotal.toLocaleString()}</span>
          </p>
          <p className="mt-1 text-sm text-foreground">
            Files processed:{" "}
            <span className="font-semibold">{filesProc.toLocaleString()}</span>
          </p>
          <p className="mt-1 text-sm text-foreground">
            Audio processed:{" "}
            <span className="font-semibold">{audioMin} min</span> (est.)
          </p>
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-card p-4">
        <h2 className="text-sm font-semibold text-foreground">
          Last 14 days (usage logs)
        </h2>
        <div className="mt-4 h-64 w-full min-w-0">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={summary.chart}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              <XAxis dataKey="date" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} />
              <Tooltip
                contentStyle={{
                  background: "hsl(var(--card))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: "8px",
                }}
              />
              <Bar dataKey="words" name="Words" fill="hsl(142 76% 36%)" radius={[4, 4, 0, 0]} />
              <Bar
                dataKey="minutes"
                name="Minutes (AV)"
                fill="hsl(221 83% 53%)"
                radius={[4, 4, 0, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {summary.limits.allowApiKeys ? (
        <div className="rounded-2xl border border-border bg-card p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold">API keys</h2>
            <button
              type="button"
              onClick={() => void createApiKey()}
              className="rounded-xl bg-foreground px-3 py-2 text-xs font-semibold text-background"
            >
              Create key
            </button>
          </div>
          <ul className="mt-4 space-y-2 text-sm">
            {keys.length === 0 && (
              <li className="text-muted-foreground">No keys yet.</li>
            )}
            {keys.map((k) => (
              <li
                key={k.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border px-3 py-2"
              >
                <span>
                  <code className="text-xs">{k.key_prefix}…</code>{" "}
                  <span className="text-muted-foreground">
                    {k.name ?? "unnamed"}
                  </span>
                </span>
                <button
                  type="button"
                  className="text-xs text-red-600 dark:text-red-400"
                  onClick={() => void revokeKey(k.id)}
                >
                  Revoke
                </button>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-muted-foreground">
            Use{" "}
            <code className="rounded bg-muted px-1">Authorization: Bearer trl_…</code>{" "}
            on <code className="rounded bg-muted px-1">/api/v1/*</code>.
          </p>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          API keys are included with the Business plan.{" "}
          <Link href="/pricing" className="underline">
            View pricing
          </Link>
        </p>
      )}
    </div>
  );
}

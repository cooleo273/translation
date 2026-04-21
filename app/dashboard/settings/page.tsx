"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { getSupabaseBrowser } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type GlossaryRow = {
  id: string;
  source_term: string;
  target_term: string;
  created_at: string;
};

type WebhookRow = {
  id: string;
  url: string;
  events: string[];
  created_at: string;
};

export default function DashboardSettingsPage() {
  const [email, setEmail] = useState<string | null>(null);
  const [terms, setTerms] = useState<GlossaryRow[]>([]);
  const [webhooks, setWebhooks] = useState<WebhookRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [src, setSrc] = useState("");
  const [tgt, setTgt] = useState("");
  const [whUrl, setWhUrl] = useState("");
  const [whSecret, setWhSecret] = useState("");

  const loadGlossary = useCallback(async () => {
    const res = await fetch("/api/app/glossary");
    if (!res.ok) return;
    const j = (await res.json()) as { terms: GlossaryRow[] };
    setTerms(j.terms ?? []);
  }, []);

  const loadWebhooks = useCallback(async () => {
    const res = await fetch("/api/app/webhooks");
    if (!res.ok) return;
    const j = (await res.json()) as { webhooks: WebhookRow[] };
    setWebhooks(j.webhooks ?? []);
  }, []);

  useEffect(() => {
    const sb = getSupabaseBrowser();
    if (!sb) return;
    void (async () => {
      const { data } = await sb.auth.getUser();
      setEmail(data.user?.email ?? null);
    })();
  }, []);

  useEffect(() => {
    void (async () => {
      setLoading(true);
      await Promise.all([loadGlossary(), loadWebhooks()]);
      setLoading(false);
    })();
  }, [loadGlossary, loadWebhooks]);

  async function addTerm(e: React.FormEvent) {
    e.preventDefault();
    if (!src.trim() || !tgt.trim()) return;
    const res = await fetch("/api/app/glossary", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        source_term: src.trim(),
        target_term: tgt.trim(),
      }),
    });
    const j = (await res.json()) as { error?: string };
    if (!res.ok) {
      toast.error(j.error ?? "Could not save.");
      return;
    }
    toast.success("Term saved.");
    setSrc("");
    setTgt("");
    await loadGlossary();
  }

  async function removeTerm(id: string) {
    const res = await fetch(`/api/app/glossary/${id}`, { method: "DELETE" });
    if (!res.ok) {
      toast.error("Could not delete.");
      return;
    }
    await loadGlossary();
  }

  async function addWebhook(e: React.FormEvent) {
    e.preventDefault();
    if (!whUrl.trim()) return;
    const res = await fetch("/api/app/webhooks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        url: whUrl.trim(),
        secret: whSecret.trim() || undefined,
      }),
    });
    const j = (await res.json()) as { error?: string };
    if (!res.ok) {
      toast.error(j.error ?? "Could not create webhook.");
      return;
    }
    toast.success("Webhook added.");
    setWhUrl("");
    setWhSecret("");
    await loadWebhooks();
  }

  async function removeWebhook(id: string) {
    const res = await fetch(`/api/app/webhooks/${id}`, { method: "DELETE" });
    if (!res.ok) {
      toast.error("Could not delete.");
      return;
    }
    await loadWebhooks();
  }

  return (
    <div className="mx-auto max-w-2xl space-y-12">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Settings</h1>
        <p className="text-sm text-muted-foreground">
          Signed in as{" "}
          <span className="font-medium text-foreground">{email ?? "…"}</span>
        </p>
      </div>

      <section className="space-y-4 border-b border-border/60 pb-10">
        <h2 className="text-[15px] font-semibold text-foreground">Glossary</h2>
        <p className="text-sm leading-relaxed text-muted-foreground">
          Preferred source → target terms are added to translation prompts for consistency across
          files. Empty glossary has no effect.
        </p>
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : (
          <ul className="space-y-2">
            {terms.map((t) => (
              <li
                key={t.id}
                className="flex items-center justify-between gap-3 rounded-lg border border-border/60 px-3 py-2 text-[13px]"
              >
                <span className="min-w-0">
                  <span className="font-medium text-foreground">{t.source_term}</span>
                  <span className="text-muted-foreground"> → </span>
                  <span className="text-foreground">{t.target_term}</span>
                </span>
                <button
                  type="button"
                  className="shrink-0 text-[12px] text-muted-foreground hover:text-destructive"
                  onClick={() => void removeTerm(t.id)}
                >
                  Remove
                </button>
              </li>
            ))}
            {terms.length === 0 && (
              <p className="text-[13px] text-muted-foreground">No terms yet.</p>
            )}
          </ul>
        )}
        <form onSubmit={(e) => void addTerm(e)} className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-[12px] font-medium text-muted-foreground">
              Source term
            </label>
            <Input value={src} onChange={(e) => setSrc(e.target.value)} placeholder="Brand X" />
          </div>
          <div>
            <label className="mb-1 block text-[12px] font-medium text-muted-foreground">
              Target term
            </label>
            <Input value={tgt} onChange={(e) => setTgt(e.target.value)} placeholder="Marque X" />
          </div>
          <div className="sm:col-span-2">
            <Button type="submit" size="sm" disabled={!src.trim() || !tgt.trim()}>
              Add term
            </Button>
          </div>
        </form>
      </section>

      <section className="space-y-4 pb-10">
        <h2 className="text-[15px] font-semibold text-foreground">Webhooks</h2>
        <p className="text-sm leading-relaxed text-muted-foreground">
          Receive <code className="rounded bg-muted px-1">job.completed</code> and{" "}
          <code className="rounded bg-muted px-1">job.failed</code> when background jobs finish
          (Business workflows). Payload is JSON; when a secret is set,{" "}
          <code className="rounded bg-muted px-1">X-Webhook-Signature: sha256=…</code> is an HMAC of
          the body.
        </p>
        <ul className="space-y-2">
          {webhooks.map((w) => (
            <li
              key={w.id}
              className="flex items-start justify-between gap-3 rounded-lg border border-border/60 px-3 py-2 text-[13px]"
            >
              <div className="min-w-0 break-all">
                <div className="font-medium text-foreground">{w.url}</div>
                <div className="text-[12px] text-muted-foreground">
                  {(w.events ?? []).join(", ")}
                </div>
              </div>
              <button
                type="button"
                className="shrink-0 text-[12px] text-muted-foreground hover:text-destructive"
                onClick={() => void removeWebhook(w.id)}
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
        <form onSubmit={(e) => void addWebhook(e)} className="space-y-3">
          <div>
            <label className="mb-1 block text-[12px] font-medium text-muted-foreground">
              Endpoint URL
            </label>
            <Input
              type="url"
              value={whUrl}
              onChange={(e) => setWhUrl(e.target.value)}
              placeholder="https://example.com/hooks/translation"
            />
          </div>
          <div>
            <label className="mb-1 block text-[12px] font-medium text-muted-foreground">
              Secret (optional)
            </label>
            <Input
              type="password"
              value={whSecret}
              onChange={(e) => setWhSecret(e.target.value)}
              placeholder="for HMAC verification"
              autoComplete="new-password"
            />
          </div>
          <Button type="submit" size="sm" disabled={!whUrl.trim()}>
            Add webhook
          </Button>
        </form>
      </section>
    </div>
  );
}

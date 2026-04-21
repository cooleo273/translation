/**
 * Minimal TypeScript client for Translation SaaS HTTP API (v1, API key auth).
 * Point `baseUrl` at your deployment origin (e.g. https://app.example.com).
 *
 * Usage:
 * ```ts
 * import { createSaasClient } from "./sdk/typescript";
 * const client = createSaasClient({
 *   baseUrl: process.env.TRANSLATION_API_URL!,
 *   apiKey: process.env.TRANSLATION_API_KEY!,
 * });
 * const { text } = await client.translate({ text: "Hello", targetLanguage: "Spanish" });
 * ```
 */

export type SaasClientConfig = {
  baseUrl: string;
  apiKey: string;
  fetchImpl?: typeof fetch;
};

function joinUrl(base: string, path: string): string {
  return `${base.replace(/\/$/, "")}${path.startsWith("/") ? path : `/${path}`}`;
}

async function apiJson<T>(
  cfg: SaasClientConfig,
  path: string,
  init: RequestInit,
): Promise<T> {
  const f = cfg.fetchImpl ?? fetch;
  const res = await f(joinUrl(cfg.baseUrl, path), {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${cfg.apiKey}`,
      ...init.headers,
    },
  });
  const j = (await res.json()) as T & { error?: string };
  if (!res.ok) {
    throw new Error(
      typeof (j as { error?: string }).error === "string"
        ? (j as { error: string }).error
        : `HTTP ${res.status}`,
    );
  }
  return j;
}

export function createSaasClient(cfg: SaasClientConfig) {
  return {
    async translate(body: { text: string; targetLanguage?: string }) {
      return apiJson<{ translatedText?: string; detectedLanguage?: string }>(
        cfg,
        "/api/v1/translate",
        { method: "POST", body: JSON.stringify(body) },
      );
    },
    async transcribe(body: { audio: string; mimeType?: string }) {
      return apiJson<Record<string, unknown>>(cfg, "/api/v1/transcribe", {
        method: "POST",
        body: JSON.stringify(body),
      });
    },
    async ocr(body: { image: string; mimeType?: string }) {
      return apiJson<Record<string, unknown>>(cfg, "/api/v1/ocr", {
        method: "POST",
        body: JSON.stringify(body),
      });
    },
  };
}

export type SaasClient = ReturnType<typeof createSaasClient>;

/**
 * Minimal structured logging for workers and API routes (stdout JSON).
 * Wire to Sentry/Datadog later by forwarding these lines or replacing this module.
 */

export type LogLevel = "debug" | "info" | "warn" | "error";

export type AppLogFields = {
  event: string;
  level?: LogLevel;
  userId?: string;
  fileId?: string;
  jobId?: string;
  durationMs?: number;
  error?: string;
  [key: string]: unknown;
};

export function logAppEvent(fields: AppLogFields): void {
  const level = fields.level ?? "info";
  const line = JSON.stringify({
    ts: new Date().toISOString(),
    service: "translation-saas",
    ...fields,
    level,
  });
  if (level === "error") {
    console.error(line);
  } else if (level === "warn") {
    console.warn(line);
  } else {
    console.log(line);
  }
}

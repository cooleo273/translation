import type { DocumentPipelineTranslation } from "./ai";
import type { ProcessPayload, ProcessStreamEvent } from "./process-types";

function parseErrorMessage(errText: string): string {
  let message = "Processing failed.";
  try {
    const j = JSON.parse(errText) as { error?: string };
    if (j.error) message = j.error;
  } catch {
    if (errText) message = errText;
  }
  return message;
}

function isCanceledSignal(signal?: AbortSignal) {
  return !!signal?.aborted;
}

function parseNdjsonEvents(
  raw: string,
  onEvent: (event: ProcessStreamEvent) => void,
): { rest: string; completed?: ProcessPayload } {
  const lines = raw.split("\n");
  const rest = lines.pop() ?? "";
  let completed: ProcessPayload | undefined;
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    let ev: ProcessStreamEvent;
    try {
      ev = JSON.parse(trimmed) as ProcessStreamEvent;
    } catch {
      continue;
    }
    onEvent(ev);
    if (ev.step === "error") {
      throw new Error(ev.message ?? "Processing failed.");
    }
    if (ev.step === "completed" && ev.payload) {
      completed = ev.payload;
    }
  }
  return { rest, completed };
}

export async function processUploadStream(
  uploadId: string,
  onEvent: (event: ProcessStreamEvent) => void,
  translation?: DocumentPipelineTranslation,
  signal?: AbortSignal,
): Promise<ProcessPayload> {
  let res: Response;
  try {
    res = await fetch("/api/process", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ uploadId, translation }),
      signal,
    });
  } catch (e) {
    if (signal?.aborted) {
      throw new Error("Canceled");
    }
    throw e;
  }

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(parseErrorMessage(errText));
  }

  const reader = res.body?.getReader();
  if (!reader) {
    throw new Error("No response body from server.");
  }

  const decoder = new TextDecoder();
  let backlog = "";
  let completed: ProcessPayload | undefined;

  try {
    while (true) {
      const { done, value } = await reader.read();
      backlog += decoder.decode(value, { stream: !done });
      const parsed = parseNdjsonEvents(backlog, onEvent);
      backlog = parsed.rest;
      if (parsed.completed) completed = parsed.completed;

      if (done) break;
    }
  } catch (e) {
    if (isCanceledSignal(signal)) {
      throw new Error("Canceled");
    }
    throw e;
  }

  if (!completed) {
    throw new Error("Stream ended without a result.");
  }

  return completed;
}

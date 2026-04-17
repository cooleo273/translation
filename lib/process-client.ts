import type { DocumentPipelineTranslation } from "./ai";
import type { ProcessPayload, ProcessStreamEvent } from "./process-types";

export async function processUploadStream(
  uploadId: string,
  onEvent: (event: ProcessStreamEvent) => void,
  translation?: DocumentPipelineTranslation,
): Promise<ProcessPayload> {
  const res = await fetch("/api/process", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ uploadId, translation }),
  });

  if (!res.ok) {
    const errText = await res.text();
    let message = "Processing failed.";
    try {
      const j = JSON.parse(errText) as { error?: string };
      if (j.error) message = j.error;
    } catch {
      if (errText) message = errText;
    }
    throw new Error(message);
  }

  const reader = res.body?.getReader();
  if (!reader) {
    throw new Error("No response body from server.");
  }

  const decoder = new TextDecoder();
  let backlog = "";
  let completed: ProcessPayload | undefined;

  while (true) {
    const { done, value } = await reader.read();
    backlog += decoder.decode(value, { stream: !done });
    const lines = backlog.split("\n");
    backlog = lines.pop() ?? "";

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

    if (done) break;
  }

  if (!completed) {
    throw new Error("Stream ended without a result.");
  }

  return completed;
}

/**
 * Maps SDK / network errors into short messages suitable for toasts and JSON `error` fields.
 */
export function formatUserFacingError(err: unknown): string {
  const raw =
    err instanceof Error
      ? err.message
      : typeof err === "string"
        ? err
        : "Something went wrong. Please try again.";

  const lower = raw.toLowerCase();

  if (
    lower.includes("429") ||
    lower.includes("too many requests") ||
    lower.includes("quota exceeded") ||
    lower.includes("rate limit") ||
    lower.includes("resource_exhausted") ||
    lower.includes("rate-limit") ||
    /free_tier|free tier.*requests|generate_content_free_tier/i.test(raw)
  ) {
    return "The AI service is temporarily busy (rate limit). Wait about a minute and try again.";
  }

  if (/googlegenerativeai|generativelanguage\.googleapis\.com/i.test(raw)) {
    if (/recitation|blocked due to|safety|prohibited content|blocked/i.test(lower)) {
      return "The AI could not process this content due to content policies. Try a different clip or file.";
    }
    return "The AI service returned an error. Please try again in a moment.";
  }

  if (raw.length > 220) {
    return "Processing failed. Please try again, or use a smaller file.";
  }

  return raw;
}

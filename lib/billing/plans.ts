import type { MediaCategory } from "@/lib/types";

export type PlanId = "free" | "pro" | "business";

export const GLOBAL_APP_MAX_BYTES = 100 * 1024 * 1024;

export type PlanLimits = {
  maxFileBytes: number;
  /** Max files uploaded/processed per UTC day; null = unlimited */
  maxFilesPerDay: number | null;
  allowVideo: boolean;
  allowApiKeys: boolean;
  /** Use background queue for video / large files */
  priorityProcessing: boolean;
};

export function limitsForPlan(plan: PlanId): PlanLimits {
  switch (plan) {
    case "free":
      return {
        maxFileBytes: 10 * 1024 * 1024,
        maxFilesPerDay: 5,
        allowVideo: false,
        allowApiKeys: false,
        priorityProcessing: false,
      };
    case "pro":
      return {
        maxFileBytes: 100 * 1024 * 1024,
        maxFilesPerDay: 100,
        allowVideo: true,
        allowApiKeys: false,
        priorityProcessing: false,
      };
    case "business":
      return {
        maxFileBytes: 100 * 1024 * 1024,
        maxFilesPerDay: null,
        allowVideo: true,
        allowApiKeys: true,
        priorityProcessing: true,
      };
    default:
      return limitsForPlan("free");
  }
}

export function effectivePlanFromRow(
  planName: string | null | undefined,
  status: string | null | undefined,
): PlanId {
  if (status && status !== "active" && status !== "trialing") {
    return "free";
  }
  const p = (planName ?? "free").toLowerCase();
  if (p === "pro" || p === "business" || p === "free") {
    return p;
  }
  return "free";
}

export function categoryViolatesVideoBlock(
  plan: PlanId,
  category: MediaCategory,
): boolean {
  if (category !== "video") return false;
  const { allowVideo } = limitsForPlan(plan);
  return !allowVideo;
}

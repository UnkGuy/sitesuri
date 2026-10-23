export type SuitabilityLevel = "high" | "moderate" | "low" | "unavailable";

export function getSuitabilityLevel(
  score: number | null | undefined,
): SuitabilityLevel {
  if (score == null || !Number.isFinite(score)) {
    return "unavailable";
  }

  if (score >= 75) return "high";
  if (score >= 50) return "moderate";

  return "low";
}

export const SUITABILITY_STYLES = {
  high: {
    label: "High suitability",
    text: "text-green-700",
    background: "bg-green-100",
    bar: "bg-green-600",
    marker: "#16A34A",
  },

  moderate: {
    label: "Moderate suitability",
    text: "text-amber-700",
    background: "bg-amber-100",
    bar: "bg-amber-500",
    marker: "#F59E0B",
  },

  low: {
    label: "Low suitability",
    text: "text-red-700",
    background: "bg-red-100",
    bar: "bg-red-600",
    marker: "#DC2626",
  },

  unavailable: {
    label: "Score unavailable",
    text: "text-gray-600",
    background: "bg-gray-100",
    bar: "bg-gray-400",
    marker: "#9CA3AF",
  },
} as const;

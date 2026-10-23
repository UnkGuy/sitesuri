import type {
  BusinessType,
  CandidateLocation,
} from "@/features/analyses/analysis-service";
import { getSuitabilityLevel } from "@/features/analyses/suitability";

/** Matches the objects produced by DashboardClient's rankedCandidates mapping. */
export interface RankedCandidate {
  location: CandidateLocation;
  distance: number; // meters from the exploration center
  score: number | null;
  isLoading: boolean;
  isError: boolean;
}

export const BUSINESS_TYPES: readonly BusinessType[] = [
  "food stall",
  "sari-sari store",
  "general retail",
];

export const BUSINESS_LABELS: Record<BusinessType, string> = {
  "food stall": "Food stall",
  "sari-sari store": "Sari-sari store",
  "general retail": "General retail",
};

export const BAND_COLORS = {
  high: "#16A34A",
  moderate: "#F59E0B",
  low: "#DC2626",
  unavailable: "#94A3B8",
} as const;

export function hasScore(
  candidate: RankedCandidate,
): candidate is RankedCandidate & { score: number } {
  return (
    typeof candidate.score === "number" && Number.isFinite(candidate.score)
  );
}

export function sortedScoredCandidates(candidates: RankedCandidate[]) {
  return candidates
    .filter(hasScore)
    .sort((a, b) => b.score - a.score || a.distance - b.distance);
}

export function displayLocation(location: CandidateLocation) {
  return (
    location.address ||
    location.source_location_id ||
    `Site ${location.location_id.slice(0, 8)}`
  );
}

export function shortLocation(location: CandidateLocation) {
  const label = displayLocation(location).split(",")[0];
  return label.length > 24 ? `${label.slice(0, 22)}…` : label;
}

export function summarizeCandidates(candidates: RankedCandidate[]) {
  const scored = candidates.filter(hasScore);
  const total = scored.reduce((sum, item) => sum + item.score, 0);
  const values = scored.map((item) => item.score).sort((a, b) => a - b);
  const mid = Math.floor(values.length / 2);
  const median =
    values.length === 0
      ? null
      : values.length % 2 === 0
        ? (values[mid - 1] + values[mid]) / 2
        : values[mid];

  const bands = { high: 0, moderate: 0, low: 0 };
  for (const item of scored) {
    const level = getSuitabilityLevel(item.score);
    if (level !== "unavailable") bands[level] += 1;
  }

  return {
    total: candidates.length,
    scored: scored.length,
    pending: candidates.filter((item) => item.isLoading).length,
    failed: candidates.filter((item) => item.isError).length,
    unavailable: candidates.filter(
      (item) => !item.isLoading && !item.isError && !hasScore(item),
    ).length,
    average: scored.length ? total / scored.length : null,
    median,
    highest: values.length ? values[values.length - 1] : null,
    bands,
  };
}

export function formatScore(score: number | null) {
  return score === null ? "N/A" : `${score.toFixed(1)}/100`;
}

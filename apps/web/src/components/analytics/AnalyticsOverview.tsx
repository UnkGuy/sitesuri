"use client";

import { useMemo } from "react";
import type { AxiosInstance } from "axios";
import { useQueries } from "@tanstack/react-query";
import type {
  BusinessType,
  CandidateLocation,
  LocationScore,
} from "@/features/analyses/analysis-service";
import { getLocationScores } from "@/features/analyses/analysis-service";
import {
  BUSINESS_LABELS,
  BUSINESS_TYPES,
  displayLocation,
  sortedScoredCandidates,
  summarizeCandidates,
  type RankedCandidate,
} from "@/features/analyses/analytics-utils";
import AnalyticsKPIs from "./AnalyticsKPIs";
import ScoreDistribution from "./ScoreDistribution";
import CandidateRanking from "./CandidateRanking";
import DistanceSuitability from "./DistanceSuitability";
import CategoryComparison from "./CategoryComparison";
import ComponentBreakdown from "./ComponentBreakdown";

interface AnalyticsOverviewProps {
  api: AxiosInstance;
  candidates: RankedCandidate[];
  category: BusinessType;
  radius: number;
  selectedLocationId?: string | null;
  onCategoryChange: (category: BusinessType) => void;
  onSelectLocation: (location: CandidateLocation) => void;
}

export default function AnalyticsOverview({
  api,
  candidates,
  category,
  radius,
  selectedLocationId,
  onCategoryChange,
  onSelectLocation,
}: AnalyticsOverviewProps) {
  const summary = useMemo(() => summarizeCandidates(candidates), [candidates]);
  const scored = useMemo(() => sortedScoredCandidates(candidates), [candidates]);
  // Prefer the user's selection if it's still within the active area; otherwise show the top scorer.
  const selected = candidates.find((item) => item.location.location_id === selectedLocationId)?.location
    ?? scored[0]?.location
    ?? candidates[0]?.location
    ?? null;
  const selectedId = selected?.location_id ?? "";

  // Read-only score queries; do not create /analyses records for chart rendering.
  // Query keys match the Explorer's cache keys (location + business type).
  const categoryQueries = useQueries({
    queries: BUSINESS_TYPES.map((businessType) => ({
      queryKey: ["sitesuri", "location-scores", selectedId, businessType],
      queryFn: () => getLocationScores(api, selectedId, businessType),
      enabled: Boolean(selectedId),
      retry: false,
      staleTime: 5 * 60 * 1000,
    })),
  });

  const scores: Partial<Record<BusinessType, LocationScore>> = {};
  BUSINESS_TYPES.forEach((businessType, index) => {
    const result = categoryQueries[index]?.data?.find((item) => item.business_type === businessType);
    if (result) scores[businessType] = result;
  });

  const currentScore = scores[category] ?? null;
  const categoryPending = Boolean(selectedId) && categoryQueries.some((query) => query.isPending);
  const categoryErrors = categoryQueries.filter((query) => query.isError).length;
  const currentPending = Boolean(selectedId) && (categoryQueries[BUSINESS_TYPES.indexOf(category)]?.isPending ?? false);

  return (
    <div className="mx-auto max-w-[1600px] space-y-6 p-5 lg:p-9">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-extrabold uppercase tracking-[0.14em] text-brand-green">Geographic research</p>
          <h1 className="font-display mt-2 text-3xl font-extrabold tracking-[-0.04em] sm:text-4xl">Area analytics</h1>
          <p className="mt-2 text-sm text-[#66736B]">Suitability patterns across candidate sites within your selected search area.</p>
        </div>
        <label className="text-xs font-bold text-[#4E5B52]">
          Business category
          <select
            value={category}
            onChange={(event) => onCategoryChange(event.target.value as BusinessType)}
            className="mt-2 block w-full min-w-[200px] rounded-xl border border-[#DDE4DC] bg-white px-3 py-3 text-sm text-[#141414]"
          >
            {BUSINESS_TYPES.map((item) => <option key={item} value={item}>{BUSINESS_LABELS[item]}</option>)}
          </select>
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-xl border border-[#E5EAE4] bg-white px-4 py-3 text-xs text-[#5A6A5E]">
        <span><strong>Radius:</strong> {radius.toLocaleString()} m</span>
        <span><strong>Scored:</strong> {summary.scored} of {summary.total}</span>
        {summary.pending > 0 && <span>Loading: {summary.pending}</span>}
        {summary.failed > 0 && <span className="text-red-700">Failed: {summary.failed}</span>}
        <span><strong>Category:</strong> {BUSINESS_LABELS[category]}</span>
      </div>

      <AnalyticsKPIs candidates={candidates} />

      <div className="grid gap-5 xl:grid-cols-2">
        <ScoreDistribution candidates={candidates} />
        <DistanceSuitability candidates={candidates} />
      </div>

      <div className="grid items-start gap-5 xl:grid-cols-2">
        <CandidateRanking
          candidates={candidates}
          selectedLocationId={selected?.location_id}
          onSelectLocation={onSelectLocation}
        />
        <div className="space-y-5">
          <CategoryComparison
            scores={scores}
            pending={categoryPending}
            errors={categoryErrors}
            locationName={selected ? displayLocation(selected) : null}
          />
          <ComponentBreakdown
            score={currentScore}
            pending={currentPending}
            locationName={selected ? displayLocation(selected) : null}
          />
        </div>
      </div>

      <p className="rounded-xl border border-[#F1DEA6] bg-[#FFF9E5] p-4 text-xs leading-5 text-[#685721]">
        These suitability scores are from SiteSuri's synthetic, precomputed prototype data.
        They are not observed pedestrian counts, measured demand, real-time conditions,
        or predictions of business revenue. Summary statistics exclude scores that are
        missing or failed to load; the chosen radius filters candidate locations rather
        than recomputing the model score.
      </p>
    </div>
  );
}

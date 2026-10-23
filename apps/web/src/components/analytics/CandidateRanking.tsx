"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { CandidateLocation } from "@/features/analyses/analysis-service";
import type { RankedCandidate } from "@/features/analyses/analytics-utils";
import {
  BAND_COLORS,
  displayLocation,
  formatScore,
  shortLocation,
  sortedScoredCandidates,
} from "@/features/analyses/analytics-utils";
import { getSuitabilityLevel } from "@/features/analyses/suitability";

interface Props {
  candidates: RankedCandidate[];
  selectedLocationId?: string | null;
  onSelectLocation: (location: CandidateLocation) => void;
}

export default function CandidateRanking({ candidates, selectedLocationId, onSelectLocation }: Props) {
  const top = sortedScoredCandidates(candidates).slice(0, 10);
  const data = [...top].reverse().map((item) => ({
    label: shortLocation(item.location),
    score: item.score,
    color: BAND_COLORS[getSuitabilityLevel(item.score)],
  }));

  return (
    <section className="rounded-2xl border border-[#E5EAE4] bg-white p-5 shadow-sm" aria-labelledby="ranking-heading">
      <h2 id="ranking-heading" className="text-lg font-extrabold">Top candidate locations</h2>
      <p className="mt-1 text-xs text-[#66736B]">Ranked by suitability, not by distance.</p>
      {top.length === 0 ? (
        <p className="mt-8 text-sm text-[#66736B]">No scored locations within this area.</p>
      ) : (
        <>
          <div className="mt-4 h-[345px] min-w-0">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data} layout="vertical" margin={{ top: 4, right: 15, left: 6, bottom: 4 }}>
                <CartesianGrid stroke="#EEF1EC" horizontal={false} />
                <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 11 }} />
                <YAxis type="category" dataKey="label" width={125} tick={{ fontSize: 10 }} />
                <Tooltip formatter={(value) => [`${Number(value).toFixed(1)}/100`, "Suitability"]} />
                <Bar dataKey="score" radius={[0, 6, 6, 0]} isAnimationActive={false}>
                  {data.map((item, index) => <Cell key={`${item.label}-${index}`} fill={item.color} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-4 space-y-2" aria-label="Select a candidate for details">
            {top.map((item, index) => {
              const selected = selectedLocationId === item.location.location_id;
              return (
                <button
                  key={item.location.location_id}
                  type="button"
                  onClick={() => onSelectLocation(item.location)}
                  aria-pressed={selected}
                  className={`flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition hover:border-[#157F4C] ${selected ? "border-[#157F4C] bg-[#F1F8F0]" : "border-[#E7EBE5]"}`}
                >
                  <span className="w-6 shrink-0 text-xs font-extrabold text-[#68766B]">{index + 1}.</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">{displayLocation(item.location)}</span>
                    <span className="text-xs text-[#7A877E]">{Math.round(item.distance).toLocaleString()} m from center</span>
                  </span>
                  <span className="shrink-0 text-sm font-extrabold" style={{ color: BAND_COLORS[getSuitabilityLevel(item.score)] }}>
                    {formatScore(item.score)}
                  </span>
                </button>
              );
            })}
          </div>
        </>
      )}
    </section>
  );
}

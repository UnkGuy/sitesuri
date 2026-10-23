"use client";

import {
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { RankedCandidate } from "@/features/analyses/analytics-utils";
import {
  BAND_COLORS,
  shortLocation,
  sortedScoredCandidates,
} from "@/features/analyses/analytics-utils";
import { getSuitabilityLevel } from "@/features/analyses/suitability";

export default function DistanceSuitability({
  candidates,
}: {
  candidates: RankedCandidate[];
}) {
  const points = sortedScoredCandidates(candidates).map((candidate) => ({
    id: candidate.location.location_id,
    name: shortLocation(candidate.location),
    distance: Math.round(candidate.distance),
    score: candidate.score,
    fill: BAND_COLORS[getSuitabilityLevel(candidate.score)],
  }));

  return (
    <section className="rounded-2xl border border-[#E5EAE4] bg-white p-5 shadow-sm" aria-labelledby="distance-heading">
      <h2 id="distance-heading" className="text-lg font-extrabold">Distance vs. suitability</h2>
      <p className="mt-1 text-xs text-[#66736B]">Each dot represents a scored candidate.</p>
      {points.length === 0 ? (
        <p className="mt-8 text-sm text-[#66736B]">No scores available to plot yet.</p>
      ) : (
        <div className="mt-4 h-[310px] min-w-0">
          <ResponsiveContainer width="100%" height="100%">
            <ScatterChart margin={{ top: 12, right: 14, bottom: 22, left: -13 }}>
              <CartesianGrid stroke="#EEF1EC" strokeDasharray="3 3" />
              <XAxis type="number" dataKey="distance" name="Distance" unit="m" tick={{ fontSize: 11 }} label={{ value: "Distance from center (m)", position: "insideBottom", offset: -15, fontSize: 11 }} />
              <YAxis type="number" dataKey="score" name="Suitability" domain={[0, 100]} tick={{ fontSize: 11 }} />
              <Tooltip cursor={{ strokeDasharray: "4 4" }} />
              <Scatter data={points} name="Candidate" isAnimationActive={false}>
                {points.map((item) => <Cell key={item.id} fill={item.fill} />)}
              </Scatter>
            </ScatterChart>
          </ResponsiveContainer>
        </div>
      )}
      <p className="mt-3 text-xs text-[#7A877E]">Geographic distance is not a travel-time estimate or a model-scoring component by itself.</p>
    </section>
  );
}

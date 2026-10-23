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
import type { RankedCandidate } from "@/features/analyses/analytics-utils";
import {
  BAND_COLORS,
  summarizeCandidates,
} from "@/features/analyses/analytics-utils";

export default function ScoreDistribution({
  candidates,
}: {
  candidates: RankedCandidate[];
}) {
  const stats = summarizeCandidates(candidates);
  const data = [
    { band: "Low (0–49.9)", count: stats.bands.low, color: BAND_COLORS.low },
    { band: "Moderate (50–74.9)", count: stats.bands.moderate, color: BAND_COLORS.moderate },
    { band: "High (75–100)", count: stats.bands.high, color: BAND_COLORS.high },
  ];

  return (
    <section className="rounded-2xl border border-[#E5EAE4] bg-white p-5 shadow-sm" aria-labelledby="distribution-heading">
      <h2 id="distribution-heading" className="text-lg font-extrabold">Suitability distribution</h2>
      <p className="mt-1 text-xs text-[#66736B]">How the scored candidates fall into presentation bands.</p>
      {stats.scored === 0 ? (
        <p className="mt-8 text-sm text-[#66736B]">No scores available to plot yet.</p>
      ) : (
        <div className="mt-4 h-[270px] min-w-0">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 10, right: 8, left: -20, bottom: 20 }}>
              <CartesianGrid stroke="#EEF1EC" vertical={false} />
              <XAxis dataKey="band" tick={{ fontSize: 10 }} interval={0} angle={-8} textAnchor="end" height={47} />
              <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
              <Tooltip formatter={(value) => [`${value}`, "Candidates"]} />
              <Bar dataKey="count" name="Candidates" radius={[7, 7, 0, 0]} isAnimationActive={false}>
                {data.map((item) => <Cell key={item.band} fill={item.color} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
      <p className="mt-3 text-xs text-[#7A877E]">
        {stats.scored} scored of {stats.total} nearby candidates. Thresholds are visual categories, not validated probabilities.
      </p>
    </section>
  );
}

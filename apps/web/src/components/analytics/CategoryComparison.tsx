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
import type { BusinessType, LocationScore } from "@/features/analyses/analysis-service";
import {
  BAND_COLORS,
  BUSINESS_LABELS,
  BUSINESS_TYPES,
} from "@/features/analyses/analytics-utils";
import { getSuitabilityLevel } from "@/features/analyses/suitability";

interface CategoryComparisonProps {
  scores: Partial<Record<BusinessType, LocationScore>>;
  pending: boolean;
  errors: number;
  locationName: string | null;
}

export default function CategoryComparison({ scores, pending, errors, locationName }: CategoryComparisonProps) {
  const data = BUSINESS_TYPES.map((category) => {
    const raw = scores[category]?.location_score;
    const value = typeof raw === "number" && Number.isFinite(raw) ? raw : null;
    return {
      category: BUSINESS_LABELS[category],
      score: value,
      color: BAND_COLORS[getSuitabilityLevel(value)],
    };
  });

  return (
    <section className="rounded-2xl border border-[#E5EAE4] bg-white p-5 shadow-sm" aria-labelledby="category-comparison-heading">
      <h2 id="category-comparison-heading" className="text-lg font-extrabold">Business category comparison</h2>
      <p className="mt-1 text-xs leading-5 text-[#66736B]">
        {locationName ? `Comparing three business types at ${locationName}.` : "Select a candidate to compare its categories."}
      </p>
      {!locationName ? (
        <p className="mt-8 text-sm text-[#66736B]">No candidate selected.</p>
      ) : (
        <>
          {pending && <p className="mt-3 text-xs text-[#66736B]">Loading category scores…</p>}
          {errors > 0 && <p role="status" className="mt-3 text-xs text-red-700">{errors} category request(s) failed. Unavailable scores are not treated as zero.</p>}
          <div className="mt-3 h-[250px] min-w-0">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data} margin={{ top: 10, right: 5, left: -18, bottom: 18 }}>
                <CartesianGrid stroke="#EEF1EC" vertical={false} />
                <XAxis dataKey="category" interval={0} tick={{ fontSize: 10 }} height={35} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} />
                <Tooltip formatter={(value) => [`${Number(value).toFixed(1)}/100`, "Suitability"]} />
                <Bar dataKey="score" name="Suitability" radius={[6, 6, 0, 0]} isAnimationActive={false}>
                  {data.map((item) => <Cell key={item.category} fill={item.color} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-2 grid gap-2 sm:grid-cols-3">
            {data.map((item) => (
              <div key={item.category} className="rounded-xl bg-[#F6F8F3] p-3">
                <p className="text-xs font-semibold text-[#66736B]">{item.category}</p>
                <p className="mt-1 text-lg font-extrabold" style={{ color: item.color }}>
                  {item.score === null ? "N/A" : `${item.score.toFixed(1)}/100`}
                </p>
              </div>
            ))}
          </div>
        </>
      )}
    </section>
  );
}

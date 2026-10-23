"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { LocationScore } from "@/features/analyses/analysis-service";

interface ComponentBreakdownProps {
  score: LocationScore | null;
  pending: boolean;
  locationName: string | null;
}

export default function ComponentBreakdown({ score, pending, locationName }: ComponentBreakdownProps) {
  const components = score?.components ?? [];
  const plotted = components
    .filter((item) => item.score !== null && Number.isFinite(item.score))
    .map((item) => ({ name: item.name, score: item.score as number }));

  return (
    <section className="rounded-2xl border border-[#E5EAE4] bg-white p-5 shadow-sm" aria-labelledby="breakdown-heading">
      <h2 id="breakdown-heading" className="text-lg font-extrabold">Suitability component breakdown</h2>
      <p className="mt-1 text-xs leading-5 text-[#66736B]">
        {locationName ?? "No candidate selected"}{score ? ` · ${score.business_type}` : ""}
      </p>

      {!score ? (
        <p className="mt-8 text-sm text-[#66736B]">
          {pending ? "Loading the selected candidate's score…" : "Select a scored candidate to inspect its factors."}
        </p>
      ) : (
        <>
          <div className="mt-4 flex items-center gap-3 rounded-xl bg-[#F6F8F3] p-4">
            <span className="text-3xl font-extrabold">{score.location_score.toFixed(1)}</span>
            <div>
              <p className="text-sm font-bold">Overall suitability /100</p>
              <p className="text-xs text-[#66736B]">Precomputed synthetic prototype score</p>
            </div>
          </div>
          {plotted.length ? (
            <div className="mt-4 h-[290px] min-w-0">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={plotted} layout="vertical" margin={{ top: 6, right: 10, left: 15, bottom: 8 }}>
                  <CartesianGrid stroke="#EEF1EC" horizontal={false} />
                  <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 11 }} />
                  <YAxis type="category" dataKey="name" width={108} tick={{ fontSize: 10 }} />
                  <Tooltip formatter={(value) => [`${Number(value).toFixed(1)}/100`, "Component"]} />
                  <Bar dataKey="score" fill="#16835B" radius={[0, 6, 6, 0]} isAnimationActive={false} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <p className="mt-4 text-sm text-[#66736B]">No numeric component scores are available.</p>
          )}
          {components.length > 0 && (
            <div className="mt-4 space-y-2">
              {components.map((component, index) => (
                <div key={`${component.name}-${index}`} className="flex items-center justify-between gap-3 border-b border-[#EDF0EB] pb-2 text-xs">
                  <span className="font-semibold">{component.name}</span>
                  <span className="text-right text-[#66736B]">
                    {component.score === null ? "N/A" : `${component.score.toFixed(1)}/100`}
                    {typeof component.weight === "number" ? ` · weight ${(component.weight * 100).toFixed(0)}%` : ""}
                  </span>
                </div>
              ))}
            </div>
          )}
          {score.weakest_component && (
            <p className="mt-4 text-sm text-[#485A4D]"><strong>Weakest factor:</strong> {score.weakest_component}</p>
          )}
          {score.flags?.length > 0 && (
            <div className="mt-4 rounded-xl bg-[#FFF8E6] p-3">
              <p className="text-xs font-bold text-[#896311]">Model considerations</p>
              <ul className="mt-2 list-inside list-disc space-y-1 text-xs text-[#735B27]">
                {score.flags.map((flag, index) => <li key={`${flag}-${index}`}>{flag}</li>)}
              </ul>
            </div>
          )}
          {score.caps_applied?.length > 0 && (
            <p className="mt-3 text-xs text-[#8B5E12]">Applied caps: {score.caps_applied.join(", ")}</p>
          )}
        </>
      )}
    </section>
  );
}

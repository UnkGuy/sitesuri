"use client";

import {
  BarChart3,
  CheckCircle2,
  MapPinned,
  Trophy,
} from "lucide-react";
import type { RankedCandidate } from "@/features/analyses/analytics-utils";
import {
  formatScore,
  summarizeCandidates,
} from "@/features/analyses/analytics-utils";

export default function AnalyticsKPIs({
  candidates,
}: {
  candidates: RankedCandidate[];
}) {
  const summary = summarizeCandidates(candidates);
  const kpis = [
    { label: "Candidates in radius", value: String(summary.total), icon: MapPinned },
    { label: "Scored candidates", value: `${summary.scored}/${summary.total}`, icon: CheckCircle2 },
    { label: "Average suitability", value: formatScore(summary.average), icon: BarChart3 },
    { label: "Highest suitability", value: formatScore(summary.highest), icon: Trophy },
  ];

  return (
    <section aria-label="Area analytics key figures" className="grid gap-4 sm:grid-cols-2 2xl:grid-cols-4">
      {kpis.map(({ label, value, icon: Icon }) => (
        <div key={label} className="rounded-2xl border border-[#E5EAE4] bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs font-semibold text-[#66736B]">{label}</p>
            <span className="grid size-9 place-items-center rounded-xl bg-[#EDF5EB] text-[#157F4C]">
              <Icon size={18} aria-hidden="true" />
            </span>
          </div>
          <p className="mt-4 text-2xl font-extrabold tracking-tight text-[#171717]">{value}</p>
        </div>
      ))}
    </section>
  );
}

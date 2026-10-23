"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer,
  Tooltip, XAxis, YAxis,
} from "recharts";
import { useClerkApi } from "@/lib/api/client";
import type { BusinessType } from "@/features/analyses/analysis-service";
import {
  BUSINESS_LABELS, BAND_COLORS,
} from "@/features/analyses/analytics-utils";
import { getSuitabilityLevel } from "@/features/analyses/suitability";
import { getSavedComparison } from "@/features/saved-locations/saved-location-service";

const CATEGORIES = ["food stall", "sari-sari store", "general retail"] as const;
const SERIES = ["food stall", "sari-sari store", "general retail"] as const;
const PALETTE: Record<BusinessType,string> = {
  "food stall": "#15803D", "sari-sari store": "#B45309", "general retail": "#2563EB",
};

type Props = { savedIds?: string[]; initialCategory: BusinessType };
export default function SavedLocationsAnalytics({ savedIds, initialCategory }: Props) {
  const api = useClerkApi();
  const [category, setCategory] = useState<BusinessType>(initialCategory);
  const idsKey = (savedIds ?? []).join(",");
  const query = useQuery({
    queryKey: ["sitesuri", "saved-comparison", idsKey],
    queryFn: () => getSavedComparison(api, savedIds),
    staleTime: 60_000,
  });
  const rows = query.data ?? [];
  const chartData = useMemo(() => rows.map((row, i) => {
    const scoreMap = Object.fromEntries(row.scores.map((score) => [score.business_type, score.location_score]));
    return {
      label: row.source_location_id ?? `Site ${i+1}`,
      name: row.address ?? row.source_location_id ?? `Candidate ${i+1}`,
      locationId: row.location_id,
      "food stall": scoreMap["food stall"] ?? null,
      "sari-sari store": scoreMap["sari-sari store"] ?? null,
      "general retail": scoreMap["general retail"] ?? null,
    };
  }), [rows]);
  const ranked = useMemo(() => [...chartData].sort((a,b) => {
    const left = a[category]; const right = b[category];
    return (right ?? -1) - (left ?? -1);
  }), [chartData,category]);
  const scored = ranked.filter((entry) => entry[category] !== null);
  const average = scored.length ? scored.reduce((sum, entry) => sum + Number(entry[category]), 0) / scored.length : null;
  const best = scored.length ? Number(scored[0][category]) : null;
  return (
    <div className="mx-auto max-w-[1600px] space-y-6 p-5 lg:p-9">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-extrabold uppercase tracking-widest text-brand-green">Personal analytics</p>
          <h1 className="font-display mt-2 text-3xl font-extrabold">My locations analytics</h1>
          <p className="mt-2 text-sm text-[#66736B]">Compare your bookmarked candidates across all three supported business types.</p>
        </div>
        <label className="text-xs font-bold text-[#4E5B52]">Ranking category
          <select value={category} onChange={(e) => setCategory(e.target.value as BusinessType)}
            className="mt-2 block min-w-[200px] rounded-xl border border-[#DDE4DC] bg-white px-3 py-3 text-sm">
            {CATEGORIES.map((c) => <option key={c} value={c}>{BUSINESS_LABELS[c]}</option>)}
          </select>
        </label>
      </div>
      {query.isPending && <p role="status" className="text-sm text-[#66736B]">Loading your saved comparisons…</p>}
      {query.isError && <p role="alert" className="text-sm text-red-700">Comparison could not be loaded. Check the backend endpoint and saved-location ownership.</p>}
      {query.isSuccess && rows.length === 0 && <p className="rounded-xl bg-white p-6 text-sm text-[#66736B]">No bookmarks to compare. Save locations from Location Explorer first.</p>}
      {query.isSuccess && rows.length > 0 && <>
        <div className="grid gap-4 sm:grid-cols-3">
          {[
            {label:"Unique bookmarked sites",value:String(rows.length)},
            {label:"Average selected category",value:average === null ? "N/A" : `${average.toFixed(1)}/100`},
            {label:"Highest selected category",value:best === null ? "N/A" : `${best.toFixed(1)}/100`},
          ].map((k) => <div key={k.label} className="rounded-2xl border border-[#E5EAE4] bg-white p-5"><p className="text-xs text-[#66736B]">{k.label}</p><p className="mt-2 text-2xl font-extrabold">{k.value}</p></div>)}
        </div>
        <section className="rounded-2xl border border-[#E5EAE4] bg-white p-5">
          <h2 className="text-lg font-extrabold">Business category comparison</h2>
          <p className="mt-1 text-xs text-[#66736B]">Each site uses the latest available precomputed scores. Missing scores remain unavailable.</p>
          <div className="mt-4 h-[380px] min-w-0">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{top:8,right:8,bottom:42,left:-20}}>
                <CartesianGrid vertical={false} stroke="#EAEFE8"/>
                <XAxis dataKey="label" angle={-30} textAnchor="end" interval={0} height={90} tick={{fontSize:10}}/>
                <YAxis domain={[0,100]} tick={{fontSize:11}} />
                <Tooltip formatter={(value) => [value == null ? "N/A" : `${Number(value).toFixed(1)}/100`,"Score"]}/>
                <Legend verticalAlign="top" height={36}/>
                {SERIES.map((type) => <Bar key={type} dataKey={type} name={BUSINESS_LABELS[type]} fill={PALETTE[type]} maxBarSize={32} isAnimationActive={false}/>) }
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>
        <section className="rounded-2xl border border-[#E5EAE4] bg-white p-5">
          <h2 className="text-lg font-extrabold">Saved candidates ranked for {BUSINESS_LABELS[category]}</h2>
          <div className="mt-4 space-y-3">
            {ranked.map((item, i) => {
              const value = item[category]; const band = getSuitabilityLevel(value);
              return <div key={item.locationId} className="flex items-center gap-3 rounded-xl border border-[#E5EAE4] p-4">
                <span className="w-5 shrink-0 text-sm text-[#68756D]">{i+1}.</span>
                <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold" title={item.name}>{item.name}</p>
                  <div className="mt-2 h-2 overflow-hidden rounded-full bg-[#E8ECE7]"><div className="h-full rounded-full" style={{width:`${value ?? 0}%`,backgroundColor:BAND_COLORS[band]}} /></div>
                </div>
                <strong className="shrink-0 text-sm" style={{color:BAND_COLORS[band]}}>{value === null ? "N/A" : `${value.toFixed(1)}/100`}</strong>
              </div>;
            })}
          </div>
        </section>
        <p className="text-xs leading-5 text-[#66736B]">Synthetic prototype suitability scores only. Rankings do not imply verified demand, expected profit, or business success. Locations saved in multiple categories appear once in this comparison.</p>
      </>}
    </div>
  );
}

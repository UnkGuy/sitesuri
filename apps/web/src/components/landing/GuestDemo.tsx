"use client";

import { useState } from "react";
import { ArrowRight, MapPin, ShieldCheck } from "lucide-react";

type Category = "bakery" | "cafe" | "retail";

type Location = {
  id: string;
  name: string;
  environment: string;
  activity: number;
  roadConditions: number;
  accessibility: number;
  competition: Record<Category, number>;
  demand: Record<Category, number>;
};

// Fictional demonstration inputs, not real location observations.
const demoLocations: Location[] = [
  {
    id: "campus",
    name: "University corridor",
    environment: "Campus-adjacent example",
    activity: 84,
    roadConditions: 73,
    accessibility: 88,
    competition: { bakery: 78, cafe: 49, retail: 58 },
    demand: { bakery: 95, cafe: 81, retail: 73 },
  },
  {
    id: "market",
    name: "Market-side avenue",
    environment: "Commercial-street example",
    activity: 80,
    roadConditions: 65,
    accessibility: 79,
    competition: { bakery: 55, cafe: 59, retail: 90 },
    demand: { bakery: 80, cafe: 80, retail: 88 },
  },
  {
    id: "residential",
    name: "Residential side street",
    environment: "Neighborhood example",
    activity: 40,
    roadConditions: 54,
    accessibility: 48,
    competition: { bakery: 58, cafe: 67, retail: 60 },
    demand: { bakery: 45, cafe: 50, retail: 46 },
  },
];

const categories: { id: Category; label: string }[] = [
  { id: "bakery", label: "Bakery" },
  { id: "cafe", label: "Café" },
  { id: "retail", label: "Retail" },
];

// Preliminary, unvalidated weights used only for the interactive demo.
const weights = {
  activity: 0.35,
  competition: 0.2,
  roadConditions: 0.1,
  demand: 0.2,
  accessibility: 0.15,
} as const;

function scoreLocation(location: Location, category: Category): number {
  return Math.round(
    location.activity * weights.activity +
      location.competition[category] * weights.competition +
      location.roadConditions * weights.roadConditions +
      location.demand[category] * weights.demand +
      location.accessibility * weights.accessibility,
  );
}

function scoreStyle(score: number) {
  if (score >= 75) {
    return { background: "bg-[#15803D]", label: "High suitability" };
  }
  if (score >= 50) {
    return { background: "bg-[#B78200]", label: "Moderate suitability" };
  }
  return { background: "bg-[#DC2626]", label: "Low suitability" };
}

export default function GuestDemo() {
  const [category, setCategory] = useState<Category>("bakery");
  const [selectedId, setSelectedId] = useState(demoLocations[0].id);

  const selectedLocation =
    demoLocations.find((location) => location.id === selectedId) ??
    demoLocations[0];
  const selectedScore = scoreLocation(selectedLocation, category);
  const selectedStyle = scoreStyle(selectedScore);
  const categoryLabel =
    categories.find(({ id }) => id === category)?.label.toLowerCase() ??
    category;

  const breakdown = [
    {
      label: "Activity scenario",
      value: selectedLocation.activity,
      weight: 35,
    },
    {
      label: "Competition suitability",
      value: selectedLocation.competition[category],
      weight: 20,
    },
    {
      label: "Road conditions",
      value: selectedLocation.roadConditions,
      weight: 10,
    },
    {
      label: "Demand generators",
      value: selectedLocation.demand[category],
      weight: 20,
    },
    {
      label: "Accessibility",
      value: selectedLocation.accessibility,
      weight: 15,
    },
  ];

  return (
    <div className="overflow-hidden rounded-[26px] border border-[#E3E7DF] bg-white shadow-[0_24px_60px_#0000000B]">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#E7E9E4] px-5 py-4 sm:px-7">
        <div>
          <p className="text-sm font-extrabold text-brand-black">
            Sample location comparison
          </p>
          <p className="mt-1 text-xs text-[#6D766F]">
            Choose a business and see how each location ranks.
          </p>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-[#ECF8EC] px-3 py-1.5 text-xs font-bold text-brand-green">
          <ShieldCheck size={14} aria-hidden="true" /> No account needed
        </span>
      </div>

      <div className="grid lg:grid-cols-[minmax(0,1fr)_minmax(300px,0.88fr)]">
        <div className="border-b border-[#E7E9E4] p-5 sm:p-7 lg:border-b-0 lg:border-r">
          <p className="mb-3 text-xs font-extrabold uppercase tracking-[0.12em] text-[#58675C]">
            Select a business type
          </p>
          <div
            className="mb-7 flex flex-wrap gap-2"
            role="group"
            aria-label="Business category"
          >
            {categories.map(({ id, label }) => (
              <button
                key={id}
                type="button"
                aria-pressed={category === id}
                onClick={() => setCategory(id)}
                className={`rounded-full border px-4 py-2 text-sm font-bold transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-green ${
                  category === id
                    ? "border-brand-black bg-brand-black text-white"
                    : "border-[#DEE4DB] bg-white text-[#48524B] hover:border-brand-black"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <p className="mb-3 text-xs font-extrabold uppercase tracking-[0.12em] text-[#58675C]">
            Choose a candidate area
          </p>
          <div className="space-y-3">
            {demoLocations.map((location) => {
              const score = scoreLocation(location, category);
              const style = scoreStyle(score);
              const active = location.id === selectedId;

              return (
                <button
                  key={location.id}
                  type="button"
                  onClick={() => setSelectedId(location.id)}
                  aria-pressed={active}
                  className={`flex w-full items-center gap-3 rounded-2xl border p-4 text-left transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-green ${
                    active
                      ? "border-[#BDA42A] bg-[#FFFCED]"
                      : "border-[#E7E9E4] hover:border-[#C6C8BD] hover:bg-[#FAFBF8]"
                  }`}
                >
                  <span
                    className={`grid size-10 shrink-0 place-items-center rounded-xl ${style.background} font-extrabold text-white`}
                  >
                    {score}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-extrabold text-brand-black">
                      {location.name}
                    </span>
                    <span className="mt-1 block text-xs text-[#738077]">
                      {location.environment}
                    </span>
                  </span>
                  <ArrowRight
                    size={17}
                    className="shrink-0 text-[#69736C]"
                    aria-hidden="true"
                  />
                </button>
              );
            })}
          </div>
        </div>

        <div
          className="bg-[#FBFCF9] p-5 sm:p-7"
          aria-live="polite"
          aria-atomic="true"
        >
          <div className="flex items-center gap-2 text-xs font-extrabold uppercase tracking-[0.12em] text-brand-green">
            <MapPin size={16} aria-hidden="true" /> Sample analysis
          </div>
          <h3 className="font-display mt-4 text-2xl font-extrabold tracking-[-0.04em] text-brand-black">
            {selectedLocation.name}
          </h3>
          <p className="mt-2 text-sm text-[#68746B]">
            Example suitability for a {categoryLabel}.
          </p>

          <div className="mt-7 flex items-end gap-3">
            <span className="font-display text-6xl font-extrabold tracking-[-0.07em] text-brand-black">
              {selectedScore}
            </span>
            <span className="pb-2 text-sm font-semibold text-[#6C786F]">
              / 100
            </span>
            <span
              className={`ml-auto mb-2 rounded-full px-3 py-1.5 text-[11px] font-bold text-white ${selectedStyle.background}`}
            >
              {selectedStyle.label}
            </span>
          </div>

          <div className="mt-7 space-y-4">
            {breakdown.map(({ label, value, weight }) => (
              <div key={label}>
                <div className="mb-1.5 flex justify-between gap-4 text-xs font-semibold text-[#4E5B51]">
                  <span>
                    {label}{" "}
                    <span className="font-normal text-[#8B948D]">
                      ({weight}%)
                    </span>
                  </span>
                  <span>{value}/100</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-[#E7E9E3]">
                  <div
                    className="h-full rounded-full bg-brand-yellow"
                    style={{ width: `${value}%` }}
                  />
                </div>
              </div>
            ))}
          </div>

          <div className="mt-7 rounded-xl border border-[#EFE1A0] bg-[#FFF8D9] p-4 text-xs leading-6 text-[#65521B]">
            <strong>Demo data:</strong> All locations and scores are fictional.
            They do not represent verified business opportunities or actual
            pedestrian measurements.
          </div>
        </div>
      </div>
    </div>
  );
}

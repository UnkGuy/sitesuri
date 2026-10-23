"use client";

import { useId } from "react";
import {
  BookmarkCheck,
  BookmarkPlus,
  ChevronDown,
  ChevronUp,
  ChartNoAxesCombined,
  MapPin,
} from "lucide-react";

import type {
  BusinessType,
  CandidateLocation,
  LocationScore,
} from "@/features/analyses/analysis-service";
import {
  getSuitabilityLevel,
  SUITABILITY_STYLES,
} from "@/features/analyses/suitability";
import { readableKey } from "@/features/analyses/candidate-insights";

type CandidateLocationCardProps = {
  location: CandidateLocation;
  distance: number;
  businessType: BusinessType;
  score: number | null;
  scoreDetails: LocationScore | null;
  isLoading: boolean;
  isError: boolean;
  isExpanded: boolean;
  isSelected: boolean;
  bookmarked: boolean;
  bookmarkDisabled: boolean;
  bookmarkPending: boolean;
  analysisDisabled: boolean;
  onToggle: () => void;
  onSelect: () => void;
  onBookmark: () => void;
  onAnalyze: () => void;
};

const MAX_PREVIEW_FACTORS = 4;

export default function CandidateLocationCard({
  location,
  distance,
  businessType,
  score,
  scoreDetails,
  isLoading,
  isError,
  isExpanded,
  isSelected,
  bookmarked,
  bookmarkDisabled,
  bookmarkPending,
  analysisDisabled,
  onToggle,
  onSelect,
  onBookmark,
  onAnalyze,
}: CandidateLocationCardProps) {
  const panelId = useId();
  const status = SUITABILITY_STYLES[getSuitabilityLevel(score)];

  const scoreLabel = isError
    ? "Error"
    : isLoading
      ? "Loading"
      : score === null
        ? "N/A"
        : `${score.toFixed(1)}/100`;

  const name =
    location.address ?? location.source_location_id ?? "Candidate location";
  // Keep the site name readable in narrow cards; show the full address on expand.

  const [firstPart, ...remainingParts] = name.split(",");
  const siteTitle = firstPart.trim() || "Candidate location";
  const areaLabel = remainingParts.join(",").trim();

  const factors = scoreDetails?.components ?? [];
  const previewFactors = factors.slice(0, MAX_PREVIEW_FACTORS);
  const extraFactorCount = Math.max(0, factors.length - previewFactors.length);
  const flags = scoreDetails?.flags ?? [];
  const caps = scoreDetails?.caps_applied ?? [];
  const weakest = scoreDetails?.weakest_component;
  const hasConsiderations = Boolean(weakest || flags.length || caps.length);

  return (
    <article
      className={`min-w-0 overflow-hidden rounded-xl border bg-white transition-colors ${
        isSelected
          ? "border-green-600"
          : "border-[#E5EAE4] hover:border-[#B6C4B7]"
      }`}
    >
      {/* Compact summary: location on the left; bookmark and expand actions
          side by side on the right, with the score centered beneath them. */}
      <div className="flex min-w-0 items-center gap-2 p-2.5 sm:p-3">
        {/* Keep the location summary clickable to expand, as before. */}
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={isExpanded}
          aria-controls={panelId}
          aria-label={`${isExpanded ? "Collapse" : "Expand"} details for ${name}`}
          className="min-h-11 min-w-0 flex-1 rounded-lg text-left focus-visible:outline-2 focus-visible:outline-brand-green"
        >
          <span
            className="block truncate text-[13px] font-bold leading-5 text-[#171717] sm:text-sm"
            title={name}
          >
            {siteTitle}
          </span>

          {areaLabel && (
            <span
              className="block truncate text-[11px] leading-4 text-[#66736B]"
              title={areaLabel}
            >
              {areaLabel}
            </span>
          )}

          <span className="mt-1.5 block truncate text-[11px] text-[#66736B]">
            {Math.round(distance).toLocaleString()} m away
          </span>
        </button>

        {/* Small-looking bookmark, full 44px tap target; chevron at far right. */}
        <div className="flex shrink-0 flex-col items-center gap-0.5">
          <div className="flex items-center gap-0">
            <button
              type="button"
              onClick={onBookmark}
              disabled={bookmarkDisabled}
              aria-label={
                bookmarked
                  ? `Remove ${name} from saved locations`
                  : `Save ${name}`
              }
              aria-pressed={bookmarked}
              title={bookmarked ? "Remove saved location" : "Save location"}
              className="grid size-11 shrink-0 place-items-center rounded-lg focus-visible:outline-2 focus-visible:outline-brand-green disabled:cursor-not-allowed disabled:opacity-50"
            >
              <span
                className={`grid size-8 place-items-center rounded-lg border transition-colors ${
                  bookmarked
                    ? "border-amber-200 bg-[#FFF1AF] text-[#171717]"
                    : "border-[#DDE4DC] bg-white text-[#435047] hover:bg-[#F4F7F1]"
                }`}
              >
                {bookmarkPending ? (
                  <span className="text-xs" aria-hidden="true">
                    …
                  </span>
                ) : bookmarked ? (
                  <BookmarkCheck size={15} aria-hidden="true" />
                ) : (
                  <BookmarkPlus size={15} aria-hidden="true" />
                )}
              </span>
            </button>

            <button
              type="button"
              onClick={onToggle}
              aria-expanded={isExpanded}
              aria-controls={panelId}
              aria-label={`${isExpanded ? "Collapse" : "Expand"} details for ${name}`}
              className="grid size-11 shrink-0 place-items-center rounded-lg text-[#66736B] hover:bg-[#F4F7F1] focus-visible:outline-2 focus-visible:outline-brand-green"
            >
              {isExpanded ? (
                <ChevronUp size={17} aria-hidden="true" />
              ) : (
                <ChevronDown size={17} aria-hidden="true" />
              )}
            </button>
          </div>

          <span
            className={`max-w-full whitespace-nowrap rounded-md px-2 py-1 text-[11px] font-extrabold tabular-nums ${status.background} ${status.text}`}
          >
            {scoreLabel}
          </span>
        </div>
      </div>

      {isExpanded && (
        <div
          id={panelId}
          className="space-y-3 border-t border-[#E5EAE4] bg-[#FBFCFA] p-3 sm:p-4"
        >
          <div className="space-y-1 text-xs text-[#435047]">
            <p className="break-words font-semibold text-[#171717]">{name}</p>
            <p>
              <span className="text-[#66736B]">Business type:</span>{" "}
              <span className="font-semibold capitalize">
                {String(businessType).replace(/_/g, " ")}
              </span>
              <span className="mx-1.5 text-[#A5AFA7]">·</span>
              <span className="font-semibold">{status.label}</span>
            </p>
          </div>

          <section
            aria-label="Suitability score breakdown"
            className="rounded-xl border border-[#E5EAE4] bg-white p-3"
          >
            <h4 className="text-xs font-extrabold text-[#171717]">
              Why this suitability score?
            </h4>
            {previewFactors.length ? (
              <div className="mt-3 space-y-3">
                {previewFactors.map((factor, index) => {
                  const value = factor.score;
                  const valid =
                    typeof value === "number" && Number.isFinite(value);
                  return (
                    <div key={`${factor.name}-${index}`} className="space-y-1">
                      <div className="flex items-center justify-between gap-2 text-xs">
                        <span className="min-w-0 break-words font-medium text-[#435047]">
                          {readableKey(factor.name)}
                        </span>
                        <span className="shrink-0 font-bold tabular-nums">
                          {valid ? `${value.toFixed(1)}/100` : "N/A"}
                        </span>
                      </div>
                      {valid && (
                        <div className="h-1.5 overflow-hidden rounded-full bg-[#E8ECE7]">
                          <div
                            className="h-full rounded-full bg-[#15803D]"
                            style={{
                              width: `${Math.max(0, Math.min(100, value))}%`,
                            }}
                          />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="mt-2 text-xs text-[#66736B]" role="status">
                {isError
                  ? "Could not retrieve the score breakdown."
                  : isLoading
                    ? "Loading scoring details…"
                    : "No factor breakdown is available for this candidate."}
              </p>
            )}
            {extraFactorCount > 0 && (
              <p className="mt-3 text-[11px] text-[#66736B]">
                +{extraFactorCount} additional factors recorded in the score.
              </p>
            )}
          </section>

          {hasConsiderations && (
            <div className="rounded-lg bg-[#FFF9E5] px-3 py-2 text-xs leading-5 text-[#70591F]">
              <p className="font-bold">Model considerations</p>
              {weakest && <p>Weakest factor: {readableKey(weakest)}</p>}
              {flags.length > 0 && (
                <p>
                  {flags.length} recorded warning{flags.length === 1 ? "" : "s"}
                  .
                </p>
              )}
              {caps.length > 0 && (
                <p>
                  {caps.length} score cap{caps.length === 1 ? "" : "s"} applied.
                </p>
              )}
              {(flags.length > 0 || caps.length > 0) && (
                <p>Additional model notes are recorded in the score.</p>
              )}
            </div>
          )}

          <p className="text-[11px] leading-4 text-[#66736B]">
            Prototype scores use synthetic data; they are not guaranteed
            business outcomes.
          </p>

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <button
              type="button"
              onClick={onSelect}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-[#DDE4DC] bg-white px-3 text-xs font-semibold text-[#354339] hover:bg-[#F2F6F0] focus-visible:outline-2 focus-visible:outline-brand-green"
            >
              <MapPin size={15} aria-hidden="true" />
              {isSelected ? "Selected on map" : "Select on map"}
            </button>
            <button
              type="button"
              onClick={onAnalyze}
              disabled={analysisDisabled}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-[#171717] px-3 text-xs font-semibold text-white hover:bg-brand-green focus-visible:outline-2 focus-visible:outline-brand-green disabled:cursor-not-allowed disabled:opacity-50"
            >
              <ChartNoAxesCombined size={15} aria-hidden="true" />
              Full analysis
            </button>
          </div>
          <p className="text-[11px] text-[#758177]">
            Full analysis appears below the candidate list.
          </p>
        </div>
      )}
    </article>
  );
}

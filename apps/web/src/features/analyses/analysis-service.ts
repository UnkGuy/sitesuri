import type { AxiosInstance } from "axios";

/** These are the values recorded by SiteSuri's imported ML prototype. */
export type BusinessType = "food stall" | "sari-sari store" | "general retail";

export interface CandidateLocation {
  /** Database identifier used when requesting an analysis. */
  location_id: string;
  source_location_id?: string | null;
  address: string | null;
  latitude: number;
  longitude: number;
  location_type: string | null;
}

export interface ScoreComponent {
  name: string;
  score: number | null;
  weight?: number | null;
  detail?: Record<string, unknown> | null;
}

export interface LocationScore {
  location_score: number;
  business_type: BusinessType;
  weakest_component: string | null;
  components: ScoreComponent[];
  flags: string[];
  caps_applied: string[];
  info_only: Record<string, unknown> | null;
}

export interface AnalysisRequest {
  location_id: string;
  business_type: BusinessType;
  /** UI visualization radius; precomputed suitability scores do not vary by this value. */
  display_radius_meters: number;
}

export interface AnalysisResult {
  id: string;
  created_at: string;
  display_radius_meters: number;
  prediction_mode: string;
  source_type: string;
  location: CandidateLocation | null;
  score: LocationScore;
}

type RawLocation = Partial<CandidateLocation> & { id?: string };

type RawAnalysis = Partial<AnalysisResult> & {
  analysis_id?: string;
  // Earlier frontend draft assumed flat analysis scores; accept it as a fallback.
  location_id?: string;
  business_type?: BusinessType;
  location_score?: number;
  weakest_component?: string | null;
  components?: ScoreComponent[] | Record<string, number | null>;
  flags?: string[];
  caps_applied?: string[];
  info_only?: Record<string, unknown> | null;
};

function normalizeLocation(raw: RawLocation): CandidateLocation {
  // Prefer the persisted database ID, not the source CSV identifier.
  const locationId = raw.id ?? raw.location_id;

  if (
    !locationId ||
    typeof raw.latitude !== "number" ||
    !Number.isFinite(raw.latitude) ||
    typeof raw.longitude !== "number" ||
    !Number.isFinite(raw.longitude)
  ) {
    throw new Error("Unexpected location response from the API.");
  }

  return {
    location_id: locationId,
    source_location_id: raw.source_location_id ?? null,
    address: raw.address ?? null,
    latitude: raw.latitude,
    longitude: raw.longitude,
    location_type: raw.location_type ?? null,
  };
}

function normalizeComponents(
  value: ScoreComponent[] | Record<string, number | null> | undefined,
): ScoreComponent[] {
  if (Array.isArray(value)) return value;
  if (value && typeof value === "object") {
    return Object.entries(value).map(([name, score]) => ({ name, score }));
  }
  return [];
}

function normalizeAnalysis(raw: RawAnalysis): AnalysisResult {
  const rawScore =
    raw.score ??
    (raw.location_score != null
      ? {
          location_score: raw.location_score,
          business_type: raw.business_type,
          weakest_component: raw.weakest_component,
          components: raw.components,
          flags: raw.flags,
          caps_applied: raw.caps_applied,
          info_only: raw.info_only,
        }
      : undefined);

  if (!rawScore || typeof rawScore.location_score !== "number") {
    throw new Error("Analysis response is missing the location score.");
  }

  if (!rawScore.business_type) {
    throw new Error("Analysis response is missing the business type.");
  }

  const score: LocationScore = {
    location_score: rawScore.location_score,
    business_type: rawScore.business_type,
    weakest_component: rawScore.weakest_component ?? null,
    components: normalizeComponents(rawScore.components),
    flags: rawScore.flags ?? [],
    caps_applied: rawScore.caps_applied ?? [],
    info_only: rawScore.info_only ?? null,
  };

  return {
    id: raw.id ?? raw.analysis_id ?? "",
    created_at: raw.created_at ?? "",
    display_radius_meters: raw.display_radius_meters ?? 0,
    prediction_mode: raw.prediction_mode ?? "precomputed",
    source_type: raw.source_type ?? "unknown",
    location: raw.location ? normalizeLocation(raw.location) : null,
    score,
  };
}

export async function getLocations(
  api: AxiosInstance,
): Promise<CandidateLocation[]> {
  const { data } = await api.get<
    | RawLocation[]
    | {
        items?: RawLocation[];
        locations?: RawLocation[];
      }
  >("/locations");

  const rows = Array.isArray(data) ? data : (data.items ?? data.locations);
  if (!Array.isArray(rows)) {
    throw new Error("Unexpected locations list response from the API.");
  }

  return rows.map(normalizeLocation);
}

export async function createAnalysis(
  api: AxiosInstance,
  payload: AnalysisRequest,
): Promise<AnalysisResult> {
  const { data } = await api.post<RawAnalysis>("/analyses", payload);
  return normalizeAnalysis(data);
}

export async function getLocationScores(
  api: AxiosInstance,
  locationId: string,
  businessType: BusinessType,
): Promise<LocationScore[]> {
  const { data } = await api.get<LocationScore | LocationScore[]>(
    `/locations/${encodeURIComponent(locationId)}/scores`,
    {
      params: {
        business_type: businessType,
      },
    },
  );

  return Array.isArray(data) ? data : [data];
}

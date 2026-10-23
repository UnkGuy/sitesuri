import type { AxiosInstance } from "axios";
import type { BusinessType, CandidateLocation } from "@/features/analyses/analysis-service";

export const SAVED_LOCATIONS_KEY = ["sitesuri", "saved-locations"] as const;

export type SavedLocation = {
  id: string;
  location_id: string;
  business_type: BusinessType;
  notes: string | null;
  created_at: string;
  updated_at: string;
  source_location_id: string | null;
  address: string | null;
  latitude: number;
  longitude: number;
  location_type: string | null;
  location_score: number | null;
};

export type SaveLocationPayload = {
  location_id: string;
  business_type: BusinessType;
  notes?: string | null;
};

export type SavedCategoryScore = {
  business_type: BusinessType;
  location_score: number;
};

export type SavedComparison = {
  location_id: string;
  source_location_id: string | null;
  address: string | null;
  latitude: number;
  longitude: number;
  scores: SavedCategoryScore[];
};

export const savedKey = (locationId: string, category: BusinessType) =>
  `${locationId}:${category}`;

export function asCandidateLocation(item: SavedLocation): CandidateLocation {
  return {
    location_id: item.location_id,
    source_location_id: item.source_location_id,
    address: item.address,
    latitude: item.latitude,
    longitude: item.longitude,
    location_type: item.location_type,
  };
}

export async function getSavedLocations(api: AxiosInstance) {
  const { data } = await api.get<SavedLocation[]>("/saved-locations");
  return data;
}

export async function saveLocation(api: AxiosInstance, payload: SaveLocationPayload) {
  const { data } = await api.post<SavedLocation>("/saved-locations", payload);
  return data;
}

export async function removeSavedLocation(api: AxiosInstance, savedId: string) {
  await api.delete(`/saved-locations/${encodeURIComponent(savedId)}`);
}

export async function updateSavedLocationNotes(
  api: AxiosInstance,
  savedId: string,
  notes: string | null,
) {
  const { data } = await api.patch<SavedLocation>(
    `/saved-locations/${encodeURIComponent(savedId)}`,
    { notes },
  );
  return data;
}

export async function getSavedComparison(api: AxiosInstance, savedIds?: string[]) {
  const { data } = await api.get<SavedComparison[]>("/saved-locations/comparison", {
    params: savedIds?.length ? { ids: savedIds.join(",") } : undefined,
  });
  return data;
}

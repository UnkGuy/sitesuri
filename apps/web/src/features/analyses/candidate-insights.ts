import type {
  LocationScore,
  ScoreComponent,
} from "@/features/analyses/analysis-service";

// The stored model output is the source of truth. These helpers never infer
// real-world POI counts, accessibility times, or property prices from scores.
export type EvidenceGroup = "accessibility" | "competition" | "affordability";

export type Evidence = {
  key: string;
  value: string;
  source: "model component" | "recorded indicator";
};

const GROUP_PATTERN: Record<EvidenceGroup, RegExp> = {
  accessibility:
    /access|transit|transport|walk|road|travel|(?:^|_)bus(?:_|$)|jeep|footfall|pedestr/i,
  competition:
    /compet|rival|nearby.business|nearby.shop|business.density|store.density|poi/i,
  affordability:
    /afford|rent|lease|property.price|land.value|property.cost|occupancy.cost/i,
};

const MODEL_FLAG_LABELS: Record<string, string> = {
  crowded_or_empty_market:
    "Potential market saturation or insufficient activity",
};

export function formatModelFlag(flag: string): string {
  const normalized = flag.trim().toLowerCase();

  if (MODEL_FLAG_LABELS[normalized]) {
    return MODEL_FLAG_LABELS[normalized];
  }

  // Fallback for other flags from the backend.
  const readable = normalized.replace(/[_-]+/g, " ").replace(/\s+/g, " ");

  return readable.charAt(0).toUpperCase() + readable.slice(1);
}

export function readableKey(key: string): string {
  return key.replace(/[_-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function readableValue(value: unknown): string | null {
  if (typeof value === "number" && Number.isFinite(value))
    return value.toLocaleString("en-PH");
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "string" && value.trim())
    return value.trim().slice(0, 100);
  return null;
}

export function groupEvidence(
  score: LocationScore | null,
  group: EvidenceGroup,
): Evidence[] {
  if (!score) return [];
  const pattern = GROUP_PATTERN[group];
  const componentEvidence: Evidence[] = score.components
    .filter(
      (item) =>
        pattern.test(item.name) &&
        typeof item.score === "number" &&
        Number.isFinite(item.score),
    )
    .map((item) => ({
      key: readableKey(item.name),
      value: `${item.score!.toFixed(1)}/100 (prototype factor)`,
      source: "model component" as const,
    }));
  const infoEvidence: Evidence[] = Object.entries(score.info_only ?? {})
    .filter(([key]) => pattern.test(key))
    .map(([key, raw]) => ({
      key: readableKey(key),
      value: readableValue(raw),
      source: "recorded indicator" as const,
    }))
    .filter(
      (item): item is Evidence & { source: "recorded indicator" } =>
        item.value !== null,
    );
  return [...componentEvidence, ...infoEvidence].slice(0, 6);
}

export function otherRecordedIndicators(
  score: LocationScore | null,
): Evidence[] {
  if (!score) return [];
  const groupPatterns = Object.values(GROUP_PATTERN);
  return Object.entries(score.info_only ?? {})
    .filter(([key]) => !groupPatterns.some((pattern) => pattern.test(key)))
    .map(([key, value]) => ({
      key: readableKey(key),
      value: readableValue(value),
      source: "recorded indicator" as const,
    }))
    .filter(
      (item): item is Evidence & { source: "recorded indicator" } =>
        item.value !== null,
    )
    .slice(0, 8);
}

export function numericComponents(
  components: ScoreComponent[],
): Array<ScoreComponent & { score: number }> {
  return components.filter(
    (item): item is ScoreComponent & { score: number } =>
      typeof item.score === "number" && Number.isFinite(item.score),
  );
}

/**
 * Exploratory weighted average of visible component values ONLY.
 * It is NOT a recomputation of the official location_score: model caps,
 * penalties, feature transforms, and calibration are not reproduced here.
 */
export function whatIfIndex(
  components: ScoreComponent[],
  priorities: Record<string, number>,
): number | null {
  const valid = numericComponents(components);
  let total = 0;
  let weighted = 0;
  for (const component of valid) {
    const raw = priorities[component.name] ?? 1;
    const priority = Number.isFinite(raw) ? Math.max(0, Math.min(3, raw)) : 0;
    total += priority;
    weighted += component.score * priority;
  }
  return total > 0 ? weighted / total : null;
}

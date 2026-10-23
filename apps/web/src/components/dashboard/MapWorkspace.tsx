"use client";

import { useEffect, useRef, useState } from "react";
import type {
  GeoJSONSource,
  LngLatBoundsLike,
  Map as MapLibreMap,
  Marker as MapLibreMarker,
} from "maplibre-gl";

import "maplibre-gl/dist/maplibre-gl.css";

import type { CandidateLocation } from "@/features/analyses/analysis-service";
import {
  getSuitabilityLevel,
  SUITABILITY_STYLES,
} from "@/features/analyses/suitability";
// Approximate geographic bounds covering the Philippines.
const PHILIPPINES_BOUNDS: LngLatBoundsLike = [
  [115.0, 4.0],
  [128.0, 22.0],
];

const EMPTY_LOCATIONS: CandidateLocation[] = [];
const EMPTY_SCORES: Record<string, number | null> = {};
export type GeoPoint = {
  lat: number;
  lng: number;
};

type MapWorkspaceProps = {
  point: GeoPoint;
  radiusMeters: number;
  onPickPoint: (point: GeoPoint) => void;
  scoresByLocationId?: Record<string, number | null>;

  // New candidate-location props.
  locations?: CandidateLocation[];
  selectedLocationId?: string | null;
  onLocationSelect?: (location: CandidateLocation | null) => void;
};

function radiusPolygon(point: GeoPoint, radiusMeters: number) {
  const coordinates: number[][] = [];

  const latRadius = radiusMeters / 111320;

  const lngRadius =
    radiusMeters /
    (111320 * Math.max(0.01, Math.cos((point.lat * Math.PI) / 180)));

  for (let index = 0; index <= 72; index += 1) {
    const angle = (index / 72) * Math.PI * 2;

    coordinates.push([
      point.lng + lngRadius * Math.cos(angle),
      point.lat + latRadius * Math.sin(angle),
    ]);
  }

  return {
    type: "Feature" as const,
    geometry: {
      type: "Polygon" as const,
      coordinates: [coordinates],
    },
    properties: {},
  };
}

export default function MapWorkspace({
  point,
  radiusMeters,
  onPickPoint,
  locations = EMPTY_LOCATIONS,
  selectedLocationId = null,
  onLocationSelect,
  scoresByLocationId = EMPTY_SCORES,
}: MapWorkspaceProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  const mapRef = useRef<MapLibreMap | null>(null);

  const maplibreRef = useRef<typeof import("maplibre-gl") | null>(null);

  const markerRef = useRef<MapLibreMarker | null>(null);

  const candidateMarkersRef = useRef<MapLibreMarker[]>([]);

  const pickRef = useRef(onPickPoint);
  const selectionRef = useRef(onLocationSelect);

  const [mapReady, setMapReady] = useState(false);
  const [mapError, setMapError] = useState(false);

  // Keep callbacks fresh without reinitializing the map.
  useEffect(() => {
    pickRef.current = onPickPoint;
    selectionRef.current = onLocationSelect;
  }, [onPickPoint, onLocationSelect]);

  // 1. Initialize MapLibre once.
  useEffect(() => {
    let disposed = false;
    let map: MapLibreMap | null = null;

    async function initialize() {
      const maplibregl = await import("maplibre-gl");

      if (disposed || !containerRef.current) return;

      maplibregl.setWorkerUrl("/maplibre/maplibre-gl-worker.mjs");

      maplibreRef.current = maplibregl;

      const instance = new maplibregl.Map({
        container: containerRef.current,

        style: "https://tiles.openfreemap.org/styles/liberty",

        center: [point.lng, point.lat],
        zoom: 13.4,

        maxBounds: PHILIPPINES_BOUNDS,
        minZoom: 5,
        maxZoom: 19,

        renderWorldCopies: false,
        trackResize: false,
      });

      map = instance;
      mapRef.current = instance;

      instance.addControl(
        new maplibregl.NavigationControl({
          showCompass: false,
        }),
        "top-right",
      );

      // Free-selection marker.
      markerRef.current = new maplibregl.Marker({
        color: "#EAB308",
      })
        .setLngLat([point.lng, point.lat])
        .addTo(instance);

      // Clicking the basemap selects an arbitrary point.
      instance.on("click", (event) => {
        selectionRef.current?.(null);

        pickRef.current({
          lat: event.lngLat.lat,
          lng: event.lngLat.lng,
        });
      });

      instance.on("load", () => {
        if (disposed) return;

        console.log("MapLibre fully loaded", {
          style: instance.getStyle()?.name,
          canvasWidth: instance.getCanvas().width,
          canvasHeight: instance.getCanvas().height,
        });

        instance.resize();

        // Create the analysis radius source.
        instance.addSource("analysis-radius", {
          type: "geojson",
          data: radiusPolygon(point, radiusMeters),
        });

        instance.addLayer({
          id: "analysis-fill",
          type: "fill",
          source: "analysis-radius",
          paint: {
            "fill-color": "#EAB308",
            "fill-opacity": 0.13,
          },
        });

        instance.addLayer({
          id: "analysis-outline",
          type: "line",
          source: "analysis-radius",
          paint: {
            "line-color": "#B78200",
            "line-width": 2,
            "line-dasharray": [3, 2],
          },
        });

        // Marker and radius effects can now run.
        setMapReady(true);
      });

      instance.on("error", (event) => {
        console.warn("MapLibre error:", event.error);
      });
    }

    void initialize().catch((error) => {
      if (disposed) return;

      console.error("MapLibre initialization failed:", error);

      setMapError(true);
    });

    return () => {
      disposed = true;

      candidateMarkersRef.current.forEach((marker) => marker.remove());

      candidateMarkersRef.current = [];

      markerRef.current?.remove();

      map?.remove();

      mapRef.current = null;
      markerRef.current = null;
      maplibreRef.current = null;
    };

    // Initialization intentionally runs once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Resize MapLibre only after the container settles.
  useEffect(() => {
    if (!mapReady || !containerRef.current) return;

    const container = containerRef.current;

    let resizeTimer: ReturnType<typeof setTimeout> | undefined;

    const observer = new ResizeObserver(() => {
      clearTimeout(resizeTimer);

      resizeTimer = setTimeout(() => {
        mapRef.current?.resize();
      }, 120);
    });

    observer.observe(container);

    return () => {
      observer.disconnect();
      clearTimeout(resizeTimer);
    };
  }, [mapReady]);

  // 2. Update the free-selection marker and camera.
  useEffect(() => {
    if (!mapReady) return;

    const map = mapRef.current;
    if (!map) return;

    markerRef.current?.setLngLat([point.lng, point.lat]);

    map.easeTo({
      center: [point.lng, point.lat],
      duration: 450,
    });
  }, [mapReady, point.lat, point.lng]);

  // 3. Update the radius without recentering.
  useEffect(() => {
    if (!mapReady) return;

    const map = mapRef.current;
    if (!map) return;

    const source = map.getSource("analysis-radius") as
      | GeoJSONSource
      | undefined;

    if (!source) return;

    void source.setData(radiusPolygon(point, radiusMeters)).catch((error) => {
      console.warn("Could not update analysis radius:", error);
    });
  }, [mapReady, point.lat, point.lng, radiusMeters]);

  // 4. Render candidate-location markers.
  useEffect(() => {
    if (!mapReady) return;

    const map = mapRef.current;
    const maplibregl = maplibreRef.current;

    if (!map || !maplibregl) return;

    const markers = locations
      .filter(
        (location) =>
          Number.isFinite(location.latitude) &&
          Number.isFinite(location.longitude),
      )
      .map((location) => {
        const element = document.createElement("button");

        element.type = "button";

        element.dataset.locationId = location.location_id;

        element.setAttribute(
          "aria-label",
          `Select ${location.address ?? `location ${location.location_id}`}`,
        );

        element.setAttribute("aria-pressed", "false");

        element.title = location.address ?? "Candidate location";

        element.className = [
          "h-5 w-5 cursor-pointer",
          "rounded-full border-[3px]",
          "border-white shadow-lg",
          "transition-transform duration-150",
          "bg-gray-400 hover:scale-110",
        ].join(" ");

        // Select this candidate without triggering
        // the basemap's click handler.
        element.addEventListener("click", (event) => {
          event.stopPropagation();

          selectionRef.current?.(location);
        });

        return new maplibregl.Marker({
          element,
          anchor: "center",
        })
          .setLngLat([location.longitude, location.latitude])
          .addTo(map);
      });

    candidateMarkersRef.current = markers;

    return () => {
      markers.forEach((marker) => marker.remove());

      candidateMarkersRef.current = [];
    };
  }, [mapReady, locations]);

  // 5. Hide the generic yellow marker when
  // an actual candidate location is selected.
  useEffect(() => {
    if (!mapReady) return;

    const element = markerRef.current?.getElement();

    if (!element) return;
  }, [mapReady, selectedLocationId]);

  // Update marker colors according to suitability scores.
  useEffect(() => {
    if (!mapReady) return;

    for (const marker of candidateMarkersRef.current) {
      const element = marker.getElement();

      const locationId = element.dataset.locationId;

      if (!locationId) continue;

      const score = scoresByLocationId[locationId];

      const level = getSuitabilityLevel(score);

      const style = SUITABILITY_STYLES[level];

      const isSelected = locationId === selectedLocationId;

      // Update marker color.
      element.style.backgroundColor = style.marker;

      // Highlight the selected candidate.
      element.style.outline = isSelected ? "3px solid #171717" : "none";

      element.style.outlineOffset = "2px";

      element.style.transform = isSelected ? "scale(1.25)" : "";

      element.setAttribute("aria-pressed", String(isSelected));
    }
  }, [mapReady, scoresByLocationId, selectedLocationId, locations]);

  return (
    <div className="relative h-full min-h-[420px] w-full overflow-hidden rounded-2xl border border-[#DEE4DC] bg-[#EDF1EA]">
      <div
        ref={containerRef}
        className="absolute inset-0 h-full w-full"
        aria-label="Interactive location selection map"
      />

      {mapError && (
        <div
          role="alert"
          className="absolute inset-4 z-20 grid place-items-center rounded-xl bg-white/95 p-6 text-center text-sm text-red-700"
        >
          Map tiles could not be loaded. Check your connection or map style
          configuration.
        </div>
      )}

      {/* Responsive map instructions */}
      <div
        className="
          pointer-events-none absolute z-10
          left-3 top-3
          max-w-[calc(100%-5.5rem)]
          rounded-lg bg-white/95
          px-3 py-2
          text-[11px] font-semibold leading-4
          text-[#36463D] shadow-sm
          backdrop-blur-sm
          sm:bottom-4 sm:left-4 sm:top-auto
          sm:max-w-none sm:rounded-xl
          sm:px-4 sm:text-xs
        "
      >
        <span className="sm:hidden">
          Tap map or marker · {radiusMeters.toLocaleString()} m
        </span>

        <span className="hidden sm:inline">
          Click map to explore or select a candidate marker ·{" "}
          {radiusMeters.toLocaleString()} m radius
        </span>
      </div>
    </div>
  );
}

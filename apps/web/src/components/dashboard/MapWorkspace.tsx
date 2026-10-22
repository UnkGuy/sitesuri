"use client";

import { useEffect, useRef, useState } from "react";
import type { Map as MapLibreMap, Marker as MapLibreMarker } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

import type { LngLatBoundsLike } from "maplibre-gl";

// Approximate geographic bounds covering the Philippines.
// Format: [longitude, latitude]
const PHILIPPINES_BOUNDS: LngLatBoundsLike = [
  [115.0, 4.0], // Southwest
  [128.0, 22.0], // Northeast
];

export type GeoPoint = { lat: number; lng: number };

type MapWorkspaceProps = {
  point: GeoPoint;
  radiusMeters: number;
  onPickPoint: (point: GeoPoint) => void;
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
    geometry: { type: "Polygon" as const, coordinates: [coordinates] },
    properties: {},
  };
}

export default function MapWorkspace({
  point,
  radiusMeters,
  onPickPoint,
}: MapWorkspaceProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const markerRef = useRef<MapLibreMarker | null>(null);
  const pickRef = useRef(onPickPoint);
  const [mapError, setMapError] = useState(false);

  useEffect(() => {
    pickRef.current = onPickPoint;
  }, [onPickPoint]);

  useEffect(() => {
    let disposed = false;
    let map: MapLibreMap | null = null;

    async function initialize() {
      const maplibregl = await import("maplibre-gl");

      if (disposed || !containerRef.current) return;

      // Explicit worker path for Next.js + MapLibre v6.
      maplibregl.setWorkerUrl("/maplibre/maplibre-gl-worker.mjs");

      map = new maplibregl.Map({
        container: containerRef.current,

        style: "https://tiles.openfreemap.org/styles/liberty",

        center: [point.lng, point.lat],
        zoom: 13.4,

        // Restrict navigation to the Philippines region.
        maxBounds: PHILIPPINES_BOUNDS,

        // Prevent zooming too far out.
        minZoom: 5,

        // Limit excessive zooming in.
        maxZoom: 19,

        // Avoid repeated copies of the world.
        renderWorldCopies: false,
      });

      mapRef.current = map;
      // Debug map initialization.
      console.log("MapLibre initialized", {
        container: containerRef.current?.getBoundingClientRect(),
        canvas: map.getCanvas().getBoundingClientRect(),
        center: map.getCenter(),
        zoom: map.getZoom(),
      });

      map.on("load", () => {
        console.log("MapLibre fully loaded", {
          style: map?.getStyle()?.name,
          canvasWidth: map?.getCanvas().width,
          canvasHeight: map?.getCanvas().height,
        });

        map?.resize();
      });
      map.addControl(
        new maplibregl.NavigationControl({ showCompass: false }),
        "top-right",
      );
      markerRef.current = new maplibregl.Marker({ color: "#EAB308" })
        .setLngLat([point.lng, point.lat])
        .addTo(map);
      map.on("click", (event) => {
        pickRef.current({ lat: event.lngLat.lat, lng: event.lngLat.lng });
      });
      map.on("load", () => {
        if (!map) return;
        map.addSource("analysis-radius", {
          type: "geojson",
          data: radiusPolygon(point, radiusMeters),
        });
        map.addLayer({
          id: "analysis-fill",
          type: "fill",
          source: "analysis-radius",
          paint: { "fill-color": "#EAB308", "fill-opacity": 0.13 },
        });
        map.addLayer({
          id: "analysis-outline",
          type: "line",
          source: "analysis-radius",
          paint: {
            "line-color": "#B78200",
            "line-width": 2,
            "line-dasharray": [3, 2],
          },
        });
      });
      map.on("error", (event) => {
        // Tile failures can be transient. Keep the panel usable and surface it in dev.
        console.warn("MapLibre error:", event.error);
      });
    }

    void initialize().catch((error) => {
      console.error("MapLibre initialization failed:", error);
      setMapError(true);
    });

    return () => {
      disposed = true;
      markerRef.current?.remove();
      map?.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
    // Initialize the map once. Selection/radius updates are handled below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    markerRef.current?.setLngLat([point.lng, point.lat]);
    if (!map) return;
    const update = () => {
      const source = map.getSource("analysis-radius") as
        | import("maplibre-gl").GeoJSONSource
        | undefined;
      source?.setData(radiusPolygon(point, radiusMeters));
    };
    if (map.isStyleLoaded()) update();
    else map.once("load", update);
    map.easeTo({ center: [point.lng, point.lat], duration: 450 });
  }, [point.lat, point.lng, radiusMeters]);

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
          className="absolute inset-4 grid place-items-center rounded-xl bg-white/95 p-6 text-center text-sm text-red-700"
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
        {/* Mobile */}
        <span className="sm:hidden">
          Tap to select · {radiusMeters.toLocaleString()} m
        </span>

        {/* Desktop */}
        <span className="hidden sm:inline">
          Click the map to select a location · {radiusMeters.toLocaleString()} m
          radius
        </span>
      </div>
    </div>
  );
}

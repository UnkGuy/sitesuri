"""Location features for a searched point.

The scoring service needs every location-table input (§4.3) for the point being scored. Until
real OSM / PostGIS layers exist, NearestSiteProvider matches the point to the nearest site in
the location table, which is the matching rule spec §11 item 7 asks for ("an address is not a
counting point"). A real provider only has to return the same fields from `lookup`.
"""

from __future__ import annotations

import math
from pathlib import Path

import numpy as np
import pandas as pd

from .model import BUSINESS_TYPES, LOCATION_COLUMNS, OPTIONAL_LOCATION_COLUMNS, competitor_column

EARTH_RADIUS_M = 6_371_000.0
REQUIRED_SITE_FIELDS = LOCATION_COLUMNS + [competitor_column(b) for b in BUSINESS_TYPES]


class OutsideCoverageError(LookupError):
    """The point is too far from every site with data."""

    def __init__(self, distance_m: float, max_distance_m: float):
        self.distance_m, self.max_distance_m = distance_m, max_distance_m
        super().__init__(f"no site with data within {max_distance_m:.0f} m (nearest is {distance_m:.0f} m away); "
                         "the pilot covers parts of Manila and Quezon City only")


def haversine_m(lat1, lon1, lat2, lon2) -> np.ndarray:
    lat1, lon1, lat2, lon2 = (np.radians(np.asarray(v, dtype=float)) for v in (lat1, lon1, lat2, lon2))
    a = np.sin((lat2 - lat1) / 2) ** 2 + np.cos(lat1) * np.cos(lat2) * np.sin((lon2 - lon1) / 2) ** 2
    return 2 * EARTH_RADIUS_M * np.arcsin(np.sqrt(a))


class NearestSiteProvider:
    """Features of the nearest site in a location table, within `max_distance_m`."""

    def __init__(self, locations: pd.DataFrame, max_distance_m: float = 500.0):
        missing = [c for c in REQUIRED_SITE_FIELDS if c not in locations.columns]
        if missing:
            raise ValueError(f"location table is missing columns: {', '.join(missing)}")
        self.locations = locations.copy()
        for column in OPTIONAL_LOCATION_COLUMNS:
            if column not in self.locations.columns:
                self.locations[column] = np.nan
        self.max_distance_m = max_distance_m
        self._lat = self.locations["latitude"].to_numpy(dtype=float)
        self._lon = self.locations["longitude"].to_numpy(dtype=float)

    @classmethod
    def from_csv(cls, path: str | Path, max_distance_m: float = 500.0) -> "NearestSiteProvider":
        return cls(pd.read_csv(path, dtype={"location_id": str, "spatial_block_id": str}), max_distance_m)

    def lookup(self, latitude: float, longitude: float) -> tuple[dict, dict]:
        """Return (site features, match info). Raises OutsideCoverageError when nothing is close enough."""
        if not (math.isfinite(latitude) and math.isfinite(longitude)):
            raise ValueError("latitude and longitude must be finite numbers")
        distances = haversine_m(latitude, longitude, self._lat, self._lon)
        i = int(np.argmin(distances))
        if distances[i] > self.max_distance_m:
            raise OutsideCoverageError(float(distances[i]), self.max_distance_m)
        site = self.locations.iloc[i].to_dict()
        return site, {"location_id": site["location_id"], "distance_m": round(float(distances[i]), 1),
                      "method": "nearest site in the location table"}

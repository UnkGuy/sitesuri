"""Feature preparation: loading and checking the input tables (spec §4), the time grid used to
average predictions at scoring time (§5.4), and the location features for a searched point.

Until real OSM / PostGIS layers exist, NearestSiteProvider matches a point to the nearest site in
the location table, the matching rule spec §11 item 7 asks for ("an address is not a counting
point"). A real provider only has to return the same fields from `lookup`.
"""

from __future__ import annotations

import calendar
import itertools
import math
from pathlib import Path

import numpy as np
import pandas as pd

from .config import (BUSINESS_TYPES, CONGESTION_FEATURE, LOCATION_COLUMNS, LOCATION_FEATURES, LOCATION_TYPES,
                     MODEL_FEATURES, OPTIONAL_LOCATION_COLUMNS, PAYDAY_DAYS, TARGET, TRAINING_COLUMNS,
                     TRAINING_HOURS, competitor_column)

# ---------------------------------------------------------------------------
# Input tables (§4.2, §4.3)
# ---------------------------------------------------------------------------

def _require(df: pd.DataFrame, columns: list[str], what: str) -> None:
    missing = [c for c in columns if c not in df.columns]
    if missing:
        raise SystemExit(f"{what} is missing columns: {', '.join(missing)}")


def _check_location_types(df: pd.DataFrame, what: str) -> None:
    unknown = sorted(set(df["location_type"]) - set(LOCATION_TYPES))
    if unknown:
        raise SystemExit(f"{what} has unknown location_type values {unknown}; expected {list(LOCATION_TYPES)}")


def load_training_table(path: str, source_type: str | None = None) -> pd.DataFrame:
    df = pd.read_csv(path, parse_dates=["period_start"], dtype={"location_id": str, "spatial_block_id": str})
    _require(df, TRAINING_COLUMNS, f"training table {path}")
    if source_type:
        df = df[df["source_type"] == source_type]
        if df.empty:
            raise SystemExit(f"no training rows with source_type = {source_type!r}")
    _check_location_types(df, "training table")
    if not df["hour"].isin(TRAINING_HOURS).all():
        raise SystemExit(f"training table has hours outside {TRAINING_HOURS[0]}-{TRAINING_HOURS[-1]}")
    if df[MODEL_FEATURES + [TARGET]].isna().any().any():
        raise SystemExit("training table has missing values in model features or the target")
    if (df[TARGET] < 0).any():
        raise SystemExit("pedestrian_count must be non-negative")
    return df[TRAINING_COLUMNS].reset_index(drop=True)


def load_location_table(path: str, business_types: tuple[str, ...]) -> pd.DataFrame:
    df = pd.read_csv(path, dtype={"location_id": str, "spatial_block_id": str})
    _require(df, LOCATION_COLUMNS + [competitor_column(b) for b in business_types], f"location table {path}")
    _check_location_types(df, "location table")
    for column in OPTIONAL_LOCATION_COLUMNS:
        if column not in df.columns:
            df[column] = np.nan
    return df


def load_rain_climatology(path: str) -> pd.DataFrame:
    """CSV with columns month, hour, rainfall_mm (climatological hourly average)."""
    df = pd.read_csv(path)
    _require(df, ["month", "hour", "rainfall_mm"], f"rain climatology {path}")
    return df[["month", "hour", "rainfall_mm"]].astype({"month": int, "hour": int, "rainfall_mm": float})


# ---------------------------------------------------------------------------
# Scoring-time features (§5.4)
# ---------------------------------------------------------------------------

def payday_share(month: int) -> float:
    """Share of a month's days inside the payday window (non-leap reference year)."""
    n_days = calendar.monthrange(2027, month)[1]
    return sum(1 for d in PAYDAY_DAYS if d <= n_days) / n_days


def typical_congestion(df: pd.DataFrame) -> pd.DataFrame:
    """Typical congestion by location type, hour and weekday, for scoring with --use-congestion."""
    return df.groupby(["location_type", "hour", "day_of_week"])[CONGESTION_FEATURE].median().reset_index()


def build_scoring_grid(sites: pd.DataFrame, days, hours, months, rain_clim: pd.DataFrame,
                       congestion: pd.DataFrame | None = None) -> pd.DataFrame:
    """Every (site, month, weekday, hour, payday state) to predict at scoring time (§5.4).

    rainfall_mm is the climatological average for the month and hour; the payday window enters as
    an expectation, with `weight` the share of the month's days inside (payday = 1) or outside it.
    """
    unknown_hours = sorted(set(hours) - set(TRAINING_HOURS))
    if unknown_hours:
        raise SystemExit(f"opening hours {unknown_hours} are outside the trained hours {TRAINING_HOURS[0]}-{TRAINING_HOURS[-1]}")
    time = pd.DataFrame(list(itertools.product(months, days, hours, (0, 1))),
                        columns=["month", "day_of_week", "hour", "is_payday_window"])
    share = time["month"].map(payday_share)
    time["weight"] = np.where(time["is_payday_window"] == 1, share, 1 - share)
    time["is_weekend"] = (time["day_of_week"] >= 5).astype(int)
    time = time.merge(rain_clim, on=["month", "hour"], how="left", validate="many_to_one")
    if time["rainfall_mm"].isna().any():
        raise SystemExit("rain climatology is missing some (month, hour) pairs needed for scoring")

    grid = sites[["location_id"] + LOCATION_FEATURES].merge(time, how="cross")
    if congestion is not None:
        grid = grid.merge(congestion, on=["location_type", "hour", "day_of_week"], how="left")
        grid[CONGESTION_FEATURE] = grid[CONGESTION_FEATURE].fillna(congestion[CONGESTION_FEATURE].median())
    return grid


# ---------------------------------------------------------------------------
# Location features for a searched point
# ---------------------------------------------------------------------------

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

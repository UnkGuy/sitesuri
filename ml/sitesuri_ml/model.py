#!/usr/bin/env python3
"""MSME Location Opportunity Score: reference implementation of architecture revision 2.

Implements model_architecture_v2.md (revision 2, 22 Oct 2026), Manila / Quezon City pilot:

  §4    21-column training table and the location table (synthetic generator per §10.1)
  §5    XGBoost Poisson pedestrian model, chronological + block-grouped spatial validation,
        averaging over opening hours and seasons, scaling to a 0-100 component score
  §6    Business fit, asymmetric competition, walkability (rule-based)
  §7    Safety and hazard component
  §8    Gated aggregation (weighted geometric mean with floor), hard caps, flags, scores.json
  §10.4 Sensitivity test

Every number in PARAMS, TYPE_PROFILES, TRAFFIC_PROFILES and the weather tables is a placeholder
or an assumption from the spec, not a calibrated value. Synthetic data contains only the
relationships planted in it: a run shows that the pipeline works, not that the score is right.

Usage (from the ml/ folder):
  python -m sitesuri_ml.model selftest                      # check formulas against the spec's worked examples
  python -m sitesuri_ml.model generate --out-dir data/synthetic
  python -m sitesuri_ml.model run --out-dir artifacts --data-dir data/synthetic
  python -m sitesuri_ml.model run --training-csv training.csv --locations-csv locations.csv \
      --rain-climatology-csv rain.csv --out-dir artifacts  # same pipeline on supplied data

`run` writes everything sitesuri_ml.service needs to score a searched location on demand:
pedestrian_model.json, scoring_config.json, locations.csv and rain_climatology.csv.
"""

from __future__ import annotations

import argparse
import calendar
import copy
import itertools
import json
import math
import sys
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Mapping

import numpy as np
import pandas as pd

try:
    import xgboost as xgb
except ImportError:  # `selftest` and `generate` run without xgboost
    xgb = None

SPEC = "model_architecture_v2.md, revision 2 (22 Oct 2026)"

# ---------------------------------------------------------------------------
# Schema (§4.2, §4.3)
# ---------------------------------------------------------------------------

TRAINING_COLUMNS = [
    "location_id", "spatial_block_id", "period_start", "latitude", "longitude",
    "location_type", "hour", "day_of_week", "is_weekend", "is_payday_window", "rainfall_mm",
    "nearby_school_count", "nearby_market_count", "nearby_office_count", "nearby_shop_count",
    "nearby_transport_stop_count", "nearest_transport_distance_m", "population_density_500m",
    "vehicle_congestion_index", "pedestrian_count", "source_type",
]
TIME_FEATURES = ["hour", "day_of_week", "is_weekend", "is_payday_window", "rainfall_mm"]
LOCATION_FEATURES = [
    "location_type", "nearby_school_count", "nearby_market_count", "nearby_office_count",
    "nearby_shop_count", "nearby_transport_stop_count", "nearest_transport_distance_m",
    "population_density_500m",
]
MODEL_FEATURES = TIME_FEATURES + LOCATION_FEATURES  # the 13 features of §4.2
CONGESTION_FEATURE = "vehicle_congestion_index"      # optional 14th feature
TARGET = "pedestrian_count"

LOCATION_TYPES = ("commercial_street", "transit_hub", "residential", "school_zone", "market_area")
LOCATION_TYPE_DTYPE = pd.CategoricalDtype(list(LOCATION_TYPES))
POI_TYPES = ("school", "market", "office", "shop")
BUSINESS_TYPES = ("food stall", "sari-sari store", "general retail")

TRAINING_HOURS = tuple(range(6, 22))              # 16 hourly interval starts, 06:00-21:00 (assumption)
PAYDAY_DAYS = frozenset({1, 14, 15, 16, 29, 30, 31})  # around 15th/30th paydays (assumption)
DRY_MONTHS = (12, 1, 2, 3, 4, 5)                  # (assumption)
WET_MONTHS = (6, 7, 8, 9, 10, 11)

LOCATION_COLUMNS = [
    "location_id", "spatial_block_id", "latitude", "longitude", *LOCATION_FEATURES,
    "sidewalk", "paved", "crossing", "lit_share",
    "flood_hazard_class", "dist_waterway_m", "dist_fault_m", "liquefaction_class",
    "crime_pct_rank", "dist_police_m", "dist_fire_station_m", "dist_hospital_m",
]
OPTIONAL_LOCATION_COLUMNS = ["address", "flood_events_5y", "hazard_source", "source_type"]


def competitor_column(business_type: str) -> str:
    """Location-table column holding competitors of `business_type` within 200 m."""
    return "competitors_" + "".join(ch if ch.isalnum() else "_" for ch in business_type.lower())


COMPONENT_NAMES = {
    "ped": "Predicted pedestrian activity",
    "fit": "Business fit",
    "comp": "Competition suitability",
    "walk": "Walkability",
    "safety": "Safety and hazard",
}
FLOOD_CLASS_NAMES = {0: "none", 1: "low", 2: "medium", 3: "high"}

# ---------------------------------------------------------------------------
# Score parameters (§6-§8, registry in §9). All values are placeholders.
# ---------------------------------------------------------------------------

PARAMS = {
    "weights": {"ped": 0.30, "fit": 0.20, "comp": 0.20, "walk": 0.15, "safety": 0.15},
    "geo_floor": 5.0,
    "caps": {
        "low_ped_below": 20.0,       # s_ped below this ...
        "low_ped_cap": 50.0,         # ... caps S at this
        "high_flood_cap": 55.0,      # flood_hazard_class = 3 caps S at this
        "seismic_fault_m": 100.0,    # flag only
        "crowded_comp_below": 20.0,  # flag only
    },
    # Ideal POI mix v_j(b); each row sums to 1 (§6.1)
    "business_fit": {
        "food stall":      {"school": 0.30, "market": 0.15, "office": 0.35, "shop": 0.20},
        "sari-sari store": {"school": 0.20, "market": 0.20, "office": 0.15, "shop": 0.45},
        "general retail":  {"school": 0.10, "market": 0.25, "office": 0.20, "shop": 0.45},
    },
    # Asymmetric Gaussian: c*, tolerance for too few (left) and too many (right) competitors (§6.2)
    "competition": {
        "food stall":      {"c_star": 4.0, "sigma_left": 3.5, "sigma_right": 2.0},
        "sari-sari store": {"c_star": 3.0, "sigma_left": 3.0, "sigma_right": 1.8},
        "general retail":  {"c_star": 3.0, "sigma_left": 3.0, "sigma_right": 1.8},
    },
    "walkability": {"sidewalk": 50.0, "paved": 30.0, "crossing": 20.0},
    "safety": {
        "flood_class_score": {0: 100.0, 1: 75.0, 2: 40.0, 3: 10.0},
        "waterway_near_m": 100.0,
        "waterway_penalty": 15.0,
        "flood_event_penalty": 5.0,
        "flood_event_max": 3.0,
        "fault_full_m": 500.0,
        "liquefaction_score": {0: 100.0, 1: 80.0, 2: 30.0},
        "emergency_full_m": {"police": 1000.0, "fire": 3000.0, "hospital": 3000.0},
        "sub_weights": {"flood": 0.40, "crime": 0.15, "light": 0.20, "quake": 0.15, "emerg": 0.10},
        "high_flood_cap": 40.0,
    },
}

# Score bands are not defined in the spec (§8.3). These exist only so the sensitivity test can
# count band changes (§10.4); they are not written to scores.json.
PLACEHOLDER_BANDS = ((70.0, "High"), (45.0, "Medium"), (0.0, "Low"))


def _normalised_group(path: tuple) -> bool:
    """Parameter groups that must sum to 1, renormalised after a perturbation."""
    parent = path[:-1]
    return parent in {("weights",), ("safety", "sub_weights")} or (len(parent) == 2 and parent[0] == "business_fit")


def load_params(raw: Mapping) -> dict:
    """PARAMS read back from JSON, where the class-score keys became strings."""
    params = copy.deepcopy(dict(raw))
    for key in ("flood_class_score", "liquefaction_score"):
        params["safety"][key] = {int(k): v for k, v in params["safety"][key].items()}
    check_params(params)
    return params


def check_params(params: Mapping) -> None:
    def close_to_one(values, what):
        if abs(sum(values) - 1.0) > 1e-6:
            raise ValueError(f"{what} must sum to 1, got {sum(values):.4f}")

    close_to_one(params["weights"].values(), "component weights")
    close_to_one(params["safety"]["sub_weights"].values(), "safety sub-weights")
    for b, mix in params["business_fit"].items():
        close_to_one(mix.values(), f"business-fit mix for {b!r}")

# ---------------------------------------------------------------------------
# Pedestrian model settings (§5.2-§5.4)
# ---------------------------------------------------------------------------

XGB_PARAMS = {
    "n_estimators": 400,
    "learning_rate": 0.05,
    "max_depth": 4,           # shallow: only ~100 distinct location profiles
    "min_child_weight": 20,   # stops leaves built from one location's rows
    "subsample": 0.8,
    "colsample_bytree": 0.8,
    "reg_lambda": 5.0,
    "tree_method": "hist",
    "enable_categorical": True,
}
TWEEDIE_VARIANCE_POWER = 1.3  # (assumption) only used with --objective reg:tweedie
REFERENCE_SCHEDULE = {"days": tuple(range(7)), "hours": tuple(range(8, 20)), "months": tuple(range(1, 13))}
PED_BOUND_PERCENTILES = (5, 95)
RANGE_QUANTILES = (0.10, 0.90)


@dataclass
class PedConfig:
    objective: str = "count:poisson"
    monotone_rain: bool = False
    use_congestion: bool = False
    train_days: int = 63
    n_folds: int = 5
    seed: int = 42
    open_days: tuple = REFERENCE_SCHEDULE["days"]
    open_hours: tuple = REFERENCE_SCHEDULE["hours"]
    months: tuple = REFERENCE_SCHEDULE["months"]
    scale: str = "linear"          # "log" applies the scaling to log(1 + P̄)
    bounds: tuple | None = None    # fixed (P_lo, P_hi) from an earlier run
    xgb_params: dict = field(default_factory=lambda: dict(XGB_PARAMS))


class PedestrianModel:
    """XGBoost regressor for expected pedestrians per hour, log link (§5.1)."""

    def __init__(self, cfg: PedConfig):
        if xgb is None:
            raise SystemExit("the pedestrian model needs xgboost and scikit-learn: pip install xgboost scikit-learn")
        self.features = MODEL_FEATURES + ([CONGESTION_FEATURE] if cfg.use_congestion else [])
        # Closer to transit should never reduce traffic; POI counts stay unconstrained (§5.2)
        monotone = {"nearest_transport_distance_m": -1}
        if cfg.monotone_rain:
            monotone["rainfall_mm"] = -1
        params = dict(cfg.xgb_params, objective=cfg.objective, random_state=cfg.seed,
                      monotone_constraints="(" + ",".join(str(monotone.get(f, 0)) for f in self.features) + ")")
        if cfg.objective == "reg:tweedie":
            params["tweedie_variance_power"] = TWEEDIE_VARIANCE_POWER
        self.model = xgb.XGBRegressor(**params)

    @classmethod
    def load(cls, path: str | Path, cfg: PedConfig) -> "PedestrianModel":
        """Load a model saved by `run`; `cfg` must match the settings it was trained with."""
        model = cls(cfg)
        model.model.load_model(str(path))
        return model

    def _matrix(self, df: pd.DataFrame) -> pd.DataFrame:
        X = df[self.features].copy()
        X["location_type"] = X["location_type"].astype(LOCATION_TYPE_DTYPE)
        return X

    def fit(self, df: pd.DataFrame) -> "PedestrianModel":
        self.model.fit(self._matrix(df), df[TARGET].to_numpy(dtype=float))
        return self

    def predict(self, df: pd.DataFrame) -> np.ndarray:
        """λ̂ = exp(F(x)), expected pedestrians per hour."""
        return self.model.predict(self._matrix(df)).astype(float)

# ---------------------------------------------------------------------------
# Geometry: local equirectangular projection, adequate over a ~15 km pilot area
# ---------------------------------------------------------------------------

ORIGIN = (14.63, 121.02)  # lat, lon
M_PER_DEG_LAT = 110_574.0
M_PER_DEG_LON = 111_320.0 * math.cos(math.radians(ORIGIN[0]))
EXTENT_M = (-5000.0, 5000.0, -6500.0, 6500.0)  # x_min, x_max, y_min, y_max of the synthetic area


def to_latlon(x: np.ndarray, y: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    return ORIGIN[0] + np.asarray(y) / M_PER_DEG_LAT, ORIGIN[1] + np.asarray(x) / M_PER_DEG_LON


def dist_to_polyline(x: np.ndarray, y: np.ndarray, line: np.ndarray) -> np.ndarray:
    p = np.column_stack([x, y])[:, None, :]
    a, ab = line[:-1][None], (line[1:] - line[:-1])[None]
    t = np.clip(((p - a) * ab).sum(-1) / (ab * ab).sum(-1), 0.0, 1.0)
    return np.linalg.norm(p - (a + t[..., None] * ab), axis=-1).min(axis=1)


def dist_to_points(x: np.ndarray, y: np.ndarray, points: np.ndarray) -> np.ndarray:
    return np.hypot(x[:, None] - points[None, :, 0], y[:, None] - points[None, :, 1]).min(axis=1)


def smooth_field(x: np.ndarray, y: np.ndarray, rng: np.random.Generator,
                 n_bumps: int = 12, length_m: float = 2000.0) -> np.ndarray:
    """Spatially correlated random field (sum of Gaussian bumps), standardised over the points."""
    x0, x1, y0, y1 = EXTENT_M
    cx, cy = rng.uniform(x0, x1, n_bumps), rng.uniform(y0, y1, n_bumps)
    amp = rng.normal(0.0, 1.0, n_bumps)
    d2 = (x[:, None] - cx) ** 2 + (y[:, None] - cy) ** 2
    f = (amp * np.exp(-d2 / (2 * length_m ** 2))).sum(axis=1)
    return (f - f.mean()) / (f.std() or 1.0)

# ---------------------------------------------------------------------------
# Synthetic data (§10.1). Not evidence about real places.
# ---------------------------------------------------------------------------

@dataclass(frozen=True)
class PlantedEffects:
    """Effects planted in the synthetic traffic target, checked for recovery in §10.2."""
    payday_uplift: float = 1.10
    rain_per_mm: float = -0.01       # multiplier exp(-0.01 · rain_mm)
    transit_per_m: float = -0.0006   # multiplier exp(-0.0006 · nearest_transport_distance_m)
    site_sigma: float = 0.25         # unobserved site effect, log scale
    day_sigma: float = 0.10          # location-day noise, log scale
    gamma_shape: float = 8.0         # row-level gamma noise -> overdispersion


# Location features by type: mean POI counts within 200 m, transit stops, density (/km²),
# probabilities of sidewalk / paved / crossing, and a lighting offset.
TYPE_PROFILES = {
    "commercial_street": {"school": 0.8, "market": 0.8, "office": 4.0, "shop": 12.0, "stops": 2.5,
                          "density": 18_000, "sidewalk": 0.85, "paved": 0.95, "crossing": 0.60, "lit": 0.10},
    "transit_hub":       {"school": 0.5, "market": 1.0, "office": 3.0, "shop": 10.0, "stops": 6.0,
                          "density": 15_000, "sidewalk": 0.80, "paved": 0.95, "crossing": 0.75, "lit": 0.10},
    "residential":       {"school": 0.7, "market": 0.4, "office": 0.5, "shop": 4.0, "stops": 0.8,
                          "density": 38_000, "sidewalk": 0.40, "paved": 0.75, "crossing": 0.20, "lit": -0.10},
    "school_zone":       {"school": 3.0, "market": 0.5, "office": 1.0, "shop": 6.0, "stops": 1.5,
                          "density": 26_000, "sidewalk": 0.65, "paved": 0.90, "crossing": 0.60, "lit": 0.00},
    "market_area":       {"school": 0.6, "market": 3.5, "office": 1.0, "shop": 14.0, "stops": 2.5,
                          "density": 30_000, "sidewalk": 0.55, "paved": 0.85, "crossing": 0.40, "lit": 0.00},
}
DOMINANT_TYPE_PROBS = (0.25, 0.15, 0.25, 0.15, 0.20)

# Traffic by type: weekday mean pedestrians/hour, hourly peaks (hour, width, amplitude),
# Saturday/Sunday multipliers, base congestion index.
TRAFFIC_PROFILES = {
    "commercial_street": {"base": 110, "peaks": ((12, 2.5, 0.8), (18, 2.0, 0.9)), "weekend": (1.15, 1.05), "congestion": 55},
    "transit_hub":       {"base": 150, "peaks": ((7, 1.3, 1.4), (18, 1.5, 1.3)), "weekend": (0.75, 0.60), "congestion": 65},
    "residential":       {"base": 40,  "peaks": ((7, 1.5, 0.8), (18, 2.0, 0.8)), "weekend": (1.10, 1.15), "congestion": 30},
    "school_zone":       {"base": 70,  "peaks": ((7, 1.0, 1.6), (12, 1.0, 0.6), (16, 1.0, 1.3)), "weekend": (0.35, 0.25), "congestion": 40},
    "market_area":       {"base": 120, "peaks": ((7, 1.8, 1.3), (17, 2.0, 0.6)), "weekend": (1.20, 1.10), "congestion": 50},
}
# Log-scale POI effects; offices and schools empty out on weekends, so the sign flips (§5.2).
POI_EFFECTS = {
    "weekday": {"office": 0.05, "school": 0.04, "market": 0.04, "shop": 0.020, "stops": 0.04},
    "weekend": {"office": -0.03, "school": -0.01, "market": 0.05, "shop": 0.025, "stops": 0.03},
}
DENSITY_ELASTICITY = 0.15

# Synthetic weather generator (placeholder climatology, loosely shaped like Manila's
# dry season Dec-May and wet season Jun-Nov with afternoon storms).
RAIN_DAY_PROB = {1: 0.10, 2: 0.07, 3: 0.07, 4: 0.10, 5: 0.30, 6: 0.55,
                 7: 0.70, 8: 0.72, 9: 0.65, 10: 0.50, 11: 0.35, 12: 0.20}
RAIN_INTENSITY_MM_H = {1: 2.0, 2: 2.0, 3: 2.0, 4: 3.0, 5: 5.0, 6: 6.0,
                       7: 7.0, 8: 7.0, 9: 6.0, 10: 5.0, 11: 4.0, 12: 3.0}
_storm_weights = np.ones(24)
_storm_weights[13:19] += 4.0
STORM_START_WEIGHTS = _storm_weights / _storm_weights.sum()
RAIN_BLOCK_SIGMA = 0.3

# Synthetic hazard geometry, metres from ORIGIN: a sinuous river plus three creeks (esteros)
_river_x = np.linspace(-7000, 7000, 57)
WATERWAYS_XY = [
    np.column_stack([_river_x, 1800 * np.sin(_river_x / 2600) - 800]),
    np.array([[-3500.0, 6500.0], [-3000.0, 3000.0], [-3600.0, 0.0], [-3200.0, -1500.0]]),
    np.array([[1500.0, 6500.0], [1000.0, 3500.0], [1800.0, 1000.0], [1200.0, -1200.0]]),
    np.array([[-1000.0, -6500.0], [-600.0, -4000.0], [-1200.0, -2200.0]]),
]
FAULT_XY = np.array([[3200.0, -8000.0], [4300.0, 0.0], [5200.0, 8000.0]])
FLOOD_EVENT_MEAN = {0: 0.1, 1: 0.6, 2: 1.5, 3: 3.0}
RIVERSIDE_BLOCK_SHARE = 0.3
LIQUEFACTION_QUANTILES = (0.60, 0.85)  # ~60% low, 25% moderate, 15% high
FACILITY_COUNTS = {"police": 25, "fire_station": 10, "hospital": 8}
SYNTHETIC_HAZARD_SOURCE = "synthetic hazard layer, prototype"


def simulate_rainfall(dates: pd.DatetimeIndex, rng: np.random.Generator) -> np.ndarray:
    """City-wide hourly rainfall (mm), shape (n_days, 24)."""
    rain = np.zeros((len(dates), 24))
    for i, month in enumerate(dates.month):
        if rng.random() >= RAIN_DAY_PROB[month]:
            continue
        for _ in range(1 + rng.binomial(1, 0.4)):
            start = rng.choice(24, p=STORM_START_WEIGHTS)
            for h in range(start, min(start + min(rng.geometric(0.45), 5), 24)):
                rain[i, h] += rng.exponential(RAIN_INTENSITY_MM_H[month])
    return rain


def synthetic_rain_climatology(years: int = 40, seed: int = 2026) -> pd.DataFrame:
    """Average hourly rainfall by (month, hour) under the synthetic weather generator."""
    dates = pd.date_range("2001-01-01", periods=365 * years, freq="D")
    rain = simulate_rainfall(dates, np.random.default_rng(seed))[:, list(TRAINING_HOURS)]
    frame = pd.DataFrame(rain, columns=list(TRAINING_HOURS)).assign(month=dates.month)
    return (frame.groupby("month").mean().reset_index()
            .melt(id_vars="month", var_name="hour", value_name="rainfall_mm")
            .astype({"hour": int}))


def generate_location_table(rng: np.random.Generator, n_blocks: int = 20, sites_per_block: int = 5) -> pd.DataFrame:
    """100 synthetic sites in 20 synthetic barangays, with every location-table input (§4.3)."""
    x0, x1, y0, y1 = EXTENT_M
    cx, cy = rng.uniform(x0 + 500, x1 - 500, n_blocks), rng.uniform(y0 + 500, y1 - 500, n_blocks)
    # Some barangays sit along a waterway, as many in Manila do along esteros
    for b in np.flatnonzero(rng.random(n_blocks) < RIVERSIDE_BLOCK_SHARE):
        line = WATERWAYS_XY[rng.integers(len(WATERWAYS_XY))]
        k = rng.integers(len(line) - 1)
        px, py = line[k] + rng.random() * (line[k + 1] - line[k])
        cx[b] = np.clip(px + rng.normal(0, 150), x0 + 500, x1 - 500)
        cy[b] = np.clip(py + rng.normal(0, 150), y0 + 500, y1 - 500)
    dominant =rng.choice(len(LOCATION_TYPES), size=n_blocks, p=DOMINANT_TYPE_PROBS)
    poi_mult = rng.lognormal(0.0, 0.3, n_blocks)
    density_mult = rng.lognormal(0.0, 0.2, n_blocks)

    rows = []
    for b in range(n_blocks):
        for _ in range(sites_per_block):
            ltype = LOCATION_TYPES[dominant[b] if rng.random() < 0.6 else rng.integers(len(LOCATION_TYPES))]
            prof = TYPE_PROFILES[ltype]
            stops = int(rng.poisson(prof["stops"] * poi_mult[b]))
            # A stop within 200 m means the nearest stop is at most 200 m away; more stops, closer.
            dist = 15 + 185 * rng.beta(1.5, 1 + stops) if stops else min(200 + rng.lognormal(math.log(250), 0.6), 2500)
            rows.append({
                "block": b, "location_type": ltype,
                "x": cx[b] + rng.normal(0, 150), "y": cy[b] + rng.normal(0, 150),
                **{f"nearby_{j}_count": int(rng.poisson(prof[j] * poi_mult[b])) for j in POI_TYPES},
                "nearby_transport_stop_count": stops,
                "nearest_transport_distance_m": round(dist, 1),
                "population_density_500m": round(prof["density"] * density_mult[b] * rng.lognormal(0.0, 0.15)),
            })
    loc = pd.DataFrame(rows)
    n, block = len(loc), loc["block"].to_numpy()
    x, y = loc["x"].to_numpy(), loc["y"].to_numpy()
    profile = lambda key: loc["location_type"].map(lambda t: TYPE_PROFILES[t][key]).to_numpy()

    lat, lon = to_latlon(x, y)
    loc["location_id"] = [f"LOC{i + 1:03d}" for i in range(n)]
    loc["spatial_block_id"] = [f"BRGY-S{b + 1:02d}" for b in block]
    loc["address"] = [f"Synthetic site {i + 1:03d}, Brgy. S{b + 1:02d}, {'Quezon City' if yy > 0 else 'Manila'}"
                      for i, (b, yy) in enumerate(zip(block, y))]
    loc["latitude"], loc["longitude"] = lat.round(6), lon.round(6)

    # Walkability (OSM-tag stand-ins)
    for key in ("sidewalk", "paved", "crossing"):
        loc[key] = (rng.random(n) < profile(key)).astype(int)

    # Flood: distance to a synthetic waterway plus low elevation, so hazard is spatially clustered
    d_water = np.min([dist_to_polyline(x, y, line) for line in WATERWAYS_XY], axis=0)
    elevation = 2 + 14 * (y - y0) / (y1 - y0) + 2.5 * smooth_field(x, y, rng)
    flood_risk = 1.6 * np.exp(-d_water / 400) + np.clip((7 - elevation) / 5, 0, None)
    loc["flood_hazard_class"] = np.digitize(flood_risk, [0.4, 0.8, 1.25])
    loc["dist_waterway_m"] = d_water.round(1)
    loc["flood_events_5y"] = rng.poisson([FLOOD_EVENT_MEAN[c] for c in loc["flood_hazard_class"]])

    # Earthquake: one synthetic fault line; liquefaction from a smooth field plus low, wet ground
    loc["dist_fault_m"] = dist_to_polyline(x, y, FAULT_XY).round(1)
    liq_index = smooth_field(x, y, rng) + 0.8 * np.clip((6 - elevation) / 4, 0, None) + 0.6 * np.exp(-d_water / 500)
    loc["liquefaction_class"] = np.digitize(liq_index, np.quantile(liq_index, LIQUEFACTION_QUANTILES))

    # Crime (barangay level -> percentile across the study area), lighting, emergency access
    incident_rate = rng.lognormal(math.log(1.5), 0.5, n_blocks)[block]
    loc["crime_pct_rank"] = pd.Series(incident_rate).rank(pct=True).round(3).to_numpy()
    loc["lit_share"] = np.clip(rng.beta(5, 2.5, n_blocks)[block] + profile("lit") + rng.normal(0, 0.08, n), 0, 1).round(2)
    for name, count in FACILITY_COUNTS.items():
        points = np.column_stack([rng.uniform(x0 - 1000, x1 + 1000, count), rng.uniform(y0 - 1000, y1 + 1000, count)])
        loc[f"dist_{name}_m"] = dist_to_points(x, y, points).round(1)

    # Competitors: Poisson with a mean that rises with nearby shops, by business type
    shops, schools = loc["nearby_shop_count"].to_numpy(), loc["nearby_school_count"].to_numpy()
    competitor_mean = {
        "food stall": 0.5 + 0.30 * shops + 0.30 * schools,
        "sari-sari store": 0.6 + 0.15 * shops + 1.2 * (loc["location_type"] == "residential").to_numpy(),
        "general retail": 0.3 + 0.22 * shops,
    }
    for b, mean in competitor_mean.items():
        loc[competitor_column(b)] = rng.poisson(mean)

    loc["hazard_source"] = SYNTHETIC_HAZARD_SOURCE
    loc["source_type"] = "synthetic"
    ordered = (["location_id", "address"] + [c for c in LOCATION_COLUMNS if c != "location_id"]
               + ["flood_events_5y"] + [competitor_column(b) for b in BUSINESS_TYPES] + ["hazard_source", "source_type"])
    return loc[ordered]


def _hourly_shape(location_type: str, hours: np.ndarray) -> np.ndarray:
    shape = 0.35 + sum(a * np.exp(-(hours - c) ** 2 / (2 * w * w)) for c, w, a in TRAFFIC_PROFILES[location_type]["peaks"])
    return shape / shape.mean()


def _poi_multiplier(locations: pd.DataFrame, period: str) -> np.ndarray:
    coef = POI_EFFECTS[period]
    log_effect = sum(coef[j] * locations[f"nearby_{j}_count"].to_numpy() for j in POI_TYPES)
    return np.exp(log_effect + coef["stops"] * locations["nearby_transport_stop_count"].to_numpy())


def generate_training_table(locations: pd.DataFrame, rng: np.random.Generator, start_date: str = "2026-05-01",
                            n_days: int = 90, planted: PlantedEffects = PlantedEffects()) -> pd.DataFrame:
    """The 21-column training table (§4.2): one row per location and hourly interval."""
    n_loc, hours = len(locations), np.array(TRAINING_HOURS)
    dates = pd.date_range(start_date, periods=n_days, freq="D")
    dow = dates.dayofweek.to_numpy()
    weekend = (dow >= 5).astype(int)
    payday = np.isin(dates.day, list(PAYDAY_DAYS)).astype(int)

    # Weather: city-wide storms, scaled per barangay and day (mean multiplier 1)
    _, block_idx = np.unique(locations["spatial_block_id"].to_numpy(), return_inverse=True)
    block_mult = rng.lognormal(-RAIN_BLOCK_SIGMA ** 2 / 2, RAIN_BLOCK_SIGMA, (block_idx.max() + 1, n_days))
    city_rain = simulate_rainfall(dates, rng)[:, hours]
    rain = np.round(city_rain[None] * block_mult[block_idx][:, :, None], 1)  # (loc, day, hour)

    types = locations["location_type"].to_numpy()
    base = np.array([TRAFFIC_PROFILES[t]["base"] for t in types], dtype=float)
    shape = np.stack([_hourly_shape(t, hours) for t in types])
    day_mult = np.stack([np.r_[np.ones(5), TRAFFIC_PROFILES[t]["weekend"]] for t in types])[:, dow]
    poi = np.where(weekend[None, :], _poi_multiplier(locations, "weekend")[:, None],
                   _poi_multiplier(locations, "weekday")[:, None])
    dist = locations["nearest_transport_distance_m"].to_numpy()
    density = locations["population_density_500m"].to_numpy()
    site = (np.exp(planted.transit_per_m * dist) * (density / 25_000) ** DENSITY_ELASTICITY
            * rng.lognormal(-planted.site_sigma ** 2 / 2, planted.site_sigma, n_loc))
    noise_day = rng.lognormal(-planted.day_sigma ** 2 / 2, planted.day_sigma, (n_loc, n_days))

    lam = (base[:, None, None] * shape[:, None, :] * (day_mult * poi * noise_day)[:, :, None]
           * np.where(payday, planted.payday_uplift, 1.0)[None, :, None]
           * np.exp(planted.rain_per_mm * rain) * site[:, None, None])
    lam *= rng.gamma(planted.gamma_shape, 1 / planted.gamma_shape, lam.shape)
    counts = rng.poisson(lam)

    rush = np.exp(-(hours - 8) ** 2 / 2) + np.exp(-(hours - 18) ** 2 / 2)
    congestion_base = np.array([TRAFFIC_PROFILES[t]["congestion"] for t in types], dtype=float)
    congestion = np.clip(congestion_base[:, None, None] + 22 * rush[None, None, :] - 12 * weekend[None, :, None]
                         + rng.normal(0, 8, lam.shape), 0, 100).round(1)

    L = np.repeat(np.arange(n_loc), n_days * len(hours))
    D = np.tile(np.repeat(np.arange(n_days), len(hours)), n_loc)
    H = np.tile(np.arange(len(hours)), n_loc * n_days)
    table = pd.DataFrame({
        "location_id": locations["location_id"].to_numpy()[L],
        "spatial_block_id": locations["spatial_block_id"].to_numpy()[L],
        "period_start": dates[D] + pd.to_timedelta(hours[H], unit="h"),
        "latitude": locations["latitude"].to_numpy()[L],
        "longitude": locations["longitude"].to_numpy()[L],
        "location_type": types[L],
        "hour": hours[H],
        "day_of_week": dow[D],
        "is_weekend": weekend[D],
        "is_payday_window": payday[D],
        "rainfall_mm": rain.ravel(),
        **{c: locations[c].to_numpy()[L] for c in LOCATION_FEATURES[1:]},
        "vehicle_congestion_index": congestion.ravel(),
        "pedestrian_count": counts.ravel(),
        "source_type": "synthetic",
    })
    return table[TRAINING_COLUMNS]

# ---------------------------------------------------------------------------
# Loading supplied data
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
# Validation (§5.3)
# ---------------------------------------------------------------------------

def spearman(a, b) -> float:
    ra, rb = pd.Series(a).rank().to_numpy(), pd.Series(b).rank().to_numpy()
    if ra.std() == 0 or rb.std() == 0:
        return float("nan")
    return float(np.corrcoef(ra, rb)[0, 1])


def regression_metrics(y: np.ndarray, pred: np.ndarray, location_id: np.ndarray) -> dict:
    err = pred - y
    site = pd.DataFrame({"loc": location_id, "y": y, "p": pred}).groupby("loc")[["y", "p"]].mean()
    return {
        "MAE": float(np.mean(np.abs(err))),
        "RMSE": float(np.sqrt(np.mean(err ** 2))),
        "WAPE": float(np.abs(err).sum() / y.sum()),
        "site_spearman": spearman(site["y"], site["p"]),
        "n_rows": int(len(y)),
        "n_sites": int(len(site)),
    }


def chronological_masks(df: pd.DataFrame, train_days: int) -> tuple[np.ndarray, np.ndarray]:
    """Days 1..train_days train, the rest test; day 1 is the first date in the table."""
    day = (df["period_start"].dt.normalize() - df["period_start"].min().normalize()).dt.days.to_numpy() + 1
    return day <= train_days, day > train_days


def grouped_folds(groups: np.ndarray, k: int, seed: int) -> list[np.ndarray]:
    unique = np.random.default_rng(seed).permutation(np.unique(groups))
    return [f for f in np.array_split(unique, min(k, len(unique))) if len(f)]


def _baseline(train: pd.DataFrame, test: pd.DataFrame, keys: list[str]) -> np.ndarray:
    overall = train[TARGET].mean()
    if not keys:
        return np.full(len(test), overall)
    means = train.groupby(keys)[TARGET].mean().rename("_baseline").reset_index()
    return test[keys].merge(means, on=keys, how="left")["_baseline"].fillna(overall).to_numpy()


def _grouped_holdout(df: pd.DataFrame, train_m: np.ndarray, test_m: np.ndarray, group_col: str,
                     cfg: PedConfig) -> tuple[dict, np.ndarray]:
    """Train on the other groups' training days, test on the held-out groups' test days."""
    groups = df[group_col].to_numpy()
    folds = grouped_folds(groups, cfg.n_folds, cfg.seed)
    preds = {name: np.full(len(df), np.nan) for name in ("model", "baseline_global_mean", "baseline_hour_x_weekday")}
    fold_mae = []
    for held_out in folds:
        in_fold = np.isin(groups, held_out)
        train, test = df[train_m & ~in_fold], df[test_m & in_fold]
        idx = np.flatnonzero(test_m & in_fold)
        preds["model"][idx] = PedestrianModel(cfg).fit(train).predict(test)
        preds["baseline_global_mean"][idx] = _baseline(train, test, [])
        preds["baseline_hour_x_weekday"][idx] = _baseline(train, test, ["hour", "day_of_week"])
        fold_mae.append(float(np.mean(np.abs(preds["model"][idx] - test[TARGET].to_numpy()))))

    y, loc = df[TARGET].to_numpy(dtype=float)[test_m], df["location_id"].to_numpy()[test_m]
    result = {name: regression_metrics(y, p[test_m], loc) for name, p in preds.items()}
    result["model_fold_MAE"] = fold_mae
    result["n_folds"], result["n_groups"] = len(folds), int(len(np.unique(groups)))
    site = pd.DataFrame({"loc": loc, "y": y, "p": preds["model"][test_m]}).groupby("loc")[["y", "p"]].mean()
    return result, (site["y"] / site["p"]).to_numpy()


def validate_pedestrian_model(df: pd.DataFrame, cfg: PedConfig) -> tuple[dict, tuple[float, float]]:
    """Known-site and new-site (block-grouped) error, plus the site-level ratio quantiles used for ranges."""
    train_m, test_m = chronological_masks(df, cfg.train_days)
    if not train_m.any() or not test_m.any():
        raise SystemExit(f"chronological split at day {cfg.train_days} leaves an empty train or test set")
    train, test = df[train_m], df[test_m]
    y, loc = test[TARGET].to_numpy(dtype=float), test["location_id"].to_numpy()

    known_site = {
        "model": regression_metrics(y, PedestrianModel(cfg).fit(train).predict(test), loc),
        "baseline_global_mean": regression_metrics(y, _baseline(train, test, []), loc),
        "baseline_hour_x_weekday": regression_metrics(y, _baseline(train, test, ["hour", "day_of_week"]), loc),
        "baseline_own_location_hour_x_weekday": regression_metrics(
            y, _baseline(train, test, ["location_id", "hour", "day_of_week"]), loc),
    }
    by_block, site_ratio = _grouped_holdout(df, train_m, test_m, "spatial_block_id", cfg)
    by_location, _ = _grouped_holdout(df, train_m, test_m, "location_id", cfg)
    n_days = int((df["period_start"].dt.normalize() - df["period_start"].min().normalize()).dt.days.max()) + 1
    report = {
        "split": {"train_days": f"1-{cfg.train_days}", "test_days": f"{cfg.train_days + 1}-{n_days}",
                  "train_rows": int(train_m.sum()), "test_rows": int(test_m.sum())},
        "headline": "spatial_holdout_by_block: scoring a new address means predicting a place the model has never seen",
        "spatial_holdout_by_block": by_block,
        "holdout_by_location": by_location,
        "known_site": known_site,
    }
    ratio_q = tuple(float(q) for q in np.quantile(site_ratio, RANGE_QUANTILES))
    report["site_ratio_quantiles"] = {"quantiles": list(RANGE_QUANTILES), "actual_over_predicted": list(ratio_q)}
    return report, ratio_q


def effect_checks(model: PedestrianModel, df: pd.DataFrame, planted: PlantedEffects | None, seed: int = 0) -> dict:
    """Effects the fitted model implies, compared with the planted ones on synthetic data (§10.2)."""
    sample = df.sample(n=min(len(df), 20_000), random_state=seed)

    def ratio(column: str, high, low) -> float:
        return float(model.predict(sample.assign(**{column: high})).mean()
                     / model.predict(sample.assign(**{column: low})).mean())

    probe = sample.head(300)
    grid = np.unique(np.r_[np.linspace(15, 2000, 60), 100.0, 1000.0])
    swept = probe.loc[probe.index.repeat(len(grid))].assign(nearest_transport_distance_m=np.tile(grid, len(probe)))
    pred = model.predict(swept).reshape(len(probe), len(grid))
    max_rise = float(np.max(np.diff(pred, axis=1)))

    checks = {
        "payday_uplift": {"estimated": ratio("is_payday_window", 1, 0)},
        "rain_10mm_multiplier": {"estimated": ratio("rainfall_mm", 10.0, 0.0)},
        "transit_100m_over_1000m": {"estimated": float(pred[:, grid == 100].mean() / pred[:, grid == 1000].mean())},
        "transit_monotone": {"non_increasing": bool(max_rise <= 1e-4), "max_increase_peds_per_hour": max_rise},
    }
    if planted:
        checks["payday_uplift"]["planted"] = planted.payday_uplift
        checks["rain_10mm_multiplier"]["planted"] = math.exp(10 * planted.rain_per_mm)
        checks["transit_100m_over_1000m"]["planted"] = math.exp(planted.transit_per_m * (100 - 1000))
    return checks

# ---------------------------------------------------------------------------
# From predictions to the pedestrian component (§5.4)
# ---------------------------------------------------------------------------

def payday_share(month: int) -> float:
    """Share of a month's days inside the payday window (non-leap reference year)."""
    n_days = calendar.monthrange(2027, month)[1]
    return sum(1 for d in PAYDAY_DAYS if d <= n_days) / n_days


def typical_congestion(df: pd.DataFrame) -> pd.DataFrame:
    """Typical congestion by location type, hour and weekday, for scoring with --use-congestion."""
    return df.groupby(["location_type", "hour", "day_of_week"])[CONGESTION_FEATURE].median().reset_index()


def expected_pedestrians(model: PedestrianModel, sites: pd.DataFrame, days, hours, months,
                         rain_clim: pd.DataFrame, congestion: pd.DataFrame | None = None) -> pd.DataFrame:
    """P̄_l = mean over d ∈ D, h ∈ H, m ∈ M of λ̂, with seasonal-average rain and the payday window
    taken as an expectation over each month's calendar. Also P̄ for the dry and wet season."""
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
    grid["weighted"] = grid["weight"] * model.predict(grid)

    def mean_over(season) -> pd.Series:
        chosen = [m for m in months if m in season]
        if not chosen:
            return pd.Series(np.nan, index=sites["location_id"])
        total = grid[grid["month"].isin(chosen)].groupby("location_id")["weighted"].sum()
        return (total / (len(days) * len(hours) * len(chosen))).reindex(sites["location_id"])

    return pd.DataFrame({"p_bar": mean_over(months), "p_dry": mean_over(DRY_MONTHS), "p_wet": mean_over(WET_MONTHS)})


def ped_bounds(p_bar_reference: pd.Series) -> tuple[float, float]:
    """P_lo, P_hi: 5th and 95th percentiles of P̄ over the training locations, in pedestrians/hour."""
    lo, hi = np.percentile(p_bar_reference.to_numpy(), PED_BOUND_PERCENTILES)
    return float(lo), float(hi)


def ped_component(p_bar, bounds: tuple[float, float], scale: str = "linear"):
    """s_ped = 100 · clip((P̄ − P_lo) / (P_hi − P_lo), 0, 1), optionally on log(1 + ·)."""
    transform = np.log1p if scale == "log" else (lambda v: np.asarray(v, dtype=float))
    lo, hi = transform(bounds[0]), transform(bounds[1])
    return 100.0 * np.clip((transform(p_bar) - lo) / (hi - lo), 0.0, 1.0)

# ---------------------------------------------------------------------------
# Rule-based components (§6) and safety (§7)
# ---------------------------------------------------------------------------

def poi_mix(counts: Mapping[str, float]) -> dict[str, float]:
    total = sum(counts[j] for j in POI_TYPES)
    return {j: (counts[j] / total if total > 0 else 0.0) for j in POI_TYPES}


def business_fit_score(counts: Mapping[str, float], business_type: str, params: Mapping = PARAMS) -> float:
    """s_fit(b) = 100 · Σ_j min(m_j, v_j(b)); 0 when there are no nearby POIs (§6.1)."""
    if sum(counts[j] for j in POI_TYPES) <= 0:
        return 0.0
    ideal, mix = params["business_fit"][business_type], poi_mix(counts)
    return 100.0 * sum(min(mix[j], ideal[j]) for j in POI_TYPES)


def competition_score(competitors: float, business_type: str, params: Mapping = PARAMS) -> float:
    """Asymmetric Gaussian around c*(b): σ_L below c*, σ_R at or above it (§6.2)."""
    p = params["competition"][business_type]
    sigma = p["sigma_left"] if competitors < p["c_star"] else p["sigma_right"]
    return 100.0 * math.exp(-((competitors - p["c_star"]) ** 2) / (2 * sigma ** 2))


def walkability_score(sidewalk, paved, crossing, params: Mapping = PARAMS) -> float:
    """s_walk = 50·sidewalk + 30·paved + 20·crossing (§6.3)."""
    w = params["walkability"]
    return w["sidewalk"] * bool(sidewalk) + w["paved"] * bool(paved) + w["crossing"] * bool(crossing)


def _present(value) -> bool:
    return value is not None and not pd.isna(value)


def safety_score(site: Mapping, params: Mapping = PARAMS) -> dict[str, float]:
    """Flood, earthquake, crime, lighting and emergency-access sub-scores and their blend (§7.1-7.2)."""
    p = params["safety"]
    flood_class = int(site["flood_hazard_class"])

    flood = p["flood_class_score"][flood_class]
    if site["dist_waterway_m"] <= p["waterway_near_m"]:
        flood -= p["waterway_penalty"]
    if _present(site.get("flood_events_5y")):  # term dropped when unavailable
        flood -= p["flood_event_penalty"] * min(site["flood_events_5y"], p["flood_event_max"])
    flood = max(0.0, flood)

    quake = (0.5 * 100.0 * min(max(site["dist_fault_m"] / p["fault_full_m"], 0.0), 1.0)
             + 0.5 * p["liquefaction_score"][int(site["liquefaction_class"])])
    crime = 100.0 * (1.0 - site["crime_pct_rank"])
    light = 100.0 * site["lit_share"]
    reach = p["emergency_full_m"]
    emerg = float(np.mean([100.0 * max(0.0, 1.0 - site["dist_police_m"] / reach["police"]),
                           100.0 * max(0.0, 1.0 - site["dist_fire_station_m"] / reach["fire"]),
                           100.0 * max(0.0, 1.0 - site["dist_hospital_m"] / reach["hospital"])]))

    sub = {"flood": flood, "crime": crime, "light": light, "quake": quake, "emerg": emerg}
    raw = sum(p["sub_weights"][k] * sub[k] for k in sub)
    final = min(raw, p["high_flood_cap"]) if flood_class == 3 else raw
    return {**sub, "raw": raw, "score": final}

# ---------------------------------------------------------------------------
# Aggregation (§8)
# ---------------------------------------------------------------------------

def aggregate(scores: Mapping[str, float], flood_class: int, dist_fault_m: float, liquefaction_class: int,
              params: Mapping = PARAMS) -> tuple[float, float, list[str], list[tuple[str, float]]]:
    """S = min(S_geo, caps), S_geo = exp(Σ_k w_k · ln max(s_k, floor)). Returns S, S_geo, flags, caps."""
    weights, floor, c = params["weights"], params["geo_floor"], params["caps"]
    s_geo = math.exp(sum(w * math.log(max(scores[k], floor)) for k, w in weights.items()))

    caps, flags = [], []
    if scores["ped"] < c["low_ped_below"]:
        caps.append(("low_foot_traffic", c["low_ped_cap"]))
    if int(flood_class) == 3:
        caps.append(("high_flood_hazard", c["high_flood_cap"]))
        flags.append("high_flood_hazard")
    if dist_fault_m < c["seismic_fault_m"] or int(liquefaction_class) == 2:
        flags.append("seismic_hazard")
    if scores["comp"] < c["crowded_comp_below"]:
        flags.append("crowded_or_empty_market")
    return min([s_geo] + [cap for _, cap in caps]), s_geo, flags, caps


def weighted_sum_score(scores: Mapping[str, float], params: Mapping = PARAMS) -> float:
    """Revision-1 fully compensatory sum, kept only for comparison."""
    return sum(w * scores[k] for k, w in params["weights"].items())


def compute_site_scores(site: Mapping, business_type: str, s_ped: float, params: Mapping = PARAMS) -> dict:
    counts = {j: site[f"nearby_{j}_count"] for j in POI_TYPES}
    safety = safety_score(site, params)
    scores = {
        "ped": float(s_ped),
        "fit": business_fit_score(counts, business_type, params),
        "comp": competition_score(site[competitor_column(business_type)], business_type, params),
        "walk": walkability_score(site["sidewalk"], site["paved"], site["crossing"], params),
        "safety": safety["score"],
    }
    S, s_geo, flags, caps = aggregate(scores, site["flood_hazard_class"], site["dist_fault_m"],
                                      site["liquefaction_class"], params)
    return {"scores": scores, "safety": safety, "mix": poi_mix(counts), "S": S, "S_geo": s_geo,
            "flags": flags, "caps": caps}


def _r1(value) -> float:
    return round(float(value), 1)


def build_record(site: Mapping, business_type: str, result: Mapping, ped: Mapping, params: Mapping = PARAMS) -> dict:
    """One scores.json entry, following §8.4."""
    s, sf, w = result["scores"], result["safety"], params["weights"]
    flood_class = int(site["flood_hazard_class"])
    source = site.get("hazard_source") if _present(site.get("hazard_source")) else "government hazard maps"
    round_or_none = lambda v: None if not _present(v) else int(round(float(v)))
    components = [
        {"name": COMPONENT_NAMES["ped"], "score": _r1(s["ped"]), "weight": w["ped"],
         "detail": {"expected_peds_per_hour": round_or_none(ped["p_bar"]),
                    "range": [round_or_none(ped["range_lo"]), round_or_none(ped["range_hi"])],
                    "dry_season_peds_per_hour": round_or_none(ped["p_dry"]),
                    "wet_season_peds_per_hour": round_or_none(ped["p_wet"])}},
        {"name": COMPONENT_NAMES["fit"], "score": _r1(s["fit"]), "weight": w["fit"],
         "detail": {"poi_mix": {j: round(v, 2) for j, v in result["mix"].items()}}},
        {"name": COMPONENT_NAMES["comp"], "score": _r1(s["comp"]), "weight": w["comp"],
         "detail": {"competitors_within_200m": int(site[competitor_column(business_type)])}},
        {"name": COMPONENT_NAMES["walk"], "score": _r1(s["walk"]), "weight": w["walk"],
         "detail": {k: bool(site[k]) for k in ("sidewalk", "paved", "crossing")}},
        {"name": COMPONENT_NAMES["safety"], "score": _r1(s["safety"]), "weight": w["safety"],
         "detail": {"flood": _r1(sf["flood"]), "earthquake": _r1(sf["quake"]), "crime": _r1(sf["crime"]),
                    "lighting": _r1(sf["light"]), "emergency_access": _r1(sf["emerg"]),
                    "flood_hazard_class": flood_class,
                    "flood_hazard": f"flood hazard: {FLOOD_CLASS_NAMES[flood_class]} ({source})",
                    "liquefaction_class": int(site["liquefaction_class"]),
                    "source": source}},
    ]
    return {
        "location_id": site["location_id"],
        "location": site["address"] if _present(site.get("address")) else site["location_id"],
        "business_type": business_type,
        "location_score": _r1(result["S"]),
        "weakest_component": COMPONENT_NAMES[min(s, key=s.get)],
        "flags": result["flags"],
        "caps_applied": [name for name, _ in result["caps"]],
        "components": components,
        "info_only": {"nearest_transport_m": int(round(float(site["nearest_transport_distance_m"])))},
    }

# ---------------------------------------------------------------------------
# Sensitivity test (§10.4)
# ---------------------------------------------------------------------------

def band(score: float) -> str:
    return next(label for threshold, label in PLACEHOLDER_BANDS if score >= threshold)


def numeric_leaves(tree: Mapping, path: tuple = ()):
    for key, value in tree.items():
        if isinstance(value, Mapping):
            yield from numeric_leaves(value, path + (key,))
        elif isinstance(value, (int, float)):
            yield path + (key,)


def perturb(params: Mapping, path: tuple, factor: float) -> dict:
    out = copy.deepcopy(params)
    parent = out
    for key in path[:-1]:
        parent = parent[key]
    parent[path[-1]] *= factor
    if _normalised_group(path):
        total = sum(parent.values())
        for key in parent:
            parent[key] /= total
    return out


def sensitivity_test(sites: list[Mapping], s_ped: Mapping[str, float], business_types, params: Mapping = PARAMS,
                     factors=(0.8, 1.2)) -> pd.DataFrame:
    """Perturb each parameter by ±20%; Spearman vs the original ranking and band changes, per business type."""
    def all_scores(p):
        return {b: np.array([compute_site_scores(s, b, s_ped[s["location_id"]], p)["S"] for s in sites])
                for b in business_types}

    base = all_scores(params)
    base_bands = {b: [band(v) for v in base[b]] for b in business_types}
    rows = []
    for path in numeric_leaves(params):
        for factor in factors:
            perturbed = all_scores(perturb(params, path, factor))
            for b in business_types:
                rows.append({
                    "parameter": ".".join(str(k) for k in path), "factor": factor, "business_type": b,
                    "spearman": spearman(base[b], perturbed[b]),
                    "band_changes": int(sum(x != band(v) for x, v in zip(base_bands[b], perturbed[b]))),
                    "mean_abs_score_change": float(np.mean(np.abs(perturbed[b] - base[b]))),
                })
    return pd.DataFrame(rows)


def overlap_check(sites: list[Mapping], p_bar: Mapping[str, float], business_types, params: Mapping = PARAMS) -> dict:
    """Spearman between s_fit and the traffic-model inputs: the residual overlap of §6.1."""
    inputs = [f"nearby_{j}_count" for j in POI_TYPES] + ["nearby_transport_stop_count",
                                                         "nearest_transport_distance_m", "population_density_500m"]
    out = {}
    for b in business_types:
        fit = [business_fit_score({j: s[f"nearby_{j}_count"] for j in POI_TYPES}, b, params) for s in sites]
        out[b] = {c: spearman(fit, [s[c] for s in sites]) for c in inputs}
        out[b]["expected_peds_per_hour"] = spearman(fit, [p_bar[s["location_id"]] for s in sites])
    return out

# ---------------------------------------------------------------------------
# Self-test against the spec's worked examples
# ---------------------------------------------------------------------------

def selftest() -> int:
    results = []

    def check(name: str, got: float, want: float, tol: float = 0.05) -> None:
        ok = abs(got - want) <= tol
        results.append(ok)
        print(f"[{'PASS' if ok else 'FAIL'}] {name}: got {got:.2f}, expected {want}")

    def check_true(name: str, condition: bool) -> None:
        results.append(bool(condition))
        print(f"[{'PASS' if condition else 'FAIL'}] {name}")

    check_true("parameter groups sum to 1", check_params(PARAMS) is None)
    check_true("σ_R < σ_L for every business type (saturation hurts more)",
               all(p["sigma_right"] < p["sigma_left"] for p in PARAMS["competition"].values()))

    counts = {"school": 2, "market": 1, "office": 3, "shop": 4}
    check("§6.1 business fit, sari-sari store", business_fit_score(counts, "sari-sari store"), 85)
    check("§6.1 business fit, food stall (same mix)", business_fit_score(counts, "food stall"), 80)
    check("§6.1 business fit with no nearby POIs", business_fit_score(dict.fromkeys(POI_TYPES, 0), "food stall"), 0)
    check("§6.1 business fit, mix equal to ideal",
          business_fit_score({"school": 20, "market": 20, "office": 15, "shop": 45}, "sari-sari store"), 100)

    for c, want in ((3, 100), (0, 60.7), (5, 53.9), (6, 24.9)):
        check(f"§6.2 competition, sari-sari store, c = {c}", competition_score(c, "sari-sari store"), want)

    check("§6.3 walkability, all present", walkability_score(1, 1, 1), 100)
    check("§6.3 walkability, sidewalk only", walkability_score(1, 0, 0), 50)

    site = {"flood_hazard_class": 1, "dist_waterway_m": 80.0, "flood_events_5y": 1, "dist_fault_m": 600.0,
            "liquefaction_class": 1, "crime_pct_rank": 0.30, "lit_share": 0.80,
            "dist_police_m": 250.0, "dist_fire_station_m": 750.0, "dist_hospital_m": 750.0}
    s = safety_score(site)
    check("§7.2 flood sub-score (class 1, creek ≤ 100 m, 1 event)", s["flood"], 55)
    check("§7.2 earthquake sub-score (fault 600 m, liquefaction 1)", s["quake"], 90)
    check("§7.2 crime sub-score", s["crime"], 70)
    check("§7.2 lighting sub-score", s["light"], 80)
    check("§7.2 emergency-access sub-score", s["emerg"], 75)
    check("§7.2 safety score", s["score"], 69.5)
    check("§7.1 flood term dropped when flood_events_5y is missing",
          safety_score({**site, "flood_events_5y": float("nan")})["flood"], 60)
    check("§7.2 safety capped at 40 in flood class 3",
          safety_score({**site, "flood_hazard_class": 3, "dist_waterway_m": 500.0, "flood_events_5y": 0})["score"], 40)

    worked = {"ped": 80, "fit": 85, "comp": 53.9, "walk": 70, "safety": 69.5}
    check("§8.3 gated score, worked example", aggregate(worked, 1, 600, 1)[0], 71.8)
    check("§8.3 weighted sum, worked example", weighted_sum_score(worked), 72.7)
    weak = {**worked, "ped": 10}
    check("§8.3 gated score with s_ped = 10", aggregate(weak, 1, 600, 1)[0], 38.5)
    check("§8.3 weighted sum with s_ped = 10", weighted_sum_score(weak), 51.7)

    strong = dict.fromkeys(COMPONENT_NAMES, 100.0)
    S, _, _, caps = aggregate({**strong, "ped": 15}, 0, 5000, 0)
    check("§8.2 s_ped < 20 caps S at 50", S, 50)
    check_true("§8.2 low-traffic cap recorded", [n for n, _ in caps] == ["low_foot_traffic"])
    S, _, flags, _ = aggregate(strong, 3, 5000, 0)
    check("§8.2 flood class 3 caps S at 55", S, 55)
    check_true("§8.2 high_flood_hazard flag", flags == ["high_flood_hazard"])
    S, _, flags, caps = aggregate(strong, 0, 50, 0)
    check_true("§8.2 fault < 100 m flags seismic_hazard without a cap", flags == ["seismic_hazard"] and not caps and abs(S - 100) < 1e-9)
    check_true("§8.2 liquefaction class 2 flags seismic_hazard", aggregate(strong, 0, 5000, 2)[2] == ["seismic_hazard"])
    check_true("§8.2 s_comp < 20 flags crowded_or_empty_market",
               aggregate({**strong, "comp": 10}, 0, 5000, 0)[2] == ["crowded_or_empty_market"])
    check_true("§8.1 floor keeps a zero component from zeroing the score", aggregate({**strong, "walk": 0}, 0, 5000, 0)[0] > 0)

    check("§4.2 payday window share, January (7 of 31 days)", payday_share(1), 7 / 31, tol=1e-9)
    check("§4.2 payday window share, February (4 of 28 days)", payday_share(2), 4 / 28, tol=1e-9)
    perturbed = perturb(PARAMS, ("weights", "ped"), 1.2)
    check("§10.4 perturbed weights renormalised", sum(perturbed["weights"].values()), 1.0, tol=1e-9)

    print(f"\n{sum(results)}/{len(results)} checks passed")
    return 0 if all(results) else 1

# ---------------------------------------------------------------------------
# Pipeline
# ---------------------------------------------------------------------------

def _jsonable(obj):
    if isinstance(obj, Mapping):
        return {str(k): _jsonable(v) for k, v in obj.items()}
    if isinstance(obj, (list, tuple)):
        return [_jsonable(v) for v in obj]
    if isinstance(obj, (bool, np.bool_)):
        return bool(obj)
    if isinstance(obj, np.integer):
        return int(obj)
    if isinstance(obj, (float, np.floating)):
        return float(obj) if math.isfinite(obj) else None
    return obj


def _write_json(path: Path, obj) -> None:
    path.write_text(json.dumps(_jsonable(obj), indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def parse_int_set(text: str, half_open: bool = False) -> tuple[int, ...]:
    """'0-6' -> 0..6; '8-20' with half_open -> 8..19 (open 08:00, close 20:00); '1,2,3' -> (1, 2, 3)."""
    values = set()
    for part in text.split(","):
        part = part.strip()
        if "-" in part:
            a, b = (int(v) for v in part.split("-"))
            values.update(range(a, b if half_open else b + 1))
        elif part:
            values.add(int(part))
    return tuple(sorted(values))


def notice_text(synthetic: bool) -> str:
    return ("Prototype, synthetic data. Scores show how the pipeline behaves, not conditions at real places."
            if synthetic else "Prototype. Weights and thresholds are uncalibrated placeholders.")


DISCLAIMER = ("The score estimates potential customer exposure plus context, including hazard exposure. "
              "It does not predict sales or business survival. Hazard values are indicative, not a survey.")


def write_synthetic(out_dir: Path, seed: int, start_date: str) -> tuple[pd.DataFrame, pd.DataFrame]:
    rng = np.random.default_rng(seed)
    locations = generate_location_table(rng)
    training = generate_training_table(locations, rng, start_date=start_date)
    out_dir.mkdir(parents=True, exist_ok=True)
    training.to_csv(out_dir / "training_table.csv.gz", index=False)
    locations.to_csv(out_dir / "location_table.csv", index=False)
    print(f"Synthetic training table: {training.shape[0]:,} rows x {training.shape[1]} columns "
          f"({training['location_id'].nunique()} locations) -> {out_dir / 'training_table.csv.gz'}")
    print(f"Synthetic location table: {len(locations)} sites -> {out_dir / 'location_table.csv'}")
    return training, locations


def run(args: argparse.Namespace) -> int:
    out_dir = Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    business_types = tuple(args.business_types)
    unknown = [b for b in business_types if b not in PARAMS["business_fit"]]
    if unknown:
        raise SystemExit(f"no parameters for business types {unknown}; known: {list(PARAMS['business_fit'])}")
    params = copy.deepcopy(PARAMS)
    check_params(params)
    cfg = PedConfig(objective=args.objective, monotone_rain=args.monotone_rain, use_congestion=args.use_congestion,
                    train_days=args.train_days, seed=args.seed, open_days=parse_int_set(args.open_days),
                    open_hours=parse_int_set(args.open_hours, half_open=True), months=parse_int_set(args.months),
                    scale=args.ped_scale, bounds=tuple(args.ped_bounds) if args.ped_bounds else None)

    if bool(args.training_csv) != bool(args.locations_csv):
        raise SystemExit("pass both --training-csv and --locations-csv, or neither for synthetic data")
    if args.training_csv:
        training = load_training_table(args.training_csv, args.source_type)
        locations = load_location_table(args.locations_csv, business_types)
        planted = None
    else:
        training, locations = write_synthetic(Path(args.data_dir or args.out_dir), args.seed, args.start_date)
        planted = PlantedEffects()
    source_types = sorted(training["source_type"].astype(str).unique())
    synthetic = source_types == ["synthetic"]
    rain_clim = load_rain_climatology(args.rain_climatology_csv) if args.rain_climatology_csv else synthetic_rain_climatology()

    print(f"\nValidating the pedestrian model ({cfg.objective}; chronological split at day {cfg.train_days}; "
          f"{cfg.n_folds}-fold holdouts by block and by location) ...")
    report, ratio_q = validate_pedestrian_model(training, cfg)

    print("Fitting the final model on all rows ...")
    model = PedestrianModel(cfg).fit(training)
    model.model.save_model(out_dir / "pedestrian_model.json")
    report["effects"] = effect_checks(model, training, planted)
    congestion = typical_congestion(training) if cfg.use_congestion else None

    reference_sites = training.drop_duplicates("location_id")[["location_id"] + LOCATION_FEATURES]
    reference = expected_pedestrians(model, reference_sites, *REFERENCE_SCHEDULE.values(), rain_clim, congestion)
    bounds = cfg.bounds or ped_bounds(reference["p_bar"])
    ped = expected_pedestrians(model, locations, cfg.open_days, cfg.open_hours, cfg.months, rain_clim, congestion)
    ped["s_ped"] = ped_component(ped["p_bar"], bounds, cfg.scale)
    ped["range_lo"], ped["range_hi"] = ped["p_bar"] * ratio_q[0], ped["p_bar"] * ratio_q[1]

    sites = locations.to_dict("records")
    records, raw = [], []
    for site in sites:
        ped_row = ped.loc[site["location_id"]]
        for b in business_types:
            result = compute_site_scores(site, b, ped_row["s_ped"], params)
            records.append(build_record(site, b, result, ped_row, params))
            raw.append({"location_id": site["location_id"], "business_type": b, "S": result["S"],
                        **{f"s_{k}": v for k, v in result["scores"].items()}})

    meta = {
        "spec": SPEC,
        "generated_utc": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "source_type": source_types[0] if len(source_types) == 1 else source_types,
        "notice": notice_text(synthetic),
        "disclaimer": DISCLAIMER,
        "pedestrian_scaling": {"P_lo": bounds[0], "P_hi": bounds[1], "units": "pedestrians per hour",
                               "scale": cfg.scale, "percentiles": list(PED_BOUND_PERCENTILES),
                               "fixed_from_earlier_run": cfg.bounds is not None,
                               "reference_schedule": REFERENCE_SCHEDULE},
        "schedule": {"open_days": cfg.open_days, "open_hours": [f"{h:02d}:00" for h in cfg.open_hours],
                     "months": cfg.months},
        "range_method": (f"{int(RANGE_QUANTILES[0] * 100)}th-{int(RANGE_QUANTILES[1] * 100)}th percentile of "
                         "actual/predicted site-mean ratios in the block-grouped spatial holdout, applied to P̄"),
        "weights": params["weights"],
        "components_note": "No per-component contribution points: a geometric mean has no additive breakdown.",
    }
    _write_json(out_dir / "scores.json", {"meta": meta, "scores": records})

    raw_df = pd.DataFrame(raw)
    if not args.skip_sensitivity:
        print("Running the sensitivity test (each parameter ±20%) ...")
        sens = sensitivity_test(sites, ped["s_ped"].to_dict(), business_types, params)
        sens.to_csv(out_dir / "sensitivity.csv", index=False)
        summary = (sens.groupby("parameter")
                   .agg(min_spearman=("spearman", "min"), max_band_changes=("band_changes", "max"),
                        max_mean_abs_change=("mean_abs_score_change", "max"))
                   .sort_values(["min_spearman", "max_band_changes"], ascending=[True, False]))
        _write_json(out_dir / "sensitivity_report.json", {
            "bands_used": {"note": "placeholder bands, for counting band changes only", "bands": PLACEHOLDER_BANDS},
            "parameters_ranked": summary.reset_index().to_dict("records"),
            "s_fit_overlap_spearman": overlap_check(sites, ped["p_bar"].to_dict(), business_types, params),
        })
    _write_json(out_dir / "validation_report.json", report)

    # Serving artifacts for sitesuri_ml.service
    locations.to_csv(out_dir / "locations.csv", index=False)
    rain_clim.to_csv(out_dir / "rain_climatology.csv", index=False)
    if congestion is not None:
        congestion.to_csv(out_dir / "typical_congestion.csv", index=False)
    _write_json(out_dir / "scoring_config.json", {
        "spec": SPEC,
        "trained_utc": meta["generated_utc"],
        "source_type": meta["source_type"],
        "synthetic": synthetic,
        "model": {"file": "pedestrian_model.json", "objective": cfg.objective, "features": model.features,
                  "use_congestion": cfg.use_congestion, "monotone_rain": cfg.monotone_rain, "seed": cfg.seed},
        "pedestrian_scaling": {"P_lo": bounds[0], "P_hi": bounds[1], "scale": cfg.scale},
        "range_ratio_quantiles": list(ratio_q),
        "default_schedule": {"open_days": cfg.open_days, "open_hours": cfg.open_hours, "months": cfg.months},
        "business_types": business_types,
        "params": params,
    })

    _print_summary(report, bounds, cfg, raw_df, records, None if args.skip_sensitivity else summary, out_dir)
    return 0


def _print_summary(report, bounds, cfg, raw_df, records, sensitivity, out_dir: Path) -> None:
    def row(label, m):
        rho = "  n/a" if m["site_spearman"] is None or math.isnan(m["site_spearman"]) else f"{m['site_spearman']:5.2f}"
        print(f"  {label:<44} MAE {m['MAE']:7.1f}  RMSE {m['RMSE']:7.1f}  WAPE {m['WAPE']:6.1%}  site ρ {rho}")

    print("\nPedestrian model, test days " + report["split"]["test_days"])
    print(" New sites, held out by spatial block (headline):")
    for name, m in report["spatial_holdout_by_block"].items():
        if isinstance(m, dict):
            row(name, m)
    print(" New sites, held out by location only:")
    row("model", report["holdout_by_location"]["model"])
    print(" Known sites:")
    for name, m in report["known_site"].items():
        row(name, m)

    print("\nEffects implied by the model" + (" (planted values in brackets)" if "planted" in report["effects"]["payday_uplift"] else ""))
    for name in ("payday_uplift", "rain_10mm_multiplier", "transit_100m_over_1000m"):
        e = report["effects"][name]
        planted = f"  [{e['planted']:.3f}]" if "planted" in e else ""
        print(f"  {name:<26} {e['estimated']:.3f}{planted}")
    print(f"  transit monotone          {report['effects']['transit_monotone']['non_increasing']}")

    print(f"\nScaling: P_lo = {bounds[0]:.1f}, P_hi = {bounds[1]:.1f} pedestrians/hour ({cfg.scale}); "
          f"opening hours {cfg.open_hours[0]:02d}:00-{cfg.open_hours[-1] + 1:02d}:00")
    print("Location score by business type:")
    for b, g in raw_df.groupby("business_type", sort=False):
        q = g["S"].quantile([0.0, 0.25, 0.5, 0.75, 1.0]).to_numpy()
        print(f"  {b:<16} min {q[0]:5.1f}  p25 {q[1]:5.1f}  median {q[2]:5.1f}  p75 {q[3]:5.1f}  max {q[4]:5.1f}")
    flags = pd.Series([f for r in records for f in r["flags"]]).value_counts()
    caps = pd.Series([c for r in records for c in r["caps_applied"]]).value_counts()
    print("Flags: " + (", ".join(f"{k} {v}" for k, v in flags.items()) or "none")
          + " | Caps applied: " + (", ".join(f"{k} {v}" for k, v in caps.items()) or "none")
          + f" (out of {len(records)} location x business-type records)")

    if sensitivity is not None:
        print("\nMost ranking-sensitive parameters (±20%; lowest Spearman first):")
        for name, r in sensitivity.head(8).iterrows():
            print(f"  {name:<40} min ρ {r['min_spearman']:.3f}  max band changes {int(r['max_band_changes'])}")
    print(f"\nOutputs in {out_dir}/: scores.json, validation_report.json, pedestrian_model.json, scoring_config.json"
          + ("" if sensitivity is None else ", sensitivity.csv, sensitivity_report.json"))


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="MSME Location Opportunity Score (architecture revision 2)")
    sub = parser.add_subparsers(dest="command", required=True)

    sub.add_parser("selftest", help="check the formulas against the spec's worked examples")

    gen = sub.add_parser("generate", help="write the synthetic training and location tables")
    gen.add_argument("--out-dir", default="data")
    gen.add_argument("--seed", type=int, default=42)
    gen.add_argument("--start-date", default="2026-05-01", help="first day of the 90-day synthetic history")

    r = sub.add_parser("run", help="validate, train, score and write scores.json")
    r.add_argument("--out-dir", default="artifacts", help="model, serving artifacts and reports")
    r.add_argument("--data-dir", help="where synthetic tables are written (default: --out-dir)")
    r.add_argument("--training-csv", help="21-column training table (§4.2); synthetic data if omitted")
    r.add_argument("--locations-csv", help="location table (§4.3) for the addresses to score")
    r.add_argument("--rain-climatology-csv", help="month,hour,rainfall_mm; synthetic climatology if omitted")
    r.add_argument("--source-type", help="keep only training rows with this source_type")
    r.add_argument("--seed", type=int, default=42)
    r.add_argument("--start-date", default="2026-05-01", help="first day of the synthetic history")
    r.add_argument("--business-types", nargs="+", default=list(BUSINESS_TYPES))
    r.add_argument("--open-hours", default="8-20", help="opening-closing hour, e.g. 8-20 for 08:00-20:00")
    r.add_argument("--open-days", default="0-6", help="weekdays open, 0 = Monday")
    r.add_argument("--months", default="1-12")
    r.add_argument("--train-days", type=int, default=63, help="days 1..N train, the rest test")
    r.add_argument("--objective", choices=["count:poisson", "reg:tweedie"], default="count:poisson")
    r.add_argument("--monotone-rain", action="store_true", help="also constrain rainfall_mm to be non-increasing")
    r.add_argument("--use-congestion", action="store_true",
                   help="add vehicle_congestion_index; scored with the typical value by type, hour and weekday")
    r.add_argument("--ped-scale", choices=["linear", "log"], default="linear")
    r.add_argument("--ped-bounds", type=float, nargs=2, metavar=("P_LO", "P_HI"),
                   help="fixed scaling bounds from an earlier run, so scores stay stable as addresses are added")
    r.add_argument("--skip-sensitivity", action="store_true")

    args = parser.parse_args(argv)
    if args.command == "selftest":
        return selftest()
    if args.command == "generate":
        write_synthetic(Path(args.out_dir), args.seed, args.start_date)
        return 0
    return run(args)


if __name__ == "__main__":
    sys.exit(main())

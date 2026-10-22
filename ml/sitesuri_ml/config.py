"""Parameters, profiles and constants (spec §4, §5.2, §6-§9).

Every number here is a placeholder or an assumption from model_architecture_v2.md, not a
calibrated value. The score parameters live in PARAMS; the synthetic-data profiles further down
only shape the generated prototype data (§10.1).
"""

from __future__ import annotations

import copy
import math
from dataclasses import dataclass, field
from typing import Mapping

import numpy as np
import pandas as pd
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


# ---------------------------------------------------------------------------
# Output wording
# ---------------------------------------------------------------------------

def notice_text(synthetic: bool) -> str:
    return ("Prototype, synthetic data. Scores show how the pipeline behaves, not conditions at real places."
            if synthetic else "Prototype. Weights and thresholds are uncalibrated placeholders.")


DISCLAIMER = ("The score estimates potential customer exposure plus context, including hazard exposure. "
              "It does not predict sales or business survival. Hazard values are indicative, not a survey.")


# ---------------------------------------------------------------------------
# Synthetic data profiles (§10.1). They shape generated data only, not the score.
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
# Synthetic study area: local equirectangular projection, adequate over a ~15 km pilot area


ORIGIN = (14.63, 121.02)  # lat, lon
M_PER_DEG_LAT = 110_574.0
M_PER_DEG_LON = 111_320.0 * math.cos(math.radians(ORIGIN[0]))
EXTENT_M = (-5000.0, 5000.0, -6500.0, 6500.0)  # x_min, x_max, y_min, y_max of the synthetic area
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

"""Synthetic datasets (spec §10.1): the 21-column training table and the location table.

Synthetic data contains only the relationships planted in it (config.PlantedEffects), so it can
show that the pipeline works but is not evidence about real places.
"""

from __future__ import annotations

import math
from pathlib import Path

import numpy as np
import pandas as pd

from .config import (BUSINESS_TYPES, DOMINANT_TYPE_PROBS, EXTENT_M, FACILITY_COUNTS, FAULT_XY, FLOOD_EVENT_MEAN,
                     LIQUEFACTION_QUANTILES, LOCATION_COLUMNS, LOCATION_FEATURES, LOCATION_TYPES, M_PER_DEG_LAT,
                     M_PER_DEG_LON, ORIGIN, PAYDAY_DAYS, POI_EFFECTS, POI_TYPES, RAIN_BLOCK_SIGMA, RAIN_DAY_PROB,
                     RAIN_INTENSITY_MM_H, RIVERSIDE_BLOCK_SHARE, STORM_START_WEIGHTS, SYNTHETIC_HAZARD_SOURCE,
                     TRAFFIC_PROFILES, TRAINING_COLUMNS, TRAINING_HOURS, TYPE_PROFILES, WATERWAYS_XY,
                     DENSITY_ELASTICITY, PlantedEffects, competitor_column)


# ---------------------------------------------------------------------------
# Geometry
# ---------------------------------------------------------------------------

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
# Weather
# ---------------------------------------------------------------------------

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


# ---------------------------------------------------------------------------
# Tables
# ---------------------------------------------------------------------------

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
    dow = dates.day_of_week.to_numpy()
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

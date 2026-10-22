"""Validation (spec §5.3, §10.2, §10.4): error metrics, chronological and grouped holdouts,
recovery of planted effects, the parameter sensitivity test, and checks of the score formulas
against the spec's worked examples.
"""

from __future__ import annotations

import copy
import math
from typing import Mapping

import numpy as np
import pandas as pd

from .config import (COMPONENT_NAMES, PARAMS, PLACEHOLDER_BANDS, POI_TYPES, RANGE_QUANTILES, TARGET, PedConfig,
                     PlantedEffects, _normalised_group, check_params)
from .features import payday_share
from .pedestrian import PedestrianModel
from .scoring import (aggregate, business_fit_score, competition_score, compute_site_scores, safety_score,
                      walkability_score, weighted_sum_score)


# ---------------------------------------------------------------------------
# Pedestrian model (§5.3)
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
# Score formulas vs the spec's worked examples
# ---------------------------------------------------------------------------

def spec_checks() -> list[tuple[str, bool, str]]:
    """Each score formula against the spec's worked examples: (name, passed, detail)."""
    results = []

    def check(name: str, got: float, want: float, tol: float = 0.05) -> None:
        results.append((name, abs(got - want) <= tol, f"got {got:.2f}, expected {want}"))

    def check_true(name: str, condition: bool) -> None:
        results.append((name, bool(condition), ""))

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
    return results


def selftest() -> int:
    """Print spec_checks(); 0 when all pass."""
    results = spec_checks()
    for name, ok, detail in results:
        print(f"[{'PASS' if ok else 'FAIL'}] {name}" + (f": {detail}" if detail else ""))
    passed = sum(ok for _, ok, _ in results)
    print(f"\n{passed}/{len(results)} checks passed")
    return 0 if passed == len(results) else 1

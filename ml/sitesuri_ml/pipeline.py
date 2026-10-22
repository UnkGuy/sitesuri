"""Training orchestration: data -> validation -> final model -> scores and serving artifacts.

`run(TrainOptions(...))` (or `python train.py run`) writes to the output folder:

  pedestrian_model.json   trained XGBoost model
  scoring_config.json     scaling bounds, range ratios, parameters, default schedule
  locations.csv           location features the inference service looks up
  rain_climatology.csv    average rain by month and hour, used at scoring time
  scores.json             precomputed records for every site and business type (§8.4)
  validation_report.json  pedestrian model errors and recovered effects (§5.3, §10.2)
  sensitivity.csv, sensitivity_report.json   parameter sensitivity test (§10.4)
"""

from __future__ import annotations

import copy
import json
import math
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path

import pandas as pd

from .config import (BUSINESS_TYPES, DISCLAIMER, LOCATION_FEATURES, PARAMS, PED_BOUND_PERCENTILES, PLACEHOLDER_BANDS,
                     RANGE_QUANTILES, REFERENCE_SCHEDULE, SPEC, PedConfig, PlantedEffects, check_params, notice_text)
from .features import load_location_table, load_rain_climatology, load_training_table, typical_congestion
from .pedestrian import PedestrianModel, expected_pedestrians, ped_bounds, ped_component
from .scoring import build_record, compute_site_scores, to_jsonable
from .synthetic import synthetic_rain_climatology, write_synthetic
from .validation import effect_checks, overlap_check, sensitivity_test, validate_pedestrian_model


@dataclass
class TrainOptions:
    """Training settings; the defaults match `python train.py run`."""
    out_dir: str = "artifacts"
    data_dir: str | None = "data/synthetic"     # where synthetic tables are written
    training_csv: str | None = None             # supplied 21-column table; synthetic data if None
    locations_csv: str | None = None
    rain_climatology_csv: str | None = None
    source_type: str | None = None
    seed: int = 42
    start_date: str = "2026-05-01"
    business_types: list[str] = field(default_factory=lambda: list(BUSINESS_TYPES))
    open_hours: str = "8-20"
    open_days: str = "0-6"
    months: str = "1-12"
    train_days: int = 63
    objective: str = "count:poisson"
    monotone_rain: bool = False
    use_congestion: bool = False
    ped_scale: str = "linear"
    ped_bounds: tuple[float, float] | None = None
    skip_sensitivity: bool = False


def _write_json(path: Path, obj) -> None:
    path.write_text(json.dumps(to_jsonable(obj), indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


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


def run(options: TrainOptions) -> int:
    """Validate, train, score every site and write the artifacts and reports (see module docstring)."""
    out_dir = Path(options.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    business_types = tuple(options.business_types)
    unknown = [b for b in business_types if b not in PARAMS["business_fit"]]
    if unknown:
        raise SystemExit(f"no parameters for business types {unknown}; known: {list(PARAMS['business_fit'])}")
    params = copy.deepcopy(PARAMS)
    check_params(params)
    cfg = PedConfig(objective=options.objective, monotone_rain=options.monotone_rain, use_congestion=options.use_congestion,
                    train_days=options.train_days, seed=options.seed, open_days=parse_int_set(options.open_days),
                    open_hours=parse_int_set(options.open_hours, half_open=True), months=parse_int_set(options.months),
                    scale=options.ped_scale, bounds=tuple(options.ped_bounds) if options.ped_bounds else None)

    if bool(options.training_csv) != bool(options.locations_csv):
        raise SystemExit("pass both --training-csv and --locations-csv, or neither for synthetic data")
    if options.training_csv:
        training = load_training_table(options.training_csv, options.source_type)
        locations = load_location_table(options.locations_csv, business_types)
        planted = None
    else:
        training, locations = write_synthetic(Path(options.data_dir or options.out_dir), options.seed, options.start_date)
        planted = PlantedEffects()
    source_types = sorted(training["source_type"].astype(str).unique())
    synthetic = source_types == ["synthetic"]
    rain_clim = load_rain_climatology(options.rain_climatology_csv) if options.rain_climatology_csv else synthetic_rain_climatology()

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
    if not options.skip_sensitivity:
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

    # Serving artifacts for sitesuri_ml.inference
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

    _print_summary(report, bounds, cfg, raw_df, records, None if options.skip_sensitivity else summary, out_dir)
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

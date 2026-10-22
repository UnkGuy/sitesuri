"""Score one searched location on demand, for the FastAPI backend.

    from sitesuri_ml import ScoringService
    service = ScoringService()                      # load once, at app startup
    record = service.score(14.651, 121.049, "sari-sari store")

`score` returns one record in the scores.json format (spec §8.4) plus the matched site and the
prototype notice. Loading reads the artifacts written by `python -m sitesuri_ml.model run`;
scoring one point takes a few milliseconds.

Quick check from the ml/ folder:
    python -m sitesuri_ml.service --lat 14.651 --lon 121.049 --business-type "sari-sari store"
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path
from typing import Iterable

import pandas as pd

from .features import NearestSiteProvider
from .model import (DISCLAIMER, TRAINING_HOURS, PedConfig, PedestrianModel, _jsonable, build_record,
                    compute_site_scores, expected_pedestrians, load_params, notice_text, ped_component)

DEFAULT_ARTIFACTS = Path(os.environ.get("SITESURI_ML_ARTIFACTS", Path(__file__).resolve().parents[1] / "artifacts"))


class UnknownBusinessTypeError(ValueError):
    pass


class ScoringService:
    def __init__(self, artifacts_dir: str | Path | None = None, provider=None, max_distance_m: float = 500.0):
        self.artifacts_dir = Path(artifacts_dir or DEFAULT_ARTIFACTS)
        config_path = self.artifacts_dir / "scoring_config.json"
        if not config_path.exists():
            raise FileNotFoundError(f"{config_path} not found; train first: python -m sitesuri_ml.model run --out-dir artifacts")
        self.config = json.loads(config_path.read_text(encoding="utf-8"))
        self.params = load_params(self.config["params"])
        schedule = self.config["default_schedule"]
        m = self.config["model"]
        self.cfg = PedConfig(objective=m["objective"], monotone_rain=m["monotone_rain"], use_congestion=m["use_congestion"],
                             seed=m["seed"], open_days=tuple(schedule["open_days"]),
                             open_hours=tuple(schedule["open_hours"]), months=tuple(schedule["months"]),
                             scale=self.config["pedestrian_scaling"]["scale"])
        self.model = PedestrianModel.load(self.artifacts_dir / m["file"], self.cfg)
        self.rain_climatology = pd.read_csv(self.artifacts_dir / "rain_climatology.csv")
        congestion_path = self.artifacts_dir / "typical_congestion.csv"
        self.congestion = pd.read_csv(congestion_path) if m["use_congestion"] else None
        if m["use_congestion"] and not congestion_path.exists():
            raise FileNotFoundError(f"{congestion_path} is needed because the model uses vehicle congestion")
        self.provider = provider or NearestSiteProvider.from_csv(self.artifacts_dir / "locations.csv", max_distance_m)
        scaling = self.config["pedestrian_scaling"]
        self.bounds = (scaling["P_lo"], scaling["P_hi"])
        self.ratio_q = tuple(self.config["range_ratio_quantiles"])

    @property
    def business_types(self) -> list[str]:
        return list(self.config["business_types"])

    def score(self, latitude: float, longitude: float, business_type: str, *,
              open_hours: tuple[int, int] | None = None, open_days: Iterable[int] | None = None,
              months: Iterable[int] | None = None, location_label: str | None = None) -> dict:
        """Location score for one point and business type.

        open_hours is (opening hour, closing hour), e.g. (8, 20) for 08:00-20:00; open_days uses 0 = Monday.
        Raises UnknownBusinessTypeError, OutsideCoverageError (no data near the point) or ValueError.
        """
        if business_type not in self.business_types:
            raise UnknownBusinessTypeError(f"unknown business type {business_type!r}; choose one of {self.business_types}")
        hours = self._hours(open_hours)
        days = self._int_set(open_days, self.cfg.open_days, range(7), "open_days")
        month_set = self._int_set(months, self.cfg.months, range(1, 13), "months")

        site, match = self.provider.lookup(latitude, longitude)
        ped = expected_pedestrians(self.model, pd.DataFrame([site]), days, hours, month_set,
                                   self.rain_climatology, self.congestion).iloc[0].to_dict()
        ped["s_ped"] = float(ped_component(ped["p_bar"], self.bounds, self.cfg.scale))
        ped["range_lo"], ped["range_hi"] = ped["p_bar"] * self.ratio_q[0], ped["p_bar"] * self.ratio_q[1]

        result = compute_site_scores(site, business_type, ped["s_ped"], self.params)
        record = build_record(site, business_type, result, ped, self.params)
        record["location"] = location_label or record["location"]
        record["query"] = {"latitude": latitude, "longitude": longitude}
        record["matched_site"] = {**match, "address": site.get("address")}
        record["schedule"] = {"open_hours": f"{hours[0]:02d}:00-{hours[-1] + 1:02d}:00", "open_days": list(days),
                              "months": list(month_set)}
        record["notice"] = notice_text(self.config["synthetic"])
        record["disclaimer"] = DISCLAIMER
        return _jsonable(record)

    @staticmethod
    def _hours(open_hours) -> tuple[int, ...]:
        if open_hours is None:
            return tuple(range(8, 20))
        start, end = (int(v) for v in open_hours)
        hours = tuple(range(start, end))
        if not hours or not set(hours) <= set(TRAINING_HOURS):
            raise ValueError(f"open_hours must lie within {TRAINING_HOURS[0]:02d}:00-{TRAINING_HOURS[-1] + 1:02d}:00, "
                             f"got {start}-{end}")
        return hours

    @staticmethod
    def _int_set(values, default, allowed, name) -> tuple[int, ...]:
        if values is None:
            return tuple(default)
        chosen = tuple(sorted({int(v) for v in values}))
        if not chosen or not set(chosen) <= set(allowed):
            raise ValueError(f"{name} must be a non-empty subset of {list(allowed)}")
        return chosen


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Score one location with the trained SiteSuri model")
    parser.add_argument("--lat", type=float, required=True)
    parser.add_argument("--lon", type=float, required=True)
    parser.add_argument("--business-type", default="sari-sari store")
    parser.add_argument("--open-hours", type=int, nargs=2, metavar=("OPEN", "CLOSE"))
    parser.add_argument("--artifacts-dir")
    args = parser.parse_args(argv)
    service = ScoringService(args.artifacts_dir)
    print(json.dumps(service.score(args.lat, args.lon, args.business_type, open_hours=args.open_hours),
                     indent=2, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    sys.exit(main())

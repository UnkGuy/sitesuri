"""Pedestrian model (spec §5): XGBoost Poisson regressor for expected pedestrians per hour,
averaging over opening hours and seasons, and scaling to the 0-100 component score.
"""

from __future__ import annotations

from pathlib import Path

import numpy as np
import pandas as pd

try:
    import xgboost as xgb
except ImportError:  # the self-test and the synthetic generator run without xgboost
    xgb = None

from .config import (CONGESTION_FEATURE, DRY_MONTHS, LOCATION_TYPE_DTYPE, MODEL_FEATURES,
                     PED_BOUND_PERCENTILES, TARGET, TWEEDIE_VARIANCE_POWER, WET_MONTHS, PedConfig)
from .features import build_scoring_grid


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


def expected_pedestrians(model: PedestrianModel, sites: pd.DataFrame, days, hours, months,
                         rain_clim: pd.DataFrame, congestion: pd.DataFrame | None = None) -> pd.DataFrame:
    """P̄_l = mean over d ∈ D, h ∈ H, m ∈ M of λ̂, with seasonal-average rain and the payday window
    taken as an expectation over each month's calendar. Also P̄ for the dry and wet season."""
    grid = build_scoring_grid(sites, days, hours, months, rain_clim, congestion)
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

"""SiteSuri ML: MSME location opportunity score (model_architecture_v2.md, revision 2).

Modules: config (parameters, profiles, constants), synthetic (synthetic datasets), features (feature
preparation), pedestrian (XGBoost model), validation (metrics, holdouts, sensitivity), scoring (score
components and records), pipeline (training), inference (interface used by FastAPI), geocode (Nominatim).
"""

import importlib

# Imported lazily, so importing the package (or running one module with -m) stays light
_EXPORTS = {
    "ScoringService": ".inference",
    "UnknownBusinessTypeError": ".inference",
    "NearestSiteProvider": ".features",
    "OutsideCoverageError": ".features",
    "NominatimClient": ".geocode",
    "GeocodingError": ".geocode",
    "TrainOptions": ".pipeline",
}
__all__ = list(_EXPORTS)


def __getattr__(name):
    if name in _EXPORTS:
        return getattr(importlib.import_module(_EXPORTS[name], __name__), name)
    raise AttributeError(f"module {__name__!r} has no attribute {name!r}")

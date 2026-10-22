"""SiteSuri ML: MSME location opportunity score (model_architecture_v2.md, revision 2)."""

import importlib

# Imported lazily so `python -m sitesuri_ml.model` does not load the module twice
_EXPORTS = {
    "ScoringService": ".service",
    "UnknownBusinessTypeError": ".service",
    "NearestSiteProvider": ".features",
    "OutsideCoverageError": ".features",
    "NominatimClient": ".geocode",
    "GeocodingError": ".geocode",
}
__all__ = list(_EXPORTS)


def __getattr__(name):
    if name in _EXPORTS:
        return getattr(importlib.import_module(_EXPORTS[name], __name__), name)
    raise AttributeError(f"module {__name__!r} has no attribute {name!r}")

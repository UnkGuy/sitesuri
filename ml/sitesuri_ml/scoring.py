"""Score components and aggregation (spec §6-§8): business fit, asymmetric competition,
walkability, safety and hazard, the gated geometric mean with caps and flags, and the
scores.json record (§8.4).
"""

from __future__ import annotations

import math
from typing import Mapping

import numpy as np
import pandas as pd

from .config import COMPONENT_NAMES, FLOOD_CLASS_NAMES, PARAMS, POI_TYPES, competitor_column


# ---------------------------------------------------------------------------
# Rule-based components (§6)
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


# ---------------------------------------------------------------------------
# Safety and hazard (§7)
# ---------------------------------------------------------------------------

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


# ---------------------------------------------------------------------------
# Output records (§8.4)
# ---------------------------------------------------------------------------

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


def to_jsonable(obj):
    """Plain JSON types; NaN and infinity become None."""
    if isinstance(obj, Mapping):
        return {str(k): to_jsonable(v) for k, v in obj.items()}
    if isinstance(obj, (list, tuple)):
        return [to_jsonable(v) for v in obj]
    if isinstance(obj, (bool, np.bool_)):
        return bool(obj)
    if isinstance(obj, np.integer):
        return int(obj)
    if isinstance(obj, (float, np.floating)):
        return float(obj) if math.isfinite(obj) else None
    return obj

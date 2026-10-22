import json

import pandas as pd
import pytest

from sitesuri_ml import OutsideCoverageError, ScoringService, UnknownBusinessTypeError
from sitesuri_ml.inference import DEFAULT_ARTIFACTS

if not (DEFAULT_ARTIFACTS / "scoring_config.json").exists():
    pytest.skip("no trained artifacts; run: python train.py run", allow_module_level=True)


@pytest.fixture(scope="module")
def service():
    return ScoringService()


@pytest.fixture(scope="module")
def site():
    return pd.read_csv(DEFAULT_ARTIFACTS / "locations.csv").iloc[0]


def test_score_matches_precomputed_scores_json(service, site):
    precomputed = json.loads((DEFAULT_ARTIFACTS / "scores.json").read_text(encoding="utf-8"))["scores"]
    expected = next(r for r in precomputed if r["location_id"] == site["location_id"]
                    and r["business_type"] == "sari-sari store")
    record = service.score(site["latitude"], site["longitude"], "sari-sari store")
    assert record["matched_site"]["location_id"] == site["location_id"]
    assert record["matched_site"]["distance_m"] < 1
    assert record["location_score"] == pytest.approx(expected["location_score"], abs=0.11)
    assert [c["name"] for c in record["components"]] == [c["name"] for c in expected["components"]]


def test_record_shape(service, site):
    record = service.score(site["latitude"], site["longitude"], "food stall", location_label="Test St.")
    assert record["location"] == "Test St."
    assert 0 <= record["location_score"] <= 100
    assert {"flags", "caps_applied", "weakest_component", "components", "info_only", "notice"} <= record.keys()
    json.dumps(record, allow_nan=False)  # strict JSON


def test_shorter_hours_change_traffic(service, site):
    day = service.score(site["latitude"], site["longitude"], "food stall", open_hours=(8, 20))
    morning = service.score(site["latitude"], site["longitude"], "food stall", open_hours=(6, 8))
    assert day["components"][0]["detail"]["expected_peds_per_hour"] != \
        morning["components"][0]["detail"]["expected_peds_per_hour"]
    assert morning["schedule"]["open_hours"] == "06:00-08:00"


def test_errors(service, site):
    with pytest.raises(UnknownBusinessTypeError):
        service.score(site["latitude"], site["longitude"], "car dealership")
    with pytest.raises(OutsideCoverageError):
        service.score(10.3157, 123.8854, "food stall")  # Cebu City, outside the pilot area
    with pytest.raises(ValueError):
        service.score(site["latitude"], site["longitude"], "food stall", open_hours=(4, 23))


def test_sample_sites_are_scoreable(service):
    sites = service.sample_sites(3)
    assert len(sites) == 3 and {"location_id", "address", "latitude", "longitude"} <= sites[0].keys()
    record = service.score(sites[2]["latitude"], sites[2]["longitude"], "general retail")
    assert record["matched_site"]["location_id"] == sites[2]["location_id"]

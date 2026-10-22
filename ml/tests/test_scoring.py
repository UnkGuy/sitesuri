import json

import pytest

from sitesuri_ml.config import PARAMS, load_params
from sitesuri_ml.scoring import aggregate, business_fit_score, competition_score, to_jsonable
from sitesuri_ml.validation import spec_checks


@pytest.mark.parametrize("name, ok, detail", spec_checks(), ids=lambda v: v if isinstance(v, str) else "")
def test_spec_worked_example(name, ok, detail):
    assert ok, f"{name}: {detail}"


def test_params_survive_json_round_trip():
    assert load_params(json.loads(json.dumps(to_jsonable(PARAMS)))) == PARAMS


def test_scores_stay_in_range():
    counts = {"school": 0, "market": 0, "office": 0, "shop": 50}
    for b in PARAMS["business_fit"]:
        assert 0 <= business_fit_score(counts, b) <= 100
        for c in range(30):
            assert 0 <= competition_score(c, b) <= 100
    zeros = dict.fromkeys(PARAMS["weights"], 0.0)
    assert aggregate(zeros, 0, 5000, 0)[0] == pytest.approx(PARAMS["geo_floor"])

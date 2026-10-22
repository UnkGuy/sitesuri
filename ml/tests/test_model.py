from sitesuri_ml import model


def test_formulas_match_spec_worked_examples():
    assert model.selftest() == 0


def test_params_survive_json_round_trip():
    import json

    restored = model.load_params(json.loads(json.dumps(model._jsonable(model.PARAMS))))
    assert restored == model.PARAMS

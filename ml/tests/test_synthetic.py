import numpy as np
import pytest

from sitesuri_ml.config import BUSINESS_TYPES, LOCATION_TYPES, TRAINING_COLUMNS, competitor_column
from sitesuri_ml.features import REQUIRED_SITE_FIELDS
from sitesuri_ml.synthetic import generate_location_table, generate_training_table
from sitesuri_ml.validation import grouped_folds, spearman


@pytest.fixture(scope="module")
def tables():
    rng = np.random.default_rng(42)
    locations = generate_location_table(rng)
    return locations, generate_training_table(locations, rng)


def test_training_table_shape(tables):
    _, training = tables
    assert training.shape == (144_000, 21)  # 100 locations x 16 hours x 90 days (§4.1)
    assert list(training.columns) == TRAINING_COLUMNS
    assert (training["pedestrian_count"] >= 0).all()
    assert set(training["hour"]) == set(range(6, 22))
    assert set(training["source_type"]) == {"synthetic"}


def test_location_table_has_every_scoring_input(tables):
    locations, _ = tables
    assert len(locations) == 100 and locations["location_id"].is_unique
    assert set(REQUIRED_SITE_FIELDS) <= set(locations.columns)
    assert set(locations["location_type"]) <= set(LOCATION_TYPES)
    assert set(locations["flood_hazard_class"]) <= {0, 1, 2, 3}
    assert all(competitor_column(b) in locations for b in BUSINESS_TYPES)


def test_generator_is_reproducible():
    a = generate_location_table(np.random.default_rng(7))
    b = generate_location_table(np.random.default_rng(7))
    assert a.equals(b)


def test_grouped_folds_hold_out_whole_groups():
    groups = np.repeat([f"B{i}" for i in range(20)], 5)
    folds = grouped_folds(groups, 5, seed=0)
    held = np.concatenate(folds)
    assert len(folds) == 5 and sorted(held) == sorted(set(groups))  # each block in exactly one fold


def test_spearman():
    assert spearman([1, 2, 3], [10, 20, 30]) == pytest.approx(1.0)
    assert spearman([1, 2, 3], [3, 2, 1]) == pytest.approx(-1.0)

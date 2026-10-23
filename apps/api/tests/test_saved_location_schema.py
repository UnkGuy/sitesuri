from uuid import uuid4

import pytest
from pydantic import ValidationError

from app.schemas.saved_location import SaveLocationRequest, UpdateSavedLocationRequest


def test_valid_bookmark_category():
    item = SaveLocationRequest(location_id=uuid4(), business_type="food stall")
    assert item.notes is None


def test_rejects_invalid_category():
    with pytest.raises(ValidationError):
        SaveLocationRequest(location_id=uuid4(), business_type="restaurant")


def test_rejects_long_notes():
    with pytest.raises(ValidationError):
        UpdateSavedLocationRequest(notes="n" * 501)

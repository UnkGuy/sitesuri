from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field

BusinessType = Literal["food stall", "sari-sari store", "general retail"]


class SaveLocationRequest(BaseModel):
    location_id: UUID
    business_type: BusinessType
    notes: str | None = Field(default=None, max_length=500)


class UpdateSavedLocationRequest(BaseModel):
    notes: str | None = Field(max_length=500)


class SavedLocationOut(BaseModel):
    id: UUID
    location_id: UUID
    business_type: BusinessType
    notes: str | None
    created_at: datetime
    updated_at: datetime
    source_location_id: str | None
    address: str | None
    latitude: float
    longitude: float
    location_type: str | None
    location_score: float | None


class CategoryScore(BaseModel):
    business_type: BusinessType
    location_score: float


class SavedComparisonOut(BaseModel):
    location_id: UUID
    source_location_id: str | None
    address: str | None
    latitude: float
    longitude: float
    scores: list[CategoryScore]

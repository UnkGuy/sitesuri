
from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field

from app.schemas.locations import (
    LocationResponse,
    LocationScoreResponse,
)

BusinessType = Literal[
    "food stall",
    "sari-sari store",
    "general retail",
]


class AnalysisCreate(BaseModel):
    location_id: UUID
    business_type: BusinessType
    display_radius_meters: int | None = Field(
        default=500,
        ge=100,
        le=5000,
    )


class AnalysisSummary(BaseModel):
    id: UUID
    created_at: datetime
    location_id: UUID
    source_location_id: str
    address: str | None
    business_type: str
    location_score: float
    display_radius_meters: int | None
    source_type: str


class AnalysisResponse(BaseModel):
    id: UUID
    created_at: datetime
    display_radius_meters: int | None
    prediction_mode: Literal["precomputed"] = "precomputed"
    source_type: str
    location: LocationResponse
    score: LocationScoreResponse

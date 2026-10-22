
from uuid import UUID
from typing import Any

from pydantic import BaseModel, Field


class LocationResponse(BaseModel):
    id: UUID
    source_location_id: str
    address: str | None = None
    location_type: str
    latitude: float
    longitude: float
    source_type: str
    features: dict[str, Any] = Field(default_factory=dict)


class LocationScoreResponse(BaseModel):
    location_id: UUID
    source_location_id: str
    business_type: str
    location_score: float
    weakest_component: str | None = None
    flags: list[str] = Field(default_factory=list)
    caps_applied: list[str] = Field(default_factory=list)
    components: list[dict[str, Any]]
    info_only: dict[str, Any] = Field(default_factory=dict)
    model_version: str
    source_type: str

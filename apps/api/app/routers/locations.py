
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.location_analysis import (
    Dataset,
    Location,
    ModelRun,
    LocationScore,
)
from app.schemas.locations import (
    LocationResponse,
    LocationScoreResponse,
)

router = APIRouter(tags=["Locations"])

DATASET_NAME = "sitesuri-ml-locations"
DATASET_VERSION = "hackathon-synthetic-v1"


def get_dataset(db: Session) -> Dataset:
    dataset = db.scalar(
        select(Dataset).where(
            Dataset.name == DATASET_NAME,
            Dataset.version == DATASET_VERSION,
        )
    )

    if dataset is None:
        raise HTTPException(
            status_code=503,
            detail="ML location dataset is not available.",
        )

    return dataset


@router.get("/business-types", response_model=list[str])
def get_business_types(db: Session = Depends(get_db)):
    dataset = get_dataset(db)

    stmt = (
        select(LocationScore.business_type)
        .join(
            ModelRun,
            LocationScore.model_run_id == ModelRun.id,
        )
        .where(ModelRun.dataset_id == dataset.dataset_id)
        .distinct()
        .order_by(LocationScore.business_type)
    )

    return list(db.scalars(stmt).all())


@router.get("/locations", response_model=list[LocationResponse])
def get_locations(
    limit: int = Query(default=100, ge=1, le=100),
    db: Session = Depends(get_db),
):
    dataset = get_dataset(db)

    stmt = (
        select(Location)
        .where(Location.dataset_id == dataset.dataset_id)
        .order_by(Location.source_location_id)
        .limit(limit)
    )

    locations = db.scalars(stmt).all()

    return [
        LocationResponse(
            id=loc.id,
            source_location_id=loc.source_location_id,
            address=loc.address,
            location_type=loc.location_type,
            latitude=loc.latitude,
            longitude=loc.longitude,
            source_type=dataset.source_type,
            features=loc.features or {},
        )
        for loc in locations
    ]


@router.get(
    "/locations/{location_id}/scores",
    response_model=LocationScoreResponse,
)
def get_location_score(
    location_id: UUID,
    business_type: str = Query(...),
    db: Session = Depends(get_db),
):
    dataset = get_dataset(db)

    stmt = (
        select(LocationScore, ModelRun, Location)
        .join(
            ModelRun,
            LocationScore.model_run_id == ModelRun.id,
        )
        .join(
            Location,
            LocationScore.location_id == Location.id,
        )
        .where(
            Location.id == location_id,
            Location.dataset_id == dataset.dataset_id,
            ModelRun.dataset_id == dataset.dataset_id,
            LocationScore.business_type == business_type,
        )
        .order_by(
            ModelRun.generated_at.desc(),
            ModelRun.id.desc(),
        )
        .limit(1)
    )

    result = db.execute(stmt).first()

    if result is None:
        raise HTTPException(
            status_code=404,
            detail="No score found for this location and business type.",
        )

    score, model_run, location = result

    return LocationScoreResponse(
        location_id=location.id,
        source_location_id=location.source_location_id,
        business_type=score.business_type,
        location_score=float(score.location_score),
        weakest_component=score.weakest_component,
        flags=score.flags or [],
        caps_applied=score.caps_applied or [],
        components=score.components,
        info_only=score.info_only or {},
        model_version=model_run.model_version,
        source_type=dataset.source_type,
    )


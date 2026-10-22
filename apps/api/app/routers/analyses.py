
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth.dependencies import get_current_clerk_id
from app.database import get_db
from app.models.users import User
from app.models.location_analysis import (
    Dataset,
    Location,
    LocationScore,
    ModelRun,
    UserAnalysis,
)
from app.routers.locations import get_dataset
from app.schemas.locations import LocationResponse, LocationScoreResponse
from app.schemas.analyses import (
    AnalysisCreate,
    AnalysisResponse,
    AnalysisSummary,
)

router = APIRouter(prefix="/analyses", tags=["Analyses"])


def get_user(db: Session, clerk_user_id: str) -> User:
    user = db.scalar(
        select(User).where(User.clerk_user_id == clerk_user_id)
    )

    if user is None:
        raise HTTPException(
            status_code=404,
            detail="User not synchronized. Call POST /users first.",
        )

    return user


def analysis_query():
    return (
        select(
            UserAnalysis,
            LocationScore,
            Location,
            ModelRun,
            Dataset,
        )
        .join(
            LocationScore,
            UserAnalysis.location_score_id == LocationScore.id,
        )
        .join(
            Location,
            LocationScore.location_id == Location.id,
        )
        .join(
            ModelRun,
            LocationScore.model_run_id == ModelRun.id,
        )
        .join(
            Dataset,
            Location.dataset_id == Dataset.dataset_id,
        )
        .where(ModelRun.dataset_id == Dataset.dataset_id)
    )


def to_summary(analysis, score, location, dataset):
    return AnalysisSummary(
        id=analysis.id,
        created_at=analysis.created_at,
        location_id=location.id,
        source_location_id=location.source_location_id,
        address=location.address,
        business_type=score.business_type,
        location_score=float(score.location_score),
        display_radius_meters=analysis.display_radius_meters,
        source_type=dataset.source_type,
    )


def to_response(analysis, score, location, run, dataset):
    return AnalysisResponse(
        id=analysis.id,
        created_at=analysis.created_at,
        display_radius_meters=analysis.display_radius_meters,
        prediction_mode="precomputed",
        source_type=dataset.source_type,
        location=LocationResponse(
            id=location.id,
            source_location_id=location.source_location_id,
            address=location.address,
            location_type=location.location_type,
            latitude=location.latitude,
            longitude=location.longitude,
            source_type=dataset.source_type,
            features=location.features or {},
        ),
        score=LocationScoreResponse(
            location_id=location.id,
            source_location_id=location.source_location_id,
            business_type=score.business_type,
            location_score=float(score.location_score),
            weakest_component=score.weakest_component,
            flags=score.flags or [],
            caps_applied=score.caps_applied or [],
            components=score.components,
            info_only=score.info_only or {},
            model_version=run.model_version,
            source_type=dataset.source_type,
        ),
    )


@router.post(
    "",
    response_model=AnalysisResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_analysis(
    payload: AnalysisCreate,
    clerk_user_id: Annotated[str, Depends(get_current_clerk_id)],
    db: Annotated[Session, Depends(get_db)],
):
    user = get_user(db, clerk_user_id)
    dataset = get_dataset(db)

    # Find the newest available precomputed result
    # for this location and business type.
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
            Location.id == payload.location_id,
            Location.dataset_id == dataset.dataset_id,
            ModelRun.dataset_id == dataset.dataset_id,
            LocationScore.business_type == payload.business_type,
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
            detail="No precomputed score for this location and business type.",
        )

    score, run, location = result

    analysis = UserAnalysis(
        user_id=user.user_id,
        location_score_id=score.id,
        display_radius_meters=payload.display_radius_meters,
    )

    db.add(analysis)

    try:
        db.commit()
        db.refresh(analysis)
    except Exception:
        db.rollback()
        raise

    return to_response(
        analysis, score, location, run, dataset
    )


@router.get("", response_model=list[AnalysisSummary])
def list_analyses(
    clerk_user_id: Annotated[str, Depends(get_current_clerk_id)],
    db: Annotated[Session, Depends(get_db)],
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
):
    user = get_user(db, clerk_user_id)

    stmt = (
        analysis_query()
        .where(UserAnalysis.user_id == user.user_id)
        .order_by(
            UserAnalysis.created_at.desc(),
            UserAnalysis.id.desc(),
        )
        .offset(offset)
        .limit(limit)
    )

    rows = db.execute(stmt).all()

    return [
        to_summary(analysis, score, location, dataset)
        for analysis, score, location, run, dataset in rows
    ]


@router.get(
    "/{analysis_id}",
    response_model=AnalysisResponse,
)
def get_analysis(
    analysis_id: UUID,
    clerk_user_id: Annotated[str, Depends(get_current_clerk_id)],
    db: Annotated[Session, Depends(get_db)],
):
    user = get_user(db, clerk_user_id)

    # The user_id condition prevents access to another
    # user's saved analysis.
    stmt = analysis_query().where(
        UserAnalysis.id == analysis_id,
        UserAnalysis.user_id == user.user_id,
    )

    result = db.execute(stmt).first()

    if result is None:
        raise HTTPException(
            status_code=404,
            detail="Analysis not found.",
        )

    analysis, score, location, run, dataset = result

    return to_response(
        analysis, score, location, run, dataset
    )

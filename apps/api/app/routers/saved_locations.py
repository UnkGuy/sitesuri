"""Personal saved candidates, linked to Clerk-authenticated Supabase users.

Scores are always read from the latest imported model run (never client-written).
A location saved for multiple categories has one bookmark per category, but
comparison charts deduplicate physical candidate locations.
"""

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import bindparam, text
from sqlalchemy.orm import Session

from app.auth.dependencies import (
    get_current_clerk_id as require_clerk_user,
)
from app.database import get_db
from app.schemas.saved_location import (
    SaveLocationRequest,
    SavedLocationOut,
    SavedComparisonOut,
    CategoryScore,
    UpdateSavedLocationRequest,
)

router = APIRouter(prefix="/saved-locations", tags=["Saved Locations"])
ClerkId = Annotated[str, Depends(require_clerk_user)]
Database = Annotated[Session, Depends(get_db)]

# The LATERAL query finds the latest *category-specific* score for each saved
# candidate. Missing scores remain NULL, never 0.
LIST_SQL = text("""
    SELECT sl.id, sl.location_id, sl.business_type, sl.notes,
           sl.created_at, sl.updated_at,
           l.source_location_id, l.address, l.latitude, l.longitude,
           l.location_type, latest.location_score
    FROM public.saved_locations AS sl
    JOIN public.locations AS l ON l.id = sl.location_id
    LEFT JOIN LATERAL (
        SELECT ls.location_score
        FROM public.location_scores AS ls
        JOIN public.model_runs AS mr ON mr.id = ls.model_run_id
        WHERE ls.location_id = sl.location_id
          AND ls.business_type = sl.business_type
        ORDER BY mr.generated_at DESC, mr.id DESC
        LIMIT 1
    ) AS latest ON TRUE
    WHERE sl.user_id = :owner
    ORDER BY sl.created_at DESC, sl.id DESC
    LIMIT 200
""")


def owner_id(db: Session, clerk_user_id: str) -> UUID:
    result = db.execute(
        text("SELECT user_id FROM public.users WHERE clerk_user_id = :clerk_id"),
        {"clerk_id": clerk_user_id},
    ).scalar_one_or_none()
    if result is None:
        raise HTTPException(status_code=409, detail="Account not synchronized; revisit dashboard")
    return result


def saved_rows(db: Session, owner: UUID) -> list[dict]:
    return [dict(row) for row in db.execute(LIST_SQL, {"owner": owner}).mappings().all()]


@router.get("", response_model=list[SavedLocationOut])
def list_saved_locations(clerk_user_id: ClerkId, db: Database):
    return saved_rows(db, owner_id(db, clerk_user_id))


@router.post("", response_model=SavedLocationOut, status_code=status.HTTP_201_CREATED)
def save_location(payload: SaveLocationRequest, clerk_user_id: ClerkId, db: Database):
    owner = owner_id(db, clerk_user_id)
    exists = db.execute(
        text("SELECT 1 FROM public.locations WHERE id = :id"),
        {"id": payload.location_id},
    ).scalar_one_or_none()
    if exists is None:
        raise HTTPException(status_code=404, detail="Candidate location not found")
    # Duplicate bookmarks return the existing row and optionally update notes.
    new_id = db.execute(
        text("""
            INSERT INTO public.saved_locations (user_id, location_id, business_type, notes)
            VALUES (:owner, :location, :business_type, :notes)
            ON CONFLICT (user_id, location_id, business_type)
            DO UPDATE SET notes = COALESCE(EXCLUDED.notes, public.saved_locations.notes),
                          updated_at = now()
            RETURNING id
        """),
        {
            "owner": owner,
            "location": payload.location_id,
            "business_type": payload.business_type,
            "notes": payload.notes,
        },
    ).scalar_one()
    db.commit()
    row = next((item for item in saved_rows(db, owner) if item["id"] == new_id), None)
    if row is None:
        raise HTTPException(status_code=500, detail="Could not load saved location")
    return row


@router.patch("/{saved_id}", response_model=SavedLocationOut)
def update_saved_location(saved_id: UUID, payload: UpdateSavedLocationRequest, clerk_user_id: ClerkId, db: Database):
    owner = owner_id(db, clerk_user_id)
    found = db.execute(
        text("""
            UPDATE public.saved_locations SET notes = :notes, updated_at = now()
            WHERE id = :saved_id AND user_id = :owner
            RETURNING id
        """),
        {"notes": payload.notes, "saved_id": saved_id, "owner": owner},
    ).scalar_one_or_none()
    if found is None:
        db.rollback()
        raise HTTPException(status_code=404, detail="Saved location not found")
    db.commit()
    return next(item for item in saved_rows(db, owner) if item["id"] == found)


@router.delete("/{saved_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_saved_location(saved_id: UUID, clerk_user_id: ClerkId, db: Database):
    owner = owner_id(db, clerk_user_id)
    deleted = db.execute(
        text("""
            DELETE FROM public.saved_locations
            WHERE id = :saved_id AND user_id = :owner
            RETURNING id
        """),
        {"saved_id": saved_id, "owner": owner},
    ).scalar_one_or_none()
    if deleted is None:
        db.rollback()
        raise HTTPException(status_code=404, detail="Saved location not found")
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


SCORES_SQL = text("""
    SELECT ls.location_id, ls.business_type, ls.location_score
    FROM public.location_scores AS ls
    JOIN public.model_runs AS mr ON mr.id = ls.model_run_id
    WHERE ls.location_id IN :location_ids
    ORDER BY ls.location_id, ls.business_type, mr.generated_at DESC, mr.id DESC
""").bindparams(bindparam("location_ids", expanding=True))


@router.get("/comparison", response_model=list[SavedComparisonOut])
def compare_saved_locations(clerk_user_id: ClerkId, db: Database, ids: str | None = None):
    """Return latest scores in all three categories for owned bookmarked sites.

    ids: optional comma-separated saved_locations.id values (max 20). Empty
    means all bookmarks, capped at 200; UI should select a small comparison set.
    """
    owner = owner_id(db, clerk_user_id)
    all_rows = saved_rows(db, owner)
    if ids is not None:
        raw_ids = [part.strip() for part in ids.split(",") if part.strip()]
        if not raw_ids or len(raw_ids) > 20:
            raise HTTPException(status_code=422, detail="Select 1 to 20 saved locations")
        try:
            requested = {UUID(part) for part in raw_ids}
        except ValueError:
            raise HTTPException(status_code=422, detail="Invalid saved location ID") from None
        matched = [row for row in all_rows if row["id"] in requested]
        if len({row["id"] for row in matched}) != len(requested):
            raise HTTPException(status_code=404, detail="One or more saved locations not found")
    else:
        matched = all_rows

    locations = {}
    for row in matched:
        locations.setdefault(row["location_id"], row)
    if not locations:
        return []

    raw_scores = db.execute(
        SCORES_SQL, {"location_ids": list(locations.keys())}
    ).mappings().all()
    scores_by_location = {location_id: [] for location_id in locations}
    seen = set()
    for result in raw_scores:
        key = (result["location_id"], result["business_type"])
        if key in seen or result["location_score"] is None:
            continue
        seen.add(key)
        scores_by_location[result["location_id"]].append(CategoryScore(
            business_type=result["business_type"],
            location_score=float(result["location_score"]),
        ))

    return [SavedComparisonOut(
        location_id=location_id,
        source_location_id=row["source_location_id"],
        address=row["address"],
        latitude=float(row["latitude"]),
        longitude=float(row["longitude"]),
        scores=scores_by_location[location_id],
    ) for location_id, row in locations.items()]

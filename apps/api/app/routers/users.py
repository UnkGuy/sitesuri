
import uuid

import httpx

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from app.auth.dependencies import get_current_clerk_id
from app.core.config import settings
from app.database import get_db
from app.models.users import User
from app.schemas.users import UserResponse


router = APIRouter(
    prefix="/users",
    tags=["Users"],
)


def fetch_clerk_profile(clerk_user_id: str) -> dict:
    """Get trusted profile data using Clerk's server-side API."""

    try:
        response = httpx.get(
            f"https://api.clerk.com/v1/users/{clerk_user_id}",
            headers={
                "Authorization": f"Bearer {settings.clerk_secret_key}"
            },
            timeout=10,
        )
        response.raise_for_status()
        profile = response.json()
    except (httpx.HTTPError, ValueError):
        raise HTTPException(
            status_code=502,
            detail="Unable to retrieve the Clerk user profile.",
        ) from None

    if profile.get("id") != clerk_user_id:
        raise HTTPException(
            status_code=502,
            detail="Clerk returned an unexpected user profile.",
        )

    primary_email_id = profile.get("primary_email_address_id")

    primary_email = next(
        (
            entry.get("email_address")
            for entry in profile.get("email_addresses", [])
            if entry.get("id") == primary_email_id
        ),
        None,
    )

    return {
        "email": primary_email,
        "first_name": profile.get("first_name"),
        "last_name": profile.get("last_name"),
    }


@router.post("", response_model=UserResponse)
def synchronize_user(
    clerk_user_id: str = Depends(get_current_clerk_id),
    db: Session = Depends(get_db),
):
    """Create or update the authenticated user's local record."""

    profile = fetch_clerk_profile(clerk_user_id)

    statement = insert(User).values(
        user_id=uuid.uuid4(),
        clerk_user_id=clerk_user_id,
        **profile,
    )

    statement = statement.on_conflict_do_update(
        index_elements=[User.clerk_user_id],
        set_={
            "email": statement.excluded.email,
            "first_name": statement.excluded.first_name,
            "last_name": statement.excluded.last_name,
        },
    ).returning(User.user_id)

    try:
        user_id = db.execute(statement).scalar_one()
        db.commit()
        return db.get(User, user_id)
    except Exception:
        db.rollback()
        raise


@router.get("/me", response_model=UserResponse)
def get_my_profile(
    clerk_user_id: str = Depends(get_current_clerk_id),
    db: Session = Depends(get_db),
):
    """Retrieve the current user's existing SiteSuri record."""

    user = db.scalar(
        select(User).where(
            User.clerk_user_id == clerk_user_id
        )
    )

    if user is None:
        raise HTTPException(
            status_code=404,
            detail="User profile not found. Synchronize your account first.",
        )

    return user

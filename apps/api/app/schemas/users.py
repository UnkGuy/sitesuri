
from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict


class UserResponse(BaseModel):
    user_id: UUID
    clerk_user_id: str
    email: str | None
    first_name: str | None
    last_name: str | None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)

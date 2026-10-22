
import jwt

from fastapi import Depends, HTTPException, status
from fastapi.security import (
    HTTPAuthorizationCredentials,
    HTTPBearer,
)
from jwt import PyJWKClient

from app.core.config import settings


bearer_scheme = HTTPBearer(auto_error=False)

# Fetch and cache Clerk's public signing keys.
jwks_client = PyJWKClient(
    f"{settings.clerk_issuer.rstrip('/')}/.well-known/jwks.json",
    cache_jwk_set=True,
    lifespan=300,
)


def get_current_clerk_id(
    credentials: HTTPAuthorizationCredentials | None = Depends(
        bearer_scheme
    ),
) -> str:
    unauthorized = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid or expired authentication token.",
        headers={"WWW-Authenticate": "Bearer"},
    )

    if credentials is None:
        raise unauthorized

    token = credentials.credentials

    try:
        signing_key = jwks_client.get_signing_key_from_jwt(token)

        claims = jwt.decode(
            token,
            signing_key.key,
            algorithms=["RS256"],
            issuer=settings.clerk_issuer.rstrip("/"),
            options={
                "require": [
                    "exp",
                    "iat",
                    "nbf",
                    "iss",
                    "sub",
                    "sid",
                ],
                "verify_aud": False,
            },
            leeway=10,
        )
    except jwt.PyJWTError:
        raise unauthorized from None

    # Reject tokens intended for another audience.
    # Default Clerk session tokens normally omit aud.
    if claims.get("aud"):
        raise unauthorized

    # Validate the origin that obtained the Clerk session.
    authorized_party = claims.get("azp")

    if authorized_party and (
        authorized_party not in settings.allowed_origins
    ):
        raise unauthorized

    # Reject sessions awaiting required organization setup.
    if claims.get("sts") == "pending":
        raise unauthorized

    clerk_user_id = claims.get("sub")

    if not isinstance(clerk_user_id, str) or not clerk_user_id:
        raise unauthorized

    return clerk_user_id

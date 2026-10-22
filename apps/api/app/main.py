
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.routers import users

from app.routers.locations import router as locations_router
from app.routers.analyses import router as analyses_router

app = FastAPI(
    title="SiteSuri API",
    description="Backend services for geographic business location analysis.",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PATCH", "DELETE"],
    allow_headers=["Authorization", "Content-Type"],
)

app.include_router(users.router)
app.include_router(locations_router)
app.include_router(analyses_router)

@app.get("/health", tags=["Health"])
def health_check():
    return {
        "status": "ok",
        "service": "SiteSuri API",
    }

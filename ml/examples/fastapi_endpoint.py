"""Example FastAPI endpoints calling the ML package. A starting point for apps/api, not the real API.

Run from the ml/ folder (after `pip install -e ".[api]"`):
    export NOMINATIM_USER_AGENT="SiteSuri/0.1 (your-team-email@example.com)"   # enables /map/search
    uvicorn examples.fastapi_endpoint:app --reload
Then open http://127.0.0.1:8000/docs, or the Next.js page at http://localhost:3000/score
"""

import os

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

from sitesuri_ml import (GeocodingError, NominatimClient, OutsideCoverageError, ScoringService,
                         UnknownBusinessTypeError)

app = FastAPI(title="SiteSuri ML example")

# Let the Next.js dev server (another origin) call this API from the browser
app.add_middleware(
    CORSMiddleware,
    allow_origins=os.environ.get("SITESURI_CORS_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000").split(","),
    allow_methods=["GET"],
    allow_headers=["*"],
)

service = ScoringService()  # loads the model once, at startup
user_agent = os.environ.get("NOMINATIM_USER_AGENT")
geocoder = NominatimClient(user_agent) if user_agent else None


@app.get("/map/business-types")
def business_types() -> list[str]:
    return service.business_types


@app.get("/map/sample-sites")
def sample_sites(limit: int = Query(20, ge=1, le=100)) -> list[dict]:
    """Points inside the prototype's coverage, for a demo picker."""
    return service.sample_sites(limit)


@app.get("/map/search")
def search(q: str = Query(..., min_length=3, max_length=200)) -> list[dict]:
    """Search box -> candidate places (Nominatim, Philippines only)."""
    if geocoder is None:
        raise HTTPException(503, "geocoding is not configured (set NOMINATIM_USER_AGENT)")
    try:
        return geocoder.search(q)
    except GeocodingError as exc:
        raise HTTPException(502, str(exc))


@app.get("/map/score")
def score(lat: float = Query(..., ge=-90, le=90), lon: float = Query(..., ge=-180, le=180),
          business_type: str = "sari-sari store",
          open_hour: int = Query(8, ge=6, le=21), close_hour: int = Query(20, ge=7, le=22)) -> dict:
    """Location score for a point, with its address from Nominatim reverse geocoding."""
    label = None
    if geocoder is not None:
        try:
            label = geocoder.reverse(lat, lon)["display_name"]
        except GeocodingError:
            pass  # the score does not depend on the address text
    try:
        return service.score(lat, lon, business_type, open_hours=(open_hour, close_hour), location_label=label)
    except UnknownBusinessTypeError as exc:
        raise HTTPException(422, str(exc))
    except OutsideCoverageError as exc:
        raise HTTPException(404, str(exc))
    except ValueError as exc:
        raise HTTPException(422, str(exc))

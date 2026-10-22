"""Nominatim geocoding (OpenStreetMap) for single user searches.

The public Nominatim server allows at most 1 request per second, needs a User-Agent that identifies
the app, and forbids bulk or periodic geocoding (https://operations.osmfoundation.org/policies/nominatim/).
This client enforces the rate limit, caches reverse lookups in memory, and returns the attribution the
OSM licence requires. Search text is not logged or stored (spec §14).
"""

from __future__ import annotations

import json
import threading
import time
from collections import OrderedDict
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

NOMINATIM_URL = "https://nominatim.openstreetmap.org"
ATTRIBUTION = "© OpenStreetMap contributors"
# Bias forward searches toward the pilot area (lon_min, lat_max, lon_max, lat_min)
METRO_MANILA_VIEWBOX = "120.90,14.80,121.15,14.45"


class GeocodingError(RuntimeError):
    pass


class NominatimClient:
    def __init__(self, user_agent: str, base_url: str = NOMINATIM_URL, min_interval_s: float = 1.0,
                 timeout_s: float = 10.0, cache_size: int = 1024, language: str = "en"):
        if not user_agent or not user_agent.strip():
            raise ValueError("Nominatim needs a User-Agent naming the app and a contact, e.g. 'SiteSuri/0.1 (you@example.com)'")
        self.user_agent, self.base_url = user_agent, base_url.rstrip("/")
        self.min_interval_s, self.timeout_s, self.language = min_interval_s, timeout_s, language
        self._lock = threading.Lock()
        self._last_request = 0.0
        self._cache: OrderedDict[tuple, dict] = OrderedDict()
        self._cache_size = cache_size

    def _get(self, path: str, query: dict):
        url = f"{self.base_url}/{path}?{urlencode({**query, 'format': 'jsonv2'})}"
        request = Request(url, headers={"User-Agent": self.user_agent, "Accept-Language": self.language})
        with self._lock:  # one request at a time, at most one per min_interval_s
            wait = self._last_request + self.min_interval_s - time.monotonic()
            if wait > 0:
                time.sleep(wait)
            try:
                with urlopen(request, timeout=self.timeout_s) as response:
                    return json.load(response)
            except (HTTPError, URLError, TimeoutError, json.JSONDecodeError) as exc:
                raise GeocodingError(f"Nominatim request failed: {exc}") from exc
            finally:
                self._last_request = time.monotonic()

    def reverse(self, latitude: float, longitude: float, zoom: int = 18) -> dict:
        """Address for a point: {display_name, address, latitude, longitude, attribution}."""
        key = (round(latitude, 5), round(longitude, 5), zoom)
        if key in self._cache:
            self._cache.move_to_end(key)
            return self._cache[key]
        data = self._get("reverse", {"lat": latitude, "lon": longitude, "zoom": zoom, "addressdetails": 1})
        if not isinstance(data, dict) or "error" in data:
            raise GeocodingError(f"no address found at {latitude}, {longitude}")
        result = {"display_name": data.get("display_name"), "address": data.get("address", {}),
                  "latitude": float(data["lat"]), "longitude": float(data["lon"]), "attribution": ATTRIBUTION}
        self._cache[key] = result
        if len(self._cache) > self._cache_size:
            self._cache.popitem(last=False)
        return result

    def search(self, text: str, limit: int = 5) -> list[dict]:
        """Candidate places for a search box entry, limited to the Philippines."""
        if not text or not text.strip():
            return []
        data = self._get("search", {"q": text.strip(), "limit": max(1, min(limit, 10)), "countrycodes": "ph",
                                    "viewbox": METRO_MANILA_VIEWBOX, "addressdetails": 0})
        if not isinstance(data, list):
            raise GeocodingError("unexpected Nominatim search response")
        return [{"display_name": d.get("display_name"), "latitude": float(d["lat"]), "longitude": float(d["lon"]),
                 "attribution": ATTRIBUTION} for d in data]

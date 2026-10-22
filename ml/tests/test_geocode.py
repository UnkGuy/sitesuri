import io
import json
import time

import pytest

from sitesuri_ml import geocode
from sitesuri_ml.geocode import GeocodingError, NominatimClient


class FakeUrlopen:
    """Stands in for urllib's urlopen so tests never call the real Nominatim server."""

    def __init__(self, payload):
        self.payload, self.requests = payload, []

    def __call__(self, request, timeout):
        self.requests.append(request)
        return io.BytesIO(json.dumps(self.payload).encode())


@pytest.fixture
def fake(monkeypatch):
    def install(payload):
        f = FakeUrlopen(payload)
        monkeypatch.setattr(geocode, "urlopen", f)
        return f
    return install


def test_user_agent_required():
    with pytest.raises(ValueError):
        NominatimClient("")


def test_reverse_sends_user_agent_and_caches(fake):
    f = fake({"display_name": "Quezon City, Metro Manila", "address": {"city": "Quezon City"},
              "lat": "14.65", "lon": "121.05"})
    client = NominatimClient("SiteSuri-test/0.1 (test@example.com)", min_interval_s=0)
    first = client.reverse(14.65, 121.05)
    second = client.reverse(14.65, 121.05)
    assert first == second and first["attribution"] == geocode.ATTRIBUTION
    assert len(f.requests) == 1
    assert f.requests[0].get_header("User-agent") == "SiteSuri-test/0.1 (test@example.com)"


def test_reverse_no_result(fake):
    fake({"error": "Unable to geocode"})
    with pytest.raises(GeocodingError):
        NominatimClient("SiteSuri-test/0.1", min_interval_s=0).reverse(0.0, 0.0)


def test_search_limited_to_philippines(fake):
    f = fake([{"display_name": "Cubao, Quezon City", "lat": "14.62", "lon": "121.05"}])
    results = NominatimClient("SiteSuri-test/0.1", min_interval_s=0).search("Cubao")
    assert results[0]["latitude"] == 14.62
    assert "countrycodes=ph" in f.requests[0].full_url


def test_rate_limit(fake):
    fake([])
    client = NominatimClient("SiteSuri-test/0.1", min_interval_s=0.3)
    start = time.monotonic()
    client.search("a place")
    client.search("another place")
    assert time.monotonic() - start >= 0.3

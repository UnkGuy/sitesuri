"""Import SiteSuri's PRECOMPUTED ML prototype results into Supabase PostgreSQL.

Put this file at apps/api/scripts/import_ml_artifacts.py.
From the repository root:
  python apps/api/scripts/import_ml_artifacts.py
  python apps/api/scripts/import_ml_artifacts.py --apply

The script uses ml/artifacts/locations.csv, scores.json, validation_report.json,
scoring_config.json by default. No ML inference or retraining occurs here.

SQL schema: datasets, locations, model_runs, location_scores as previously
created with Alembic. The import is transactional and idempotent for the same
(dataset name, dataset version, model version, generated_at) combination.
"""

from __future__ import annotations

import argparse
import csv
import json
import math
import os
from collections import Counter
from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]  # sitesuri-integration/
ARTIFACTS = ROOT / "ml" / "artifacts"
ALLOWED_TYPES = {"food stall", "sari-sari store", "general retail"}
BOOLEAN_COLUMNS = {"sidewalk", "paved", "crossing"}
INTEGER_COLUMNS = {
    "nearby_school_count", "nearby_market_count", "nearby_office_count",
    "nearby_shop_count", "nearby_transport_stop_count", "flood_hazard_class",
    "liquefaction_class", "flood_events_5y",
    "competitors_food_stall", "competitors_sari_sari_store",
    "competitors_general_retail",
}
FLOAT_COLUMNS = {
    "nearest_transport_distance_m", "population_density_500m", "lit_share",
    "dist_waterway_m", "dist_fault_m", "crime_pct_rank", "dist_police_m",
    "dist_fire_station_m", "dist_hospital_m",
}
LOCATION_FIELDS = {
    "location_id", "address", "spatial_block_id", "location_type", "latitude", "longitude"
}


def read_json(path: Path, *, required: bool = True):
    if not path.is_file():
        if required:
            raise FileNotFoundError(f"Missing ML artifact: {path}")
        return {}
    return json.loads(path.read_text(encoding="utf-8-sig"))


def parse_feature(key: str, raw: str | None):
    if raw is None or raw.strip() == "":
        return None
    value = raw.strip()
    if key in BOOLEAN_COLUMNS:
        if value.lower() in {"1", "true", "yes"}:
            return True
        if value.lower() in {"0", "false", "no"}:
            return False
        raise ValueError(f"Invalid boolean for {key}: {value!r}")
    if key in INTEGER_COLUMNS:
        return int(value)
    if key in FLOAT_COLUMNS:
        result = float(value)
        if not math.isfinite(result):
            raise ValueError(f"Nonfinite value in {key}: {value!r}")
        return result
    return value


def parse_time(value: str | None):
    if not value:
        raise ValueError("scores.json must contain meta.generated_utc for repeatable imports")
    result = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if result.tzinfo is None:
        result = result.replace(tzinfo=timezone.utc)
    return result


def load_artifacts(locations_csv: Path, scores_json: Path, validation_json: Path,
                   scoring_config_json: Path):
    scores_document = read_json(scores_json)
    meta = scores_document.get("meta")
    records = scores_document.get("scores")
    if not isinstance(meta, dict) or not isinstance(records, list):
        raise ValueError("scores.json must contain an object 'meta' and array 'scores'")
    generated_at = parse_time(meta.get("generated_utc"))
    source_type = meta.get("source_type", "synthetic")
    if isinstance(source_type, list):
        source_type = source_type[0] if len(source_type) == 1 else "mixed"
    if source_type not in {"synthetic", "observed", "mixed"}:
        raise ValueError(f"Invalid source_type: {source_type!r}")

    locations = {}
    with locations_csv.open("r", encoding="utf-8-sig", newline="") as file:
        reader = csv.DictReader(file)
        required_columns = {"location_id", "latitude", "longitude", "location_type"}
        missing = required_columns - set(reader.fieldnames or ())
        if missing:
            raise ValueError(f"Missing required CSV columns: {sorted(missing)}")
        for row in reader:
            external_id = (row.get("location_id") or "").strip()
            if not external_id or external_id in locations:
                raise ValueError(f"Blank or duplicate location_id: {external_id!r}")
            lat, lng = float(row["latitude"]), float(row["longitude"])
            if not (math.isfinite(lat) and math.isfinite(lng) and -90 <= lat <= 90 and -180 <= lng <= 180):
                raise ValueError(f"Invalid lat/lng for {external_id}: {lat}, {lng}")
            locations[external_id] = {
                "source_location_id": external_id,
                "address": (row.get("address") or "").strip() or None,
                "spatial_block_id": (row.get("spatial_block_id") or "").strip() or None,
                "location_type": (row["location_type"] or "").strip(),
                "latitude": lat,
                "longitude": lng,
                "features": {
                    key: parse_feature(key, value)
                    for key, value in row.items()
                    if key not in LOCATION_FIELDS and key is not None
                },
            }
            if not locations[external_id]["location_type"]:
                raise ValueError(f"Missing location_type for {external_id}")

    if not locations:
        raise ValueError("No locations in CSV")
    pair_keys = set()
    types = Counter()
    for rec in records:
        external_id = rec.get("location_id")
        kind = rec.get("business_type")
        if external_id not in locations:
            raise ValueError(f"scores.json refers to missing location_id: {external_id!r}")
        if kind not in ALLOWED_TYPES:
            raise ValueError(f"Unexpected business_type: {kind!r}")
        pair = (external_id, kind)
        if pair in pair_keys:
            raise ValueError(f"Duplicate score for {pair}")
        pair_keys.add(pair)
        types[kind] += 1
        try:
            score = Decimal(str(rec["location_score"]))
        except (InvalidOperation, KeyError) as exc:
            raise ValueError(f"Invalid score for {pair}") from exc
        if not score.is_finite() or not (0 <= score <= 100):
            raise ValueError(f"Score outside 0–100 for {pair}: {score}")
        if not isinstance(rec.get("components"), list) or len(rec["components"]) != 5:
            raise ValueError(f"Expected five score components for {pair}")
        if not isinstance(rec.get("flags", []), list) or not isinstance(rec.get("caps_applied", []), list):
            raise ValueError(f"Invalid flags or caps_applied for {pair}")

    validation = read_json(validation_json, required=False)
    scoring_config = read_json(scoring_config_json, required=False)
    return locations, records, meta, generated_at, source_type, types, validation, scoring_config


def import_data(url: str, *, name: str, version: str, model_version: str,
                locations: dict, scores: list, meta: dict, generated_at,
                source_type: str, validation: dict, scoring_config: dict):
    # Production uses psycopg already; avoid importing anything from the ML package.
    import psycopg
    from psycopg.types.json import Jsonb

    # SQLAlchemy-style URL from a FastAPI project is not directly understood by psycopg.
    url = url.replace("postgresql+psycopg://", "postgresql://", 1)
    with psycopg.connect(url) as connection:
        with connection.cursor() as cur:
            cur.execute(
                """INSERT INTO datasets (name, version, source_type, generated_at, metadata)
                   VALUES (%s,%s,%s,%s,%s)
                   ON CONFLICT (name,version) DO UPDATE SET
                     source_type=EXCLUDED.source_type,
                     generated_at=EXCLUDED.generated_at,
                     metadata=EXCLUDED.metadata
                   RETURNING dataset_id""",
                (name, version, source_type, generated_at, Jsonb(meta)),
            )
            dataset_id = cur.fetchone()[0]
            cur.execute(
                """SELECT id FROM model_runs
                   WHERE dataset_id=%s AND model_version=%s AND generated_at=%s
                   LIMIT 1""",
                (dataset_id, model_version, generated_at),
            )
            match = cur.fetchone()
            config = {"scores_meta": meta, "scoring_config": scoring_config}
            if match:
                run_id = match[0]
                cur.execute(
                    "UPDATE model_runs SET config=%s, evaluation=%s WHERE id=%s",
                    (Jsonb(config), Jsonb(validation), run_id),
                )
            else:
                cur.execute(
                    """INSERT INTO model_runs (dataset_id, model_version, generated_at, config, evaluation)
                       VALUES (%s,%s,%s,%s,%s) RETURNING id""",
                    (dataset_id, model_version, generated_at, Jsonb(config), Jsonb(validation)),
                )
                run_id = cur.fetchone()[0]

            ids = {}
            for external_id, loc in locations.items():
                cur.execute(
                    """INSERT INTO locations
                       (dataset_id, source_location_id, address, spatial_block_id,
                        location_type, latitude, longitude, features)
                       VALUES (%s,%s,%s,%s,%s,%s,%s,%s)
                       ON CONFLICT (dataset_id,source_location_id) DO UPDATE SET
                         address=EXCLUDED.address,
                         spatial_block_id=EXCLUDED.spatial_block_id,
                         location_type=EXCLUDED.location_type,
                         latitude=EXCLUDED.latitude,
                         longitude=EXCLUDED.longitude,
                         features=EXCLUDED.features
                       RETURNING id""",
                    (dataset_id, external_id, loc["address"], loc["spatial_block_id"],
                     loc["location_type"], loc["latitude"], loc["longitude"],
                     Jsonb(loc["features"])),
                )
                ids[external_id] = cur.fetchone()[0]

            for score in scores:
                cur.execute(
                    """INSERT INTO location_scores
                       (location_id, model_run_id, business_type, location_score,
                        weakest_component, flags, caps_applied, components, info_only)
                       VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s)
                       ON CONFLICT (location_id,model_run_id,business_type) DO UPDATE SET
                         location_score=EXCLUDED.location_score,
                         weakest_component=EXCLUDED.weakest_component,
                         flags=EXCLUDED.flags,
                         caps_applied=EXCLUDED.caps_applied,
                         components=EXCLUDED.components,
                         info_only=EXCLUDED.info_only""",
                    (ids[score["location_id"]], run_id, score["business_type"],
                     Decimal(str(score["location_score"])), score.get("weakest_component"),
                     score.get("flags", []), score.get("caps_applied", []),
                     Jsonb(score["components"]), Jsonb(score.get("info_only") or {})),
                )
        # A single transaction: either the complete artifact set imports or none does.
        connection.commit()
    return dataset_id, run_id


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--locations", type=Path, default=ARTIFACTS / "locations.csv")
    parser.add_argument("--scores", type=Path, default=ARTIFACTS / "scores.json")
    parser.add_argument("--validation", type=Path, default=ARTIFACTS / "validation_report.json")
    parser.add_argument("--scoring-config", type=Path, default=ARTIFACTS / "scoring_config.json")
    parser.add_argument("--dataset-name", default="sitesuri-ml-locations")
    parser.add_argument("--dataset-version", default="hackathon-synthetic-v1")
    parser.add_argument("--model-version", default="prototype-v2")
    parser.add_argument("--apply", action="store_true", help="Write to the database; otherwise validate only")
    args = parser.parse_args()
    locations, records, meta, generated_at, source_type, types, validation, scoring_config = load_artifacts(
        args.locations, args.scores, args.validation, args.scoring_config
    )
    print(f"Dataset: {args.dataset_name} / {args.dataset_version}")
    print(f"Source type: {source_type} (prototype; not verified real-world conditions)")
    print(f"Generated: {generated_at.isoformat()}")
    print(f"Locations: {len(locations)}; score records: {len(records)}")
    print(f"Business types: {dict(types)}")
    print(f"Validation report: {'present' if validation else 'not provided'}")
    print(f"Scoring configuration: {'present' if scoring_config else 'not provided'}")
    if not args.apply:
        print("DRY RUN OK. No database changes. Add --apply to import.")
        return

    # Prefer apps/api/.env when invoked from any directory. Never print credentials.
    try:
        from dotenv import load_dotenv
        load_dotenv(ROOT / "apps" / "api" / ".env")
    except ImportError:
        pass
    database_url = os.environ.get("DATABASE_URL")
    if not database_url:
        parser.error("DATABASE_URL not set; add it to apps/api/.env or your environment")
    dataset_id, run_id = import_data(
        database_url, name=args.dataset_name, version=args.dataset_version,
        model_version=args.model_version, locations=locations, scores=records,
        meta=meta, generated_at=generated_at, source_type=source_type,
        validation=validation, scoring_config=scoring_config,
    )
    print(f"IMPORTED. dataset_id={dataset_id}; model_run_id={run_id}")
    print("Re-running with identical artifacts and version updates rows without duplicating them.")


if __name__ == "__main__":
    main()

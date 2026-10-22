
from sqlalchemy import (
    Column, Text, Integer, Numeric, DateTime,
    ForeignKey, CheckConstraint, UniqueConstraint,
    Index, text, func,
)
from sqlalchemy.dialects.postgresql import (
    UUID, JSONB, ARRAY, DOUBLE_PRECISION,
)

from app.models.base import Base


class Dataset(Base):
    __tablename__ = "datasets"

    dataset_id = Column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default=text("gen_random_uuid()"),
    )
    name = Column(Text, nullable=False)
    version = Column(Text, nullable=False)
    source_type = Column(Text, nullable=False)
    generated_at = Column(DateTime(timezone=True))

    # "metadata" is reserved by SQLAlchemy.
    dataset_metadata = Column(
        "metadata", JSONB, nullable=False,
        server_default=text("'{}'::jsonb"),
    )

    __table_args__ = (
        UniqueConstraint(
            "name", "version",
            name="uq_datasets_name_version",
        ),
        CheckConstraint(
            "source_type IN ('synthetic', 'observed', 'mixed')",
            name="ck_datasets_source_type",
        ),
    )


class Location(Base):
    __tablename__ = "locations"

    id = Column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default=text("gen_random_uuid()"),
    )
    dataset_id = Column(
        UUID(as_uuid=True),
        ForeignKey("datasets.dataset_id"),
        nullable=False,
    )
    source_location_id = Column(Text, nullable=False)
    address = Column(Text)
    spatial_block_id = Column(Text)
    location_type = Column(Text, nullable=False)
    latitude = Column(DOUBLE_PRECISION, nullable=False)
    longitude = Column(DOUBLE_PRECISION, nullable=False)
    features = Column(
        JSONB, nullable=False,
        server_default=text("'{}'::jsonb"),
    )

    __table_args__ = (
        UniqueConstraint(
            "dataset_id", "source_location_id",
            name="uq_locations_dataset_source",
        ),
        CheckConstraint(
            "latitude BETWEEN -90 AND 90",
            name="ck_locations_latitude",
        ),
        CheckConstraint(
            "longitude BETWEEN -180 AND 180",
            name="ck_locations_longitude",
        ),
        Index("idx_locations_dataset", "dataset_id"),
        Index("idx_locations_lat_lng", "latitude", "longitude"),
    )


class ModelRun(Base):
    __tablename__ = "model_runs"

    id = Column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default=text("gen_random_uuid()"),
    )
    dataset_id = Column(
        UUID(as_uuid=True),
        ForeignKey("datasets.dataset_id"),
        nullable=False,
    )
    model_version = Column(Text, nullable=False)
    generated_at = Column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )
    config = Column(
        JSONB, nullable=False,
        server_default=text("'{}'::jsonb"),
    )
    evaluation = Column(
        JSONB, nullable=False,
        server_default=text("'{}'::jsonb"),
    )


class LocationScore(Base):
    __tablename__ = "location_scores"

    id = Column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default=text("gen_random_uuid()"),
    )
    location_id = Column(
        UUID(as_uuid=True),
        ForeignKey("locations.id"),
        nullable=False,
    )
    model_run_id = Column(
        UUID(as_uuid=True),
        ForeignKey("model_runs.id"),
        nullable=False,
    )
    business_type = Column(Text, nullable=False)
    location_score = Column(Numeric(5, 2), nullable=False)
    weakest_component = Column(Text)
    flags = Column(
        ARRAY(Text), nullable=False,
        server_default=text("'{}'::text[]"),
    )
    caps_applied = Column(
        ARRAY(Text), nullable=False,
        server_default=text("'{}'::text[]"),
    )
    components = Column(JSONB, nullable=False)
    info_only = Column(
        JSONB, nullable=False,
        server_default=text("'{}'::jsonb"),
    )

    __table_args__ = (
        UniqueConstraint(
            "location_id", "model_run_id", "business_type",
            name="uq_location_scores_run_business",
        ),
        CheckConstraint(
            "location_score BETWEEN 0 AND 100",
            name="ck_location_scores_range",
        ),
        CheckConstraint(
            "jsonb_typeof(components) = 'array'",
            name="ck_location_scores_components",
        ),
        Index(
            "idx_scores_lookup",
            "model_run_id", "business_type",
        ),
    )


class UserAnalysis(Base):
    __tablename__ = "user_analyses"

    id = Column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default=text("gen_random_uuid()"),
    )
    user_id = Column(
        UUID(as_uuid=True),
        ForeignKey("users.user_id", ondelete="CASCADE"),
        nullable=False,
    )
    location_score_id = Column(
        UUID(as_uuid=True),
        ForeignKey("location_scores.id"),
        nullable=False,
    )
    display_radius_meters = Column(Integer)
    created_at = Column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )

    __table_args__ = (
        CheckConstraint(
            "display_radius_meters IS NULL OR "
            "display_radius_meters BETWEEN 100 AND 5000",
            name="ck_user_analyses_radius",
        ),
        Index(
            "idx_user_analyses_recent",
            "user_id", created_at.desc(),
        ),
    )

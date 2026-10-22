
from collections.abc import Generator

from sqlalchemy import create_engine, event
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import NullPool

from app.core.config import settings


engine = create_engine(
    settings.database_url,

    # Let Supabase manage connection pooling.
    poolclass=NullPool,

    connect_args={
        # Fail if a database connection cannot be
        # established within approximately 5 seconds.
        "connect_timeout": 5,

        # Disable prepared statements for Supabase's
        # transaction pooler (Psycopg 3).
        "prepare_threshold": None,

        # Require an encrypted database connection.
        "sslmode": "require",
    },
)


# Apply a statement timeout to each database transaction.
# SET LOCAL works with transaction pooling because it does
# not persist session state after commit or rollback.
@event.listens_for(engine, "begin")
def set_statement_timeout(connection):
    connection.exec_driver_sql(
        "SET LOCAL statement_timeout = '8000ms'"
    )


SessionLocal = sessionmaker(
    bind=engine,
    autoflush=False,
    autocommit=False,
)


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()

    try:
        yield db
    finally:
        db.close()

"""Database engine, declarative base, and session dependency."""

from collections.abc import Generator
from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from app.config import settings

# Create engine using psycopg (v3) driver
engine = create_engine(
    settings.sync_database_url,
    pool_pre_ping=True,
    echo=False,
)

SessionLocal = sessionmaker(
    bind=engine,
    autocommit=False,
    autoflush=False,
    expire_on_commit=False,
)


class Base(DeclarativeBase):
    """Declarative base class for SQLAlchemy models."""
    pass


def get_db() -> Generator[Session, None, None]:
    """Dependency yielding an active database session."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

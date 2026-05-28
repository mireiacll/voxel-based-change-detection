"""
database.py — async SQLAlchemy engine and session factory

Works with both SQLite (dev) and PostgreSQL (prod) via DATABASE_URL.
All callers import `AsyncSession` and `get_db` from here.
"""

import os

from dotenv import load_dotenv
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite+aiosqlite:///./3dchange_detection.db")

# ── Engine ────────────────────────────────────────────────────────────────
# check_same_thread=False is only relevant for SQLite; ignored by PostgreSQL.
engine = create_async_engine(
    DATABASE_URL,
    echo=False,                         # set True to log SQL queries
    connect_args=(
        {"check_same_thread": False}
        if DATABASE_URL.startswith("sqlite") else {}
    ),
)

# ── Session factory ───────────────────────────────────────────────────────
AsyncSessionLocal = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autoflush=False,
    autocommit=False,
)


# ── Base class for all ORM models ─────────────────────────────────────────
class Base(DeclarativeBase):
    pass


# ── FastAPI dependency — yields one session per request ──────────────────
async def get_db():
    async with AsyncSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
import os
import sys
from logging.config import fileConfig
from pathlib import Path

from sqlalchemy import create_engine, pool
from alembic import context

# ── Make sure the server/ folder is on sys.path ───────────────────────────
# Alembic runs env.py from inside alembic/, so we add the parent (server/)
# so that `from models import Base` and `from database import ...` work.
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

# ── Load .env so DATABASE_URL is available ────────────────────────────────
from dotenv import load_dotenv
load_dotenv(Path(__file__).resolve().parent.parent / ".env")

# ── Import metadata from your models ─────────────────────────────────────
from models import Base

# ── Alembic config ────────────────────────────────────────────────────────
config = context.config
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata

# ── Build a sync DATABASE_URL (strip async driver prefix) ─────────────────
# Alembic uses a regular (sync) engine for migrations even if the app uses
# an async engine at runtime.
_async_url = os.getenv("DATABASE_URL", "sqlite+aiosqlite:///./3dchange_detection.db")
_sync_url  = (
    _async_url
    .replace("sqlite+aiosqlite", "sqlite")
    .replace("postgresql+asyncpg", "postgresql")
)


def run_migrations_offline() -> None:
    """Run migrations without a live DB connection (outputs SQL to stdout)."""
    context.configure(
        url=_sync_url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    """Run migrations against a live DB connection."""
    connectable = create_engine(
        _sync_url,
        poolclass=pool.NullPool,
    )
    with connectable.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
        )
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
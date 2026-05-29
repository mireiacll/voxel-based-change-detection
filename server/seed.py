"""
seed.py — populate the database from the existing public/data/ folder

Run once after `alembic upgrade head` to import your current tile structure.
Safe to run multiple times — uses INSERT OR IGNORE (SQLite) / ON CONFLICT DO NOTHING.

Usage:
    python seed.py

The script reads SITE_CONFIGS below for human-readable labels and camera positions.
Dates and paths are discovered automatically from the filesystem.
"""

import asyncio
import os
import re
from pathlib import Path

from dotenv import load_dotenv
from sqlalchemy import select, text

load_dotenv()

DATA_ROOT = Path(os.getenv("DATA_ROOT", "./public/data")).resolve()

# ── Human-readable metadata for each site ─────────────────────────────────
# Add a new entry here whenever you add a new site folder.
SITE_CONFIGS: dict[str, dict] = {
    "dunpo": {
        "label":    "둔포면 — Waste Site",
        "label_en": "Dunpo-myeon",
        "camera":   {"lon": 127.0071, "lat": 36.9102, "height": 600},
        "mesh_z_offset": 119.575,
    },
    "ungpo": {
        "label":    "웅포면 — Waste Site",
        "label_en": "Ungpo-myeon",
        "camera":   {"lon": 126.9300, "lat": 36.0500, "height": 600},
        "mesh_z_offset": 194.253,
    },
}

# ── Date label patterns ────────────────────────────────────────────────────
_MONTH = {
    "01": "Jan", "02": "Feb", "03": "Mar", "04": "Apr",
    "05": "May", "06": "Jun", "07": "Jul", "08": "Aug",
    "09": "Sep", "10": "Oct", "11": "Nov", "12": "Dec",
}

def _date_label(code: str) -> str:
    """Convert '251106' → 'Nov 6, 2025'."""
    m = re.fullmatch(r"(\d{2})(\d{2})(\d{2})", code)
    if not m:
        return code
    yy, mm, dd = m.groups()
    month = _MONTH.get(mm, mm)
    return f"{month} {int(dd)}, 20{yy}"


# ── Main ──────────────────────────────────────────────────────────────────

async def seed():
    # Import here so the engine is created after load_dotenv()
    from database import AsyncSessionLocal, engine
    from models import Base, Site, SurveyDate

    # Create tables if they don't exist yet (idempotent)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    if not DATA_ROOT.exists():
        print(f"[seed] DATA_ROOT does not exist: {DATA_ROOT}")
        return

    async with AsyncSessionLocal() as session:
        for site_dir in sorted(DATA_ROOT.iterdir()):
            if not site_dir.is_dir():
                continue

            site_id = site_dir.name
            cfg     = SITE_CONFIGS.get(site_id)
            if cfg is None:
                print(f"[seed] No SITE_CONFIG for '{site_id}' — skipping "
                      f"(add it to SITE_CONFIGS in seed.py)")
                continue

            # ── Upsert site ───────────────────────────────────────────────
            existing_site = await session.get(Site, site_id)
            if existing_site is None:
                session.add(Site(
                    id=site_id,
                    label=cfg["label"],
                    label_en=cfg["label_en"],
                    camera_lon=cfg["camera"]["lon"],
                    camera_lat=cfg["camera"]["lat"],
                    camera_height=cfg["camera"]["height"],
                    mesh_z_offset=cfg["mesh_z_offset"],
                ))
                print(f"[seed] Inserted site: {site_id}")
            else:
                print(f"[seed] Site already exists: {site_id}")

            # ── Upsert each date folder ───────────────────────────────────
            for date_dir in sorted(site_dir.iterdir()):
                if not date_dir.is_dir():
                    continue

                date_code = date_dir.name

                mesh_abs = date_dir / "3d_mesh"     / "tiles" / "tileset.json"
                pc_abs   = date_dir / "point_cloud" / "tiles" / "tileset.json"

                # Paths relative to DATA_ROOT parent (i.e. public/)
                def rel(p: Path) -> str | None:
                    try:
                        return str(p.relative_to(DATA_ROOT.parent)).replace("\\", "/")
                    except ValueError:
                        return None

                mesh_path = rel(mesh_abs) if mesh_abs.exists() else None
                pc_path   = rel(pc_abs)   if pc_abs.exists()   else None

                if mesh_path is None and pc_path is None:
                    print(f"[seed]   {site_id}/{date_code}: no tilesets found — skipping")
                    continue

                # Composite PK = site_id + date_code
                pk = f"{site_id}_{date_code}"
                existing_date = await session.get(SurveyDate, pk)
                if existing_date is None:
                    session.add(SurveyDate(
                        id=pk,
                        site_id=site_id,
                        date_code=date_code,
                        label=_date_label(date_code),
                        mesh_path=mesh_path,
                        point_cloud_path=pc_path,
                    ))
                    print(f"[seed]   Inserted date: {site_id}/{date_code}")
                else:
                    print(f"[seed]   Date already exists: {site_id}/{date_code}")

        await session.commit()

    print("[seed] Done.")


if __name__ == "__main__":
    asyncio.run(seed())
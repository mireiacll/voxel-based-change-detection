"""
seed.py — populate the database from the existing public/data/ folder

Run once after `alembic upgrade head` to import your current tile structure.
Safe to run multiple times — uses INSERT OR IGNORE (SQLite) / ON CONFLICT DO NOTHING.

Usage:
    python seed.py

The script reads SITE_CONFIGS below for human-readable labels and camera positions.
Dates and paths are discovered automatically from the filesystem.

Timeseries diff folders are expected at:
  public/data/{site}/timeseries/{name}/visualization/tileset.json

The folder name encodes the date range as two YYMM segments at the end,
e.g. "eumbong-time-series-2505-2507" → April/May 2025 → July 2025.
The script matches each YYMM to the nearest survey date code (YYMMDD).
"""

import asyncio
import os
import re
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()

DATA_ROOT = Path(os.getenv("DATA_ROOT", "./public/data")).resolve()

# ── Human-readable metadata for each site ─────────────────────────────────
SITE_CONFIGS: dict[str, dict] = {
    "dunpo": {
        "label":    "둔포면 — Waste Site",
        "label_en": "Dunpo-myeon",
        "camera":   {"lon": 127.0067, "lat": 36.9099, "height": 600},
        "mesh_z_offset": 119.575,
    },
    "ungpo": {
        "label":    "웅포면 — Waste Site",
        "label_en": "Ungpo-myeon",
        "camera":   {"lon": 127.0860, "lat": 36.8833, "height": 600},
        "mesh_z_offset": 194.253,
    },
}

# ── Date label helpers ─────────────────────────────────────────────────────
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


def _ts_label(date_a_label: str, date_b_label: str) -> str:
    return f"{date_a_label} → {date_b_label}"


def _match_yymm(yymm: str, date_codes: list[str]) -> str | None:
    """
    Match a 4-digit YYMM string to the nearest survey date code (YYMMDD).
    Returns the date_code whose YY and MM match, picking the first one if
    multiple dates fall in the same month.
    """
    if len(yymm) != 4:
        return None
    yy, mm = yymm[:2], yymm[2:]
    for code in sorted(date_codes):
        m = re.fullmatch(r"(\d{2})(\d{2})(\d{2})", code)
        if m and m.group(1) == yy and m.group(2) == mm:
            return code
    return None


def _parse_ts_folder(folder_name: str, date_codes: list[str]) -> tuple[str, str] | None:
    """
    Parse a timeseries folder name and return (date_a_code, date_b_code).
    Expects the last two dash-separated segments to be YYMM codes.
    e.g. "eumbong-time-series-2505-2507" → ("250415", "250701") (nearest dates)
    Returns None if parsing fails.
    """
    parts = folder_name.split("-")
    if len(parts) < 2:
        return None
    yymm_b = parts[-1]
    yymm_a = parts[-2]
    # Both must look like YYMM (4 digits)
    if not (re.fullmatch(r"\d{4}", yymm_a) and re.fullmatch(r"\d{4}", yymm_b)):
        return None
    code_a = _match_yymm(yymm_a, date_codes)
    code_b = _match_yymm(yymm_b, date_codes)
    if code_a is None or code_b is None or code_a == code_b:
        return None
    return code_a, code_b


# ── Main ──────────────────────────────────────────────────────────────────

async def seed():
    from database import AsyncSessionLocal, engine
    from models import Base, Site, SurveyDate, TimeseriesDiff

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    if not DATA_ROOT.exists():
        print(f"[seed] DATA_ROOT does not exist: {DATA_ROOT}")
        return

    def rel(p: Path) -> str | None:
        try:
            return str(p.relative_to(DATA_ROOT.parent)).replace("\\", "/")
        except ValueError:
            return None

    async with AsyncSessionLocal() as session:
        for site_dir in sorted(DATA_ROOT.iterdir()):
            if not site_dir.is_dir():
                continue

            site_id = site_dir.name
            cfg     = SITE_CONFIGS.get(site_id)
            if cfg is None:
                print(f"[seed] No SITE_CONFIG for '{site_id}' — skipping")
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

            # ── Collect date codes for later timeseries matching ──────────
            date_codes: list[str] = []

            # ── Upsert each date folder ───────────────────────────────────
            for date_dir in sorted(site_dir.iterdir()):
                if not date_dir.is_dir():
                    continue
                # Skip the timeseries folder — handled separately below
                if date_dir.name == "timeseries":
                    continue

                date_code = date_dir.name
                if not re.fullmatch(r"\d{6}", date_code):
                    print(f"[seed]   {site_id}/{date_code}: not a 6-digit date — skipping")
                    continue

                date_codes.append(date_code)

                tileset_abs = date_dir / "tiles" / "tileset.json"
                tileset_path = rel(tileset_abs) if tileset_abs.exists() else None

                # Pre-computed voxel visualization
                voxel_abs  = date_dir / "voxel" / "visualization" / "tileset.json"
                voxel_path = rel(voxel_abs) if voxel_abs.exists() else None

                if tileset_path is None and voxel_path is None:
                    print(f"[seed]   {site_id}/{date_code}: no tileset found — skipping")
                    continue

                pk = f"{site_id}_{date_code}"
                existing_date = await session.get(SurveyDate, pk)
                if existing_date is None:
                    session.add(SurveyDate(
                        id=pk,
                        site_id=site_id,
                        date_code=date_code,
                        label=_date_label(date_code),
                        dataset_path=tileset_path,
                        dataset_type="pointcloud" if tileset_path else None,
                        voxel_path=voxel_path,
                    ))
                    print(f"[seed]   Inserted date: {site_id}/{date_code}"
                          + (" [voxel]" if voxel_path else ""))
                else:
                    # Update voxel_path if it was discovered and not yet set
                    if voxel_path and existing_date.voxel_path != voxel_path:
                        existing_date.voxel_path = voxel_path
                        print(f"[seed]   Updated voxel_path for: {site_id}/{date_code}")
                    else:
                        print(f"[seed]   Date already exists: {site_id}/{date_code}")

            # ── Upsert timeseries diffs ───────────────────────────────────
            ts_root = site_dir / "timeseries"
            if ts_root.is_dir():
                for ts_dir in sorted(ts_root.iterdir()):
                    if not ts_dir.is_dir():
                        continue

                    ts_tileset_abs = ts_dir / "visualization" / "tileset.json"
                    ts_tileset_path = rel(ts_tileset_abs) if ts_tileset_abs.exists() else None
                    if ts_tileset_path is None:
                        print(f"[seed]   {site_id}/timeseries/{ts_dir.name}: no tileset — skipping")
                        continue

                    parsed = _parse_ts_folder(ts_dir.name, date_codes)
                    if parsed is None:
                        print(f"[seed]   {site_id}/timeseries/{ts_dir.name}: "
                              f"could not parse date codes — skipping")
                        continue

                    code_a, code_b = parsed
                    ts_id = f"{site_id}_{code_a}_{code_b}"
                    label = _ts_label(_date_label(code_a), _date_label(code_b))

                    existing_ts = await session.get(TimeseriesDiff, ts_id)
                    if existing_ts is None:
                        session.add(TimeseriesDiff(
                            id=ts_id,
                            site_id=site_id,
                            date_a_code=code_a,
                            date_b_code=code_b,
                            label=label,
                            tileset_path=ts_tileset_path,
                        ))
                        print(f"[seed]   Inserted timeseries diff: {ts_id} ({ts_dir.name})")
                    else:
                        print(f"[seed]   Timeseries diff already exists: {ts_id}")

        await session.commit()

    print("[seed] Done.")


if __name__ == "__main__":
    asyncio.run(seed())
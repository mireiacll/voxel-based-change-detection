"""
main.py — FastAPI server for  City 3D Change Detection Viewer

Uses ThreadPoolExecutor instead of ProcessPoolExecutor:
- No multiprocessing.Manager needed — plain dict works across threads
- No module-level process spawning that deadlocks on Windows/macOS
- numpy releases the GIL during heavy array ops so threads still parallelize
"""

import asyncio
import os
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from typing import Optional

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from glb_parser import load_all_points
from voxelizer import build_surface, diff_solid, make_grid_def, solidify

# db related imports
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession
from database import get_db, engine
from models import Base, Site, SurveyDate
from fastapi import Depends

load_dotenv()

DATA_ROOT = Path(os.getenv("DATA_ROOT", "./public/data")).resolve()
ALLOWED_ORIGINS = [
    o.strip()
    for o in os.getenv(
        "ALLOWED_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173"
    ).split(",")
]

app = FastAPI(title="3D Change Detection API", version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("startup")
async def startup():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

# ThreadPoolExecutor — safe to create at module level, no spawning issues
_executor = ThreadPoolExecutor(max_workers=os.cpu_count() or 4)

# Plain dict is fine for threads (no cross-process boundary)
_cancel_flags: dict[str, bool] = {}


# ═════════════════════════════════════════════════════════════════════════
#  MODELS
# ═════════════════════════════════════════════════════════════════════════

class PolygonPoint(BaseModel):
    lon: float
    lat: float

class DiffRequest(BaseModel):
    job_id:   str   = Field(..., description="Client-generated UUID for this job")
    path_a:   str   = Field(..., description="Relative path to date A tileset.json")
    path_b:   str   = Field(..., description="Relative path to date B tileset.json")
    vox_size: float = Field(0.5, ge=0.05, le=20.0)
    polygon:  Optional[list[PolygonPoint]] = None

class VoxelResult(BaseModel):
    iLon: int
    iLat: int
    iH:   int
    type: str

class GridDef(BaseModel):
    lon_step: float
    lat_step: float
    h_step:   float

class DiffResponse(BaseModel):
    added:    list[VoxelResult]
    removed:  list[VoxelResult]
    grid_def: GridDef
    vox_size: float
    clipped:  bool
    stats:    dict
    job_id:   str


# ═════════════════════════════════════════════════════════════════════════
#  COMPUTATION  (runs in thread pool)
# ═════════════════════════════════════════════════════════════════════════

def _cancelled(job_id: str) -> bool:
    return _cancel_flags.get(job_id, False)


def _run_diff(
    job_id:    str,
    tileset_a: Path,
    tileset_b: Path,
    vox_size:  float,
    polygon:   Optional[list[dict]],
) -> dict:
    """Full diff pipeline — runs in a thread. Returns plain dict."""

    if _cancelled(job_id): return {"cancelled": True}

    raw_a = load_all_points(tileset_a)
    if _cancelled(job_id): return {"cancelled": True}

    raw_b = load_all_points(tileset_b)
    if _cancelled(job_id): return {"cancelled": True}

    print(f"[diff] Raw points — A: {raw_a.shape[0]}, B: {raw_b.shape[0]}")

    import numpy as np
    if raw_a.shape[0] and raw_b.shape[0]:
        all_pts = np.vstack([raw_a, raw_b])
    else:
        all_pts = raw_a if raw_a.shape[0] else raw_b

    grid_def = make_grid_def(all_pts, vox_size)
    if _cancelled(job_id): return {"cancelled": True}

    poly_list = (
        [{"lon": p["lon"], "lat": p["lat"]} for p in polygon]
        if polygon else None
    )

    surface_a = build_surface(raw_a, grid_def, poly_list)
    if _cancelled(job_id): return {"cancelled": True}

    surface_b = build_surface(raw_b, grid_def, poly_list)
    if _cancelled(job_id): return {"cancelled": True}

    print(f"[diff] Surface voxels — A: {len(surface_a)}, B: {len(surface_b)}")

    solid_a, solid_b = solidify(surface_a, surface_b, grid_def)
    if _cancelled(job_id): return {"cancelled": True}

    added, removed = diff_solid(solid_a, solid_b)
    print(f"[diff] Diff — added: {len(added)}, removed: {len(removed)}")

    return {
        "added":    added,
        "removed":  removed,
        "grid_def": grid_def,
        "vox_size": vox_size,
        "clipped":  poly_list is not None,
        "stats": {
            "added_count":   len(added),
            "removed_count": len(removed),
            "net":           len(added) - len(removed),
        },
    }


# ═════════════════════════════════════════════════════════════════════════
#  ROUTES
# ═════════════════════════════════════════════════════════════════════════

@app.get("/health")
async def health():
    return {"status": "ok", "data_root": str(DATA_ROOT)}

@app.get("/api/sites")
async def list_sites(db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Site).options(selectinload(Site.dates)).order_by(Site.id)
    )
    sites = result.scalars().all()
    return {"sites": [s.to_dict() for s in sites]}


@app.post("/api/diff")
async def run_diff(req: DiffRequest):

    def _resolve(rel: str) -> Path:
        rel = rel.lstrip("/")
        if rel.startswith("data/"):
            rel = rel[len("data/"):]
        resolved = (DATA_ROOT / rel).resolve()
        if not str(resolved).startswith(str(DATA_ROOT)):
            raise HTTPException(status_code=400, detail="Invalid path")
        return resolved

    tileset_a = _resolve(req.path_a)
    tileset_b = _resolve(req.path_b)

    for ts, label in [(tileset_a, "path_a"), (tileset_b, "path_b")]:
        if not ts.exists():
            raise HTTPException(
                status_code=404,
                detail=f"tileset.json not found for {label}: {ts}",
            )

    poly_dicts = (
        [{"lon": p.lon, "lat": p.lat} for p in req.polygon]
        if req.polygon else None
    )

    job_id = req.job_id
    _cancel_flags[job_id] = False

    loop = asyncio.get_event_loop()
    try:
        result = await loop.run_in_executor(
            _executor,
            lambda: _run_diff(job_id, tileset_a, tileset_b, req.vox_size, poly_dicts),
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Diff computation failed: {e}")
    finally:
        _cancel_flags.pop(job_id, None)

    if result.get("cancelled"):
        return {"cancelled": True, "job_id": job_id}

    return DiffResponse(
        added    = [VoxelResult(**v) for v in result["added"]],
        removed  = [VoxelResult(**v) for v in result["removed"]],
        grid_def = GridDef(**result["grid_def"]),
        vox_size = result["vox_size"],
        clipped  = result["clipped"],
        stats    = result["stats"],
        job_id   = job_id,
    )


@app.post("/api/diff/cancel/{job_id}")
async def cancel_diff(job_id: str):
    if job_id not in _cancel_flags:
        return {"status": "not_found"}
    _cancel_flags[job_id] = True
    return {"status": "cancelling"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "main:app",
        host=os.getenv("HOST", "127.0.0.1"),
        port=int(os.getenv("PORT", 8000)),
        reload=True,
    )
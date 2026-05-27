"""
main.py — FastAPI server for Asan City 3D Change Detection Viewer

Endpoints
---------
POST /api/diff
    Run server-side voxelization + diff for two dates.
    Body: DiffRequest JSON
    Returns: DiffResponse JSON

GET  /api/sites
    List all configured sites and their available dates
    (reads from the same DATA_ROOT as the diff endpoint).

GET  /health
    Liveness probe.

Architecture note
-----------------
All heavy computation (GLB parsing, voxelization, diff) runs in a thread
pool via run_in_executor so the async event loop is never blocked.

Database note
-------------
The DB layer is stubbed out with clear TODO markers.
When you're ready, install the packages commented out in requirements.txt,
set DATABASE_URL in .env, and fill in the TODO sections.
"""

import asyncio
import os
from concurrent.futures import ProcessPoolExecutor
from functools import partial
from pathlib import Path
from typing import Optional

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from glb_parser import load_all_points
from voxelizer import build_surface, diff_solid, make_grid_def, solidify

# ── Environment ───────────────────────────────────────────────────────────
load_dotenv()

DATA_ROOT      = Path(os.getenv("DATA_ROOT", "./public/data")).resolve()
ALLOWED_ORIGINS = [
    o.strip()
    for o in os.getenv(
        "ALLOWED_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173"
    ).split(",")
]

# ── App ───────────────────────────────────────────────────────────────────
app = FastAPI(title="Asan City 3D Change Detection API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ProcessPoolExecutor lets numpy computation run in parallel without GIL limits.
# max_workers=None → one worker per CPU core.
_executor = ProcessPoolExecutor(max_workers=None)

# ── TODO: DB session factory ──────────────────────────────────────────────
# Uncomment when adding PostgreSQL:
#
# from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
# from sqlalchemy.orm import sessionmaker
#
# DATABASE_URL = os.getenv("DATABASE_URL")
# if DATABASE_URL:
#     engine      = create_async_engine(DATABASE_URL, echo=False)
#     AsyncSessionLocal = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
#
# async def get_db():
#     async with AsyncSessionLocal() as session:
#         yield session
# ─────────────────────────────────────────────────────────────────────────


# ═════════════════════════════════════════════════════════════════════════
#  REQUEST / RESPONSE MODELS
# ═════════════════════════════════════════════════════════════════════════

class PolygonPoint(BaseModel):
    lon: float
    lat: float


class DiffRequest(BaseModel):
    """
    Body sent by the frontend when the user clicks ⚡ Run diff.

    path_a / path_b are the relative paths from config.js
    (e.g. "data/dunpo/251106/point_cloud/tiles/tileset.json").
    The server resolves them against DATA_ROOT.
    """
    path_a:     str = Field(..., description="Relative path to date A tileset.json")
    path_b:     str = Field(..., description="Relative path to date B tileset.json")
    vox_size:   float = Field(0.5, ge=0.05, le=20.0, description="Voxel cell size in metres")
    polygon:    Optional[list[PolygonPoint]] = Field(
        None, description="Polygon filter vertices [{lon, lat}]. Omit for full-extent diff."
    )


class VoxelResult(BaseModel):
    iLon: int
    iLat: int
    iH:   int
    type: str   # "added" | "removed"


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
    stats: dict   # { added_count, removed_count, net }


# ═════════════════════════════════════════════════════════════════════════
#  PURE COMPUTATION (runs in process pool — no async, no FastAPI)
# ═════════════════════════════════════════════════════════════════════════

def _run_diff(
    tileset_a: Path,
    tileset_b: Path,
    vox_size:  float,
    polygon:   Optional[list[dict]],
) -> dict:
    """
    Full diff pipeline — called in a worker process.
    Returns a plain dict (must be picklable for multiprocessing).
    """
    # 1. Parse point clouds
    raw_a = load_all_points(tileset_a)
    raw_b = load_all_points(tileset_b)

    print(f"[diff] Raw points — A: {raw_a.shape[0]}, B: {raw_b.shape[0]}")

    import numpy as np
    all_pts  = np.vstack([raw_a, raw_b]) if raw_a.shape[0] and raw_b.shape[0] else (raw_a if raw_a.shape[0] else raw_b)

    # 2. Grid definition
    grid_def = make_grid_def(all_pts, vox_size)

    # 3. Surface maps
    poly_list = [{"lon": p["lon"], "lat": p["lat"]} for p in polygon] if polygon else None
    surface_a = build_surface(raw_a, grid_def, poly_list)
    surface_b = build_surface(raw_b, grid_def, poly_list)
    print(f"[diff] Surface voxels — A: {len(surface_a)}, B: {len(surface_b)}")

    # 4. Solidify
    solid_a, solid_b = solidify(surface_a, surface_b, grid_def)

    # 5. Diff
    added, removed = diff_solid(solid_a, solid_b)
    print(f"[diff] Diff — added: {len(added)}, removed: {len(removed)}")

    net = len(added) - len(removed)

    return {
        "added":    added,
        "removed":  removed,
        "grid_def": grid_def,
        "vox_size": vox_size,
        "clipped":  poly_list is not None,
        "stats": {
            "added_count":   len(added),
            "removed_count": len(removed),
            "net":           net,
        },
    }


# ═════════════════════════════════════════════════════════════════════════
#  ROUTES
# ═════════════════════════════════════════════════════════════════════════

@app.get("/health")
async def health():
    return {"status": "ok", "data_root": str(DATA_ROOT)}


@app.get("/api/sites")
async def list_sites():
    """
    Walk DATA_ROOT and return a summary of available sites and dates.
    Mirrors the structure of CONFIG.SITES in config.js so the frontend
    could (optionally) fetch this instead of hard-coding it.

    TODO: When DB is ready, query the tiles table instead of scanning disk.
    """
    if not DATA_ROOT.exists():
        raise HTTPException(status_code=500, detail=f"DATA_ROOT not found: {DATA_ROOT}")

    sites = []
    for site_dir in sorted(DATA_ROOT.iterdir()):
        if not site_dir.is_dir():
            continue
        dates = []
        for date_dir in sorted(site_dir.iterdir()):
            if not date_dir.is_dir():
                continue
            mesh_ts = date_dir / "3d_mesh"   / "tiles" / "tileset.json"
            pc_ts   = date_dir / "point_cloud" / "tiles" / "tileset.json"
            dates.append({
                "id":          date_dir.name,
                "mesh":        str(mesh_ts.relative_to(DATA_ROOT.parent)) if mesh_ts.exists() else None,
                "point_cloud": str(pc_ts.relative_to(DATA_ROOT.parent))  if pc_ts.exists()  else None,
            })
        sites.append({"id": site_dir.name, "dates": dates})

    return {"sites": sites}


@app.post("/api/diff", response_model=DiffResponse)
async def run_diff(req: DiffRequest):
    """
    Run the full voxelization + diff pipeline on the server.

    The heavy numpy work runs in a separate process so the async event loop
    stays responsive.

    TODO: Before running computation, check if a cached result exists in DB.
    TODO: After computation, store result in DB for fast replay.
    """
    # ── Resolve paths safely (prevent path traversal) ─────────────────────
    def _resolve(rel: str) -> Path:
        # Strip leading "data/" prefix that config.js prepends
        # because DATA_ROOT already points to the data/ folder.
        rel = rel.lstrip("/")
        if rel.startswith("data/"):
            rel = rel[len("data/"):]
        resolved = (DATA_ROOT / rel).resolve()
        # Security: must stay inside DATA_ROOT
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

    # ── TODO: check DB cache ───────────────────────────────────────────────
    # cache_key = f"{req.path_a}:{req.path_b}:{req.vox_size}:{hash(str(req.polygon))}"
    # cached = await db.get_cached_diff(cache_key)
    # if cached: return cached
    # ─────────────────────────────────────────────────────────────────────

    # Convert polygon to plain dicts for pickling across process boundary
    poly_dicts = (
        [{"lon": p.lon, "lat": p.lat} for p in req.polygon]
        if req.polygon else None
    )

    # Run heavy computation in a worker process
    loop = asyncio.get_event_loop()
    try:
        result = await loop.run_in_executor(
            _executor,
            partial(_run_diff, tileset_a, tileset_b, req.vox_size, poly_dicts),
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Diff computation failed: {e}")

    # ── TODO: store result in DB ──────────────────────────────────────────
    # await db.store_diff_result(cache_key, result)
    # ─────────────────────────────────────────────────────────────────────

    return DiffResponse(
        added=[VoxelResult(**v) for v in result["added"]],
        removed=[VoxelResult(**v) for v in result["removed"]],
        grid_def=GridDef(**result["grid_def"]),
        vox_size=result["vox_size"],
        clipped=result["clipped"],
        stats=result["stats"],
    )


# ── Dev entry point ───────────────────────────────────────────────────────
if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "main:app",
        host=os.getenv("HOST", "127.0.0.1"),
        port=int(os.getenv("PORT", 8000)),
        reload=True,
    )
"""
main.py — FastAPI server for City 3D Change Detection Viewer
"""

import asyncio
import os
import re
import shutil
import zipfile
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from typing import Optional

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Depends, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from glb_parser import load_all_points
from voxelizer import build_surface, diff_solid, make_grid_def, solidify

# db related imports
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession
from database import get_db, engine, AsyncSessionLocal
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
#  PYDANTIC MODELS
# ═════════════════════════════════════════════════════════════════════════

class MeshOffsetUpdate(BaseModel):
    mesh_z_offset: float

class MeshZOffsetUpdate(BaseModel):
    mesh_z_offset: float = Field(..., description="Z offset in metres for mesh alignment")

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

class CreateSiteRequest(BaseModel):
    id:            str   = Field(..., description="Short ASCII site ID, e.g. 'dunpo'")
    label:         str   = Field(..., description="Full display label (Korean + English)")
    label_en:      str   = Field(..., description="English-only label")
    camera_lon:    float
    camera_lat:    float
    camera_height: float
    mesh_z_offset: Optional[float] = None

class CreateDateRequest(BaseModel):
    date_code: str  = Field(..., description="6-digit date code e.g. '260601'")
    label:     str  = Field(..., description="Human readable label e.g. 'Jun 1, 2026'")


# ═════════════════════════════════════════════════════════════════════════
#  HELPERS
# ═════════════════════════════════════════════════════════════════════════

def _rel_path(abs_path: Path) -> str:
    """Return path relative to public/ (i.e. DATA_ROOT parent)."""
    return str(abs_path.relative_to(DATA_ROOT.parent)).replace("\\", "/")


def _validate_zip_structure(extract_dir: Path) -> Path:
    """
    Find tileset.json inside the extracted zip.
    Handles two layouts:
      - tileset.json at root of zip
      - tileset.json inside a subdirectory (e.g. tiles/)
    Returns the Path to the directory containing tileset.json.
    Raises ValueError if not found.
    """
    matches = list(extract_dir.rglob("tileset.json"))
    if not matches:
        raise ValueError("No tileset.json found in the uploaded zip file.")

    # Prefer the shallowest one
    matches.sort(key=lambda p: len(p.parts))
    return matches[0].parent


# ═════════════════════════════════════════════════════════════════════════
#  COMPUTATION (runs in thread pool)
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

    solid_a, solid_b = solidify(surface_a, surface_b, grid_def)
    if _cancelled(job_id): return {"cancelled": True}

    added, removed = diff_solid(solid_a, solid_b)

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
#  ROUTES — health / sites (read)
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


# ═════════════════════════════════════════════════════════════════════════
#  ROUTES — site management
# ═════════════════════════════════════════════════════════════════════════

@app.post("/api/sites", status_code=201)
async def create_site(
    payload: CreateSiteRequest,
    db: AsyncSession = Depends(get_db),
):
    """Create a new site in the database and create its folder."""
    # Validate ID format
    if not re.fullmatch(r"[a-z0-9_\-]+", payload.id):
        raise HTTPException(
            status_code=422,
            detail="Site ID must be lowercase letters, digits, underscores or hyphens only."
        )

    existing = await db.get(Site, payload.id)
    if existing:
        raise HTTPException(status_code=409, detail=f"Site '{payload.id}' already exists.")

    # Create folder
    site_dir = DATA_ROOT / payload.id
    site_dir.mkdir(parents=True, exist_ok=True)

    site = Site(
        id=payload.id,
        label=payload.label,
        label_en=payload.label_en,
        camera_lon=payload.camera_lon,
        camera_lat=payload.camera_lat,
        camera_height=payload.camera_height,
        mesh_z_offset=payload.mesh_z_offset,
    )
    db.add(site)
    await db.commit()
    await db.refresh(site)

    # Reload with dates relationship
    result = await db.execute(
        select(Site).options(selectinload(Site.dates)).where(Site.id == payload.id)
    )
    site = result.scalar_one()
    return {"site": site.to_dict()}


@app.patch("/api/sites/{site_id}/z-offset")
async def update_site_z_offset(
    site_id: str,
    payload: MeshZOffsetUpdate,
):
    async with AsyncSessionLocal() as session:
        site = await session.get(Site, site_id)
        if site is None:
            raise HTTPException(status_code=404, detail="Site not found")
        site.mesh_z_offset = payload.mesh_z_offset
        await session.commit()
        return {"ok": True, "siteId": site_id, "meshZOffset": site.mesh_z_offset}


# ═════════════════════════════════════════════════════════════════════════
#  ROUTES — date management
# ═════════════════════════════════════════════════════════════════════════

@app.post("/api/sites/{site_id}/dates", status_code=201)
async def create_date(
    site_id: str,
    payload: CreateDateRequest,
    db: AsyncSession = Depends(get_db),
):
    """Create a new survey date for a site and create the folder structure."""
    site = await db.get(Site, site_id)
    if site is None:
        raise HTTPException(status_code=404, detail=f"Site '{site_id}' not found.")

    if not re.fullmatch(r"\d{6}", payload.date_code):
        raise HTTPException(status_code=422, detail="date_code must be 6 digits, e.g. '260601'.")

    pk = f"{site_id}_{payload.date_code}"
    existing = await db.get(SurveyDate, pk)
    if existing:
        raise HTTPException(
            status_code=409,
            detail=f"Date '{payload.date_code}' already exists for site '{site_id}'."
        )

    # Create folder structure
    date_dir = DATA_ROOT / site_id / payload.date_code
    (date_dir / "3d_mesh").mkdir(parents=True, exist_ok=True)
    (date_dir / "point_cloud").mkdir(parents=True, exist_ok=True)

    survey = SurveyDate(
        id=pk,
        site_id=site_id,
        date_code=payload.date_code,
        label=payload.label,
        mesh_path=None,
        point_cloud_path=None,
    )
    db.add(survey)
    await db.commit()
    await db.refresh(survey)
    return {"date": survey.to_dict()}


@app.patch("/api/sites/{site_id}/dates/{date_code}/mesh-z-offset")
async def update_mesh_z_offset(
    site_id:   str,
    date_code: str,
    body:      MeshZOffsetUpdate,
    db:        AsyncSession = Depends(get_db),
):
    pk = f"{site_id}_{date_code}"
    date_row = await db.get(SurveyDate, pk)
    if date_row is None:
        raise HTTPException(status_code=404, detail=f"Date not found: {site_id}/{date_code}")
    date_row.mesh_z_offset = body.mesh_z_offset
    await db.commit()
    return {"site_id": site_id, "date_code": date_code, "mesh_z_offset": body.mesh_z_offset}


# ═════════════════════════════════════════════════════════════════════════
#  ROUTES — file uploads
# ═════════════════════════════════════════════════════════════════════════

@app.post("/api/sites/{site_id}/dates/{date_code}/upload/mesh")
async def upload_mesh(
    site_id:   str,
    date_code: str,
    file:      UploadFile = File(...),
    db:        AsyncSession = Depends(get_db),
):
    """
    Upload a mesh tileset zip.
    Extracts into data/{site_id}/{date_code}/3d_mesh/
    Updates DB mesh_path to point at tileset.json.
    """
    pk = f"{site_id}_{date_code}"
    survey = await db.get(SurveyDate, pk)
    if survey is None:
        raise HTTPException(status_code=404, detail=f"Date not found: {site_id}/{date_code}")

    if not file.filename.lower().endswith(".zip"):
        raise HTTPException(status_code=422, detail="Upload must be a .zip file.")

    dest_dir = DATA_ROOT / site_id / date_code / "3d_mesh"
    dest_dir.mkdir(parents=True, exist_ok=True)

    # Save zip to temp location
    tmp_zip = dest_dir / "_upload_tmp.zip"
    try:
        content = await file.read()
        tmp_zip.write_bytes(content)

        # Extract to a temp subfolder for validation
        tmp_extract = dest_dir / "_extract_tmp"
        if tmp_extract.exists():
            shutil.rmtree(tmp_extract)
        tmp_extract.mkdir()

        with zipfile.ZipFile(tmp_zip, "r") as zf:
            zf.extractall(tmp_extract)

        # Find tileset.json
        tileset_dir = _validate_zip_structure(tmp_extract)

        # Clear old contents (except the tmp folder itself)
        for item in dest_dir.iterdir():
            if item.name not in ("_extract_tmp", "_upload_tmp.zip"):
                if item.is_dir():
                    shutil.rmtree(item)
                else:
                    item.unlink()

        # Move extracted content into dest_dir
        for item in tmp_extract.iterdir():
            shutil.move(str(item), str(dest_dir / item.name))

        # Re-find tileset.json after move
        matches = sorted(dest_dir.rglob("tileset.json"), key=lambda p: len(p.parts))
        tileset_abs = matches[0]
        tileset_rel = _rel_path(tileset_abs)

        survey.mesh_path = tileset_rel
        await db.commit()

        return {
            "ok": True,
            "mesh_path": tileset_rel,
            "message": f"Mesh uploaded successfully. tileset.json at: {tileset_rel}"
        }

    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except zipfile.BadZipFile:
        raise HTTPException(status_code=422, detail="Invalid or corrupted zip file.")
    finally:
        if tmp_zip.exists():
            tmp_zip.unlink()
        tmp_extract = dest_dir / "_extract_tmp"
        if tmp_extract.exists():
            shutil.rmtree(tmp_extract)


@app.post("/api/sites/{site_id}/dates/{date_code}/upload/pointcloud")
async def upload_pointcloud(
    site_id:   str,
    date_code: str,
    file:      UploadFile = File(...),
    db:        AsyncSession = Depends(get_db),
):
    """
    Upload a point cloud tileset zip.
    Extracts into data/{site_id}/{date_code}/point_cloud/
    Updates DB point_cloud_path to point at tileset.json.
    """
    pk = f"{site_id}_{date_code}"
    survey = await db.get(SurveyDate, pk)
    if survey is None:
        raise HTTPException(status_code=404, detail=f"Date not found: {site_id}/{date_code}")

    if not file.filename.lower().endswith(".zip"):
        raise HTTPException(status_code=422, detail="Upload must be a .zip file.")

    dest_dir = DATA_ROOT / site_id / date_code / "point_cloud"
    dest_dir.mkdir(parents=True, exist_ok=True)

    tmp_zip = dest_dir / "_upload_tmp.zip"
    try:
        content = await file.read()
        tmp_zip.write_bytes(content)

        tmp_extract = dest_dir / "_extract_tmp"
        if tmp_extract.exists():
            shutil.rmtree(tmp_extract)
        tmp_extract.mkdir()

        with zipfile.ZipFile(tmp_zip, "r") as zf:
            zf.extractall(tmp_extract)

        tileset_dir = _validate_zip_structure(tmp_extract)

        for item in dest_dir.iterdir():
            if item.name not in ("_extract_tmp", "_upload_tmp.zip"):
                if item.is_dir():
                    shutil.rmtree(item)
                else:
                    item.unlink()

        for item in tmp_extract.iterdir():
            shutil.move(str(item), str(dest_dir / item.name))

        matches = sorted(dest_dir.rglob("tileset.json"), key=lambda p: len(p.parts))
        tileset_abs = matches[0]
        tileset_rel = _rel_path(tileset_abs)

        survey.point_cloud_path = tileset_rel
        await db.commit()

        return {
            "ok": True,
            "point_cloud_path": tileset_rel,
            "message": f"Point cloud uploaded successfully. tileset.json at: {tileset_rel}"
        }

    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except zipfile.BadZipFile:
        raise HTTPException(status_code=422, detail="Invalid or corrupted zip file.")
    finally:
        if tmp_zip.exists():
            tmp_zip.unlink()
        tmp_extract = dest_dir / "_extract_tmp"
        if tmp_extract.exists():
            shutil.rmtree(tmp_extract)


# ═════════════════════════════════════════════════════════════════════════
#  ROUTES — diff
# ═════════════════════════════════════════════════════════════════════════

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
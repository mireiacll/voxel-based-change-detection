"""
main.py — FastAPI server for 3D Change Detection Viewer
"""

# ── Patch Starlette's form() default limits BEFORE anything else loads ────
import starlette.requests as _sr
_original_form = _sr.Request.form

def _patched_form(self, *, max_files=100_000, max_fields=100_000):
    return _original_form(self, max_files=max_files, max_fields=max_fields)

_sr.Request.form = _patched_form
# ─────────────────────────────────────────────────────────────────────────

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

from sqlalchemy import select
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession
from database import get_db, engine, AsyncSessionLocal
from models import Base, Site, SurveyDate, TimeseriesDiff

load_dotenv()

DATA_ROOT = Path(os.getenv("DATA_ROOT", "./public/data")).resolve()
ALLOWED_ORIGINS = [
    o.strip()
    for o in os.getenv(
        "ALLOWED_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173"
    ).split(",")
]

app = FastAPI(title="3D Change Detection API", version="2.0.0")
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

_executor = ThreadPoolExecutor(max_workers=os.cpu_count() or 4)
_cancel_flags: dict[str, bool] = {}


# ═════════════════════════════════════════════════════════════════════════
#  PYDANTIC MODELS
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

class CreateSiteRequest(BaseModel):
    id:            str   = Field(..., description="Short ASCII site ID, e.g. 'dunpo'")
    label:         str
    label_en:      str
    camera_lon:    float
    camera_lat:    float
    camera_height: float
    mesh_z_offset: Optional[float] = None

class UpdateSiteRequest(BaseModel):
    label:         Optional[str]   = None
    label_en:      Optional[str]   = None
    camera_lon:    Optional[float] = None
    camera_lat:    Optional[float] = None
    camera_height: Optional[float] = None
    mesh_z_offset: Optional[float] = None

class CreateDateRequest(BaseModel):
    date_code:    str  = Field(..., description="6-digit date code e.g. '260601'")
    label:        str
    dataset_type: str  = Field(..., description="'mesh' or 'pointcloud'")

class UpdateDateRequest(BaseModel):
    label: str


# ═════════════════════════════════════════════════════════════════════════
#  HELPERS
# ═════════════════════════════════════════════════════════════════════════

def _rel_path(abs_path: Path) -> str:
    return str(abs_path.relative_to(DATA_ROOT.parent)).replace("\\", "/")


async def _install_tileset(files: list[UploadFile], dest_dir: Path) -> str:
    """
    Accept either a single .zip or raw folder files (webkitRelativePath).
    Returns the relative path (from public/) to the discovered tileset.json.
    """
    dest_dir.mkdir(parents=True, exist_ok=True)

    is_zip = (
        len(files) == 1
        and files[0].filename.lower().endswith(".zip")
    )

    if is_zip:
        # ── ZIP path ───────────────────────────────────────────────────────
        tmp_zip = dest_dir / "_upload_tmp.zip"
        tmp_extract = dest_dir / "_extract_tmp"
        try:
            tmp_zip.write_bytes(await files[0].read())
            if tmp_extract.exists():
                shutil.rmtree(tmp_extract)
            tmp_extract.mkdir()
            with zipfile.ZipFile(tmp_zip, "r") as zf:
                zf.extractall(tmp_extract)
            matches = list(tmp_extract.rglob("tileset.json"))
            if not matches:
                raise ValueError("No tileset.json found in the uploaded zip file.")
            for item in dest_dir.iterdir():
                if item.name not in ("_extract_tmp", "_upload_tmp.zip"):
                    shutil.rmtree(item) if item.is_dir() else item.unlink()

            # Move extracted content into dest_dir
            for item in tmp_extract.iterdir():
                shutil.move(str(item), str(dest_dir / item.name))
        finally:
            if tmp_zip.exists(): tmp_zip.unlink()
            if tmp_extract.exists(): shutil.rmtree(tmp_extract)
    else:
        tmp_stage = dest_dir / "_stage_tmp"
        if tmp_stage.exists():
            shutil.rmtree(tmp_stage)
        tmp_stage.mkdir()

        try:
            for uf in files:
                # filename may contain path separators from webkitRelativePath
                # Normalise separators and strip any leading slashes
                rel = uf.filename.replace("\\", "/").lstrip("/")
                out_path = tmp_stage / rel
                out_path.parent.mkdir(parents=True, exist_ok=True)
                out_path.write_bytes(await uf.read())

            # Validate the staged content
            matches = sorted(tmp_stage.rglob("tileset.json"), key=lambda p: len(p.parts))
            if not matches:
                raise ValueError("No tileset.json found in the uploaded files.")
            top_level = list(tmp_stage.iterdir())
            if len(top_level) == 1 and top_level[0].is_dir():
                unwrap_src = top_level[0]
            else:
                unwrap_src = tmp_stage

            # Clear old content in dest_dir
            for item in dest_dir.iterdir():
                if item.name != "_stage_tmp":
                    shutil.rmtree(item) if item.is_dir() else item.unlink()

            # Move staged content into dest_dir
            for item in unwrap_src.iterdir():
                shutil.move(str(item), str(dest_dir / item.name))
        finally:
            if tmp_stage.exists():
                shutil.rmtree(tmp_stage)

    # Find tileset.json after everything is in place
    matches = sorted(dest_dir.rglob("tileset.json"), key=lambda p: len(p.parts))
    if not matches:
        raise ValueError("tileset.json not found after extracting files.")
    return _rel_path(matches[0])


# ═════════════════════════════════════════════════════════════════════════
#  DIFF COMPUTATION (runs in thread pool)
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
    if not re.fullmatch(r"[a-z0-9_\-]+", payload.id):
        raise HTTPException(status_code=422, detail="Site ID must be lowercase letters, digits, underscores or hyphens only.")

    existing = await db.get(Site, payload.id)
    if existing:
        raise HTTPException(status_code=409, detail=f"Site '{payload.id}' already exists.")

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

    result = await db.execute(
        select(Site).options(selectinload(Site.dates)).where(Site.id == payload.id)
    )
    site = result.scalar_one()
    return {"site": site.to_dict()}


@app.patch("/api/sites/{site_id}")
async def update_site(
    site_id: str,
    payload: UpdateSiteRequest,
    db: AsyncSession = Depends(get_db),
):
    """Update site metadata (label, camera position, z-offset)."""
    site = await db.get(Site, site_id)
    if site is None:
        raise HTTPException(status_code=404, detail=f"Site '{site_id}' not found.")

    if payload.label         is not None: site.label         = payload.label
    if payload.label_en      is not None: site.label_en      = payload.label_en
    if payload.camera_lon    is not None: site.camera_lon    = payload.camera_lon
    if payload.camera_lat    is not None: site.camera_lat    = payload.camera_lat
    if payload.camera_height is not None: site.camera_height = payload.camera_height
    if payload.mesh_z_offset is not None: site.mesh_z_offset = payload.mesh_z_offset

    await db.commit()

    result = await db.execute(
        select(Site).options(selectinload(Site.dates)).where(Site.id == site_id)
    )
    site = result.scalar_one()
    return {"site": site.to_dict()}


@app.delete("/api/sites/{site_id}", status_code=200)
async def delete_site(
    site_id: str,
    db: AsyncSession = Depends(get_db),
):
    """Delete a site and all its survey dates + data files."""
    site = await db.get(Site, site_id, options=[selectinload(Site.dates)])
    if site is None:
        raise HTTPException(status_code=404, detail=f"Site '{site_id}' not found.")

    # Delete all child SurveyDate rows first
    for date in site.dates:
        await db.delete(date)

    await db.delete(site)
    await db.commit()

    # Remove data files from disk
    site_dir = DATA_ROOT / site_id
    if site_dir.exists():
        shutil.rmtree(site_dir)

    return {"ok": True, "deleted": site_id}


# ═════════════════════════════════════════════════════════════════════════
#  ROUTES — date management (single dataset per date)
# ═════════════════════════════════════════════════════════════════════════

@app.post("/api/sites/{site_id}/dates", status_code=201)
async def create_date(
    site_id: str,
    payload: CreateDateRequest,
    db: AsyncSession = Depends(get_db),
):
    """Create a new survey date for a site.  No dataset yet — upload separately."""
    site = await db.get(Site, site_id)
    if site is None:
        raise HTTPException(status_code=404, detail=f"Site '{site_id}' not found.")

    if not re.fullmatch(r"\d{6}", payload.date_code):
        raise HTTPException(status_code=422, detail="date_code must be 6 digits, e.g. '260601'.")

    if payload.dataset_type not in ("mesh", "pointcloud"):
        raise HTTPException(status_code=422, detail="dataset_type must be 'mesh' or 'pointcloud'.")

    pk = f"{site_id}_{payload.date_code}"
    existing = await db.get(SurveyDate, pk)
    if existing:
        raise HTTPException(status_code=409, detail=f"Date '{payload.date_code}' already exists for site '{site_id}'.")

    date_dir = DATA_ROOT / site_id / payload.date_code
    date_dir.mkdir(parents=True, exist_ok=True)

    survey = SurveyDate(
        id=pk,
        site_id=site_id,
        date_code=payload.date_code,
        label=payload.label,
        dataset_path=None,
        dataset_type=payload.dataset_type,
    )
    db.add(survey)
    await db.commit()
    await db.refresh(survey)
    return {"date": survey.to_dict()}


@app.patch("/api/sites/{site_id}/dates/{date_code}")
async def update_date(
    site_id:   str,
    date_code: str,
    payload:   UpdateDateRequest,
    db:        AsyncSession = Depends(get_db),
):
    """Update survey date label."""
    pk = f"{site_id}_{date_code}"
    survey = await db.get(SurveyDate, pk)
    if survey is None:
        raise HTTPException(status_code=404, detail=f"Date not found: {site_id}/{date_code}")

    survey.label = payload.label
    await db.commit()
    await db.refresh(survey)
    return {"date": survey.to_dict()}


@app.delete("/api/sites/{site_id}/dates/{date_code}", status_code=200)
async def delete_date(
    site_id:   str,
    date_code: str,
    db:        AsyncSession = Depends(get_db),
):
    """Delete a survey date and its data files from disk."""
    pk = f"{site_id}_{date_code}"
    survey = await db.get(SurveyDate, pk)
    if survey is None:
        raise HTTPException(status_code=404, detail=f"Date not found: {site_id}/{date_code}")

    await db.delete(survey)
    await db.commit()

    # Remove data files from disk
    date_dir = DATA_ROOT / site_id / date_code
    if date_dir.exists():
        shutil.rmtree(date_dir)

    return {"ok": True, "deleted": pk}


@app.post("/api/sites/{site_id}/dates/{date_code}/upload")
async def upload_dataset(
    site_id:      str,
    date_code:    str,
    files:        list[UploadFile] = File(...),
    dataset_type: str | None = None,   # optional query param — overrides stored type
    db:           AsyncSession = Depends(get_db),
):
    """
    Upload the dataset (mesh or point cloud) for a date.
    Accepts a single .zip or raw folder files.
    If dataset_type query param is provided it updates the stored type too
    (allows changing type when replacing data).
    """
    pk = f"{site_id}_{date_code}"
    survey = await db.get(SurveyDate, pk)
    if survey is None:
        raise HTTPException(status_code=404, detail=f"Date not found: {site_id}/{date_code}")

    if dataset_type and dataset_type not in ("mesh", "pointcloud"):
        raise HTTPException(status_code=422, detail="dataset_type must be 'mesh' or 'pointcloud'.")

    dest_dir = DATA_ROOT / site_id / date_code / "tiles"
    try:
        tileset_rel = await _install_tileset(files, dest_dir)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except zipfile.BadZipFile:
        raise HTTPException(status_code=422, detail="Invalid or corrupted zip file.")

    survey.dataset_path = tileset_rel
    if dataset_type:
        survey.dataset_type = dataset_type
    await db.commit()
    return {
        "ok": True,
        "dataset_path": tileset_rel,
        "dataset_type": survey.dataset_type,
        "message": f"Dataset uploaded successfully. tileset.json at: {tileset_rel}",
    }


# ═════════════════════════════════════════════════════════════════════════
#  ROUTES — voxel (register pre-computed or scan disk)
# ═════════════════════════════════════════════════════════════════════════

@app.post("/api/sites/{site_id}/dates/{date_code}/voxel")
async def register_voxel(
    site_id:   str,
    date_code: str,
    db:        AsyncSession = Depends(get_db),
):
    """
    Scan disk for a pre-computed voxel tileset at the standard path
    ({site}/{date_code}/voxel/visualization/tileset.json) and register it
    in the database.  Call this after running mago3d-tiler externally.

    Returns the voxel_path on success, 404 if the tileset file is not found.
    """
    pk = f"{site_id}_{date_code}"
    survey = await db.get(SurveyDate, pk)
    if survey is None:
        raise HTTPException(status_code=404, detail=f"Date not found: {site_id}/{date_code}")

    voxel_abs = DATA_ROOT / site_id / date_code / "voxel" / "visualization" / "tileset.json"
    if not voxel_abs.exists():
        raise HTTPException(
            status_code=404,
            detail=f"Voxel tileset not found at expected path: {voxel_abs}. "                   f"Run mago3d-tiler on the point cloud first.",
        )

    voxel_rel = _rel_path(voxel_abs)
    survey.voxel_path = voxel_rel
    await db.commit()

    return {"ok": True, "voxel_path": voxel_rel}


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


# ═════════════════════════════════════════════════════════════════════════
#  ROUTES — full diff (external API proxy / sample fallback)
# ═════════════════════════════════════════════════════════════════════════
SAMPLE_DIFFS_DIR = Path(os.getenv("DATA_ROOT", "./public/data")).parent / "sample"

class FullDiffRequest(BaseModel):
    project_id: str
    date_a:     str
    date_b:     str
    polygon:    Optional[list[PolygonPoint]] = None

@app.post("/api/diff/full")
async def full_diff(
    req: FullDiffRequest,
    db: AsyncSession = Depends(get_db),
):
    site = await db.get(Site, req.project_id, options=[selectinload(Site.dates)])
    if site is None:
        raise HTTPException(status_code=404, detail=f"Project '{req.project_id}' not found.")

    date_ids = {d.date_code for d in site.dates}
    if req.date_a not in date_ids:
        raise HTTPException(status_code=404, detail=f"Date A '{req.date_a}' not found.")
    if req.date_b not in date_ids:
        raise HTTPException(status_code=404, detail=f"Date B '{req.date_b}' not found.")

    # TODO: replace with real httpx call when coworker's API is ready
    # async with httpx.AsyncClient() as client:
    #     res = await client.post(
    #         f"{EXTERNAL_API}/diff/full",
    #         json={
    #             "project_id": req.project_id,
    #             "date_a": req.date_a,
    #             "date_b": req.date_b,
    #             "polygon": [p.dict() for p in req.polygon] if req.polygon else None,
    #         },
    #         timeout=120,
    #     )
    #     res.raise_for_status()
    #     return res.json()

    sample_file = SAMPLE_DIFFS_DIR / "mass-summary.json"
    if not sample_file.exists():
        raise HTTPException(status_code=404, detail="Sample diff file not found.")

    import json as _json
    return _json.loads(sample_file.read_text())

# ═════════════════════════════════════════════════════════════════════════
#  ROUTES — timeseries diffs
# ═════════════════════════════════════════════════════════════════════════

@app.get("/api/sites/{site_id}/diffs")
async def get_site_diffs(
    site_id: str,
    db: AsyncSession = Depends(get_db),
):
    """
    Return all pre-computed timeseries diff records for a site.
    Each entry points to a pre-rendered 3D Tiles tileset (no voxel data inline —
    the frontend loads the tileset directly via Cesium).

    Response shape matches what TimelineDiffs.js expects:
    [
      {
        id, site_id,
        date_a: { id, label },
        date_b: { id, label },
        label,
        tileset_path,   ← NEW: frontend uses this to load the Cesium tileset
      }, …
    ]
    """
    site = await db.get(Site, site_id, options=[selectinload(Site.dates)])
    if site is None:
        raise HTTPException(status_code=404, detail=f"Site '{site_id}' not found.")

    # Build a quick lookup from date_code → label
    date_labels: dict[str, str] = {d.date_code: d.label for d in site.dates}

    from sqlalchemy import select as sa_select
    result = await db.execute(
        sa_select(TimeseriesDiff)
        .where(TimeseriesDiff.site_id == site_id)
        .order_by(TimeseriesDiff.date_a_code)
    )
    diffs = result.scalars().all()

    return [
        d.to_dict(
            date_a_label=date_labels.get(d.date_a_code, d.date_a_code),
            date_b_label=date_labels.get(d.date_b_code, d.date_b_code),
        )
        for d in diffs
    ]


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "main:app",
        host=os.getenv("HOST", "127.0.0.1"),
        port=int(os.getenv("PORT", 8000)),
        reload=True,
    )
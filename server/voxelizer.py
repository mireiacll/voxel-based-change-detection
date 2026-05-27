"""
voxelizer.py — 3-D voxelization and volumetric diff (server-side)

Mirrors lib/voxelizer.js exactly, with numpy for vectorised operations.

ALGORITHM (identical to the JS version):
  1. make_grid_def(points, vox_size)
     Compute lon/lat/h step sizes from the average latitude of all points.

  2. build_surface(points, grid_def, polygon)
     Bin each point into its (iLon, iLat, iH) voxel cell.
     Returns a set of voxel keys for the sparse surface shell.

  3. solidify(surface_a, surface_b, grid_def)
     For each (iLon, iLat) column, fill from per-column floor up to maxH.
     Per-column floor = min(minH_A, minH_B) — prevents a single noisy
     outlier in one column from dragging the floor down everywhere else.

  4. diff_solid(solid_a, solid_b)
     Keys in B but not A → 'added'
     Keys in A but not B → 'removed'
     Returns voxel coordinate dicts {iLon, iLat, iH, type}.
"""

from __future__ import annotations

from typing import Optional

import numpy as np


# ── Type alias ────────────────────────────────────────────────────────────
# A surface/solid is a dict mapping "iLon,iLat,iH" → (iLon, iLat, iH) tuple.
VoxelMap = dict[str, tuple[int, int, int]]


# ── Grid definition ───────────────────────────────────────────────────────

def make_grid_def(points: np.ndarray, vox_size: float) -> dict:
    """
    Compute the shared voxel grid definition.

    Parameters
    ----------
    points   : (N, 3) float64  [lon°, lat°, h m]
    vox_size : cell size in metres

    Returns
    -------
    dict with keys: lon_step, lat_step, h_step  (all in degrees or metres)
    """
    if points.shape[0] == 0:
        step = vox_size / 111_000
        return {"lon_step": step, "lat_step": step, "h_step": vox_size}

    valid = points[np.isfinite(points).all(axis=1)]
    if valid.shape[0] == 0:
        step = vox_size / 111_000
        return {"lon_step": step, "lat_step": step, "h_step": vox_size}

    avg_lat = float(valid[:, 1].mean())
    cos_lat = np.cos(np.radians(avg_lat))

    return {
        "lon_step": vox_size / (111_000 * cos_lat),   # degrees lon per voxel
        "lat_step": vox_size / 111_000,               # degrees lat per voxel
        "h_step":   vox_size,                         # metres per voxel
    }


# ── Step 1: surface shell ─────────────────────────────────────────────────

def _pip(lon: np.ndarray, lat: np.ndarray, poly: list[dict]) -> np.ndarray:
    """
    Vectorised point-in-polygon (ray casting) for arrays of lon/lat.

    Parameters
    ----------
    lon, lat : 1-D float64 arrays of length N
    poly     : list of {lon, lat} dicts (closed polygon)

    Returns
    -------
    Boolean mask of length N — True = inside polygon
    """
    inside = np.zeros(len(lon), dtype=bool)
    n = len(poly)
    j = n - 1
    for i in range(n):
        xi, yi = poly[i]["lon"], poly[i]["lat"]
        xj, yj = poly[j]["lon"], poly[j]["lat"]
        # Ray-casting condition
        cond = ((yi > lat) != (yj > lat)) & (
            lon < (xj - xi) * (lat - yi) / (yj - yi) + xi
        )
        inside ^= cond
        j = i
    return inside


def build_surface(
    points:   np.ndarray,
    grid_def: dict,
    polygon:  Optional[list[dict]] = None,
) -> VoxelMap:
    """
    Bin raw geodetic points into a sparse voxel occupancy map.

    Parameters
    ----------
    points   : (N, 3) float64  [lon°, lat°, h m]
    grid_def : output of make_grid_def()
    polygon  : optional list of {lon, lat} dicts; None = no filter

    Returns
    -------
    dict  key="iLon,iLat,iH"  value=(iLon, iLat, iH)
    """
    lon_step = grid_def["lon_step"]
    lat_step = grid_def["lat_step"]
    h_step   = grid_def["h_step"]

    # Drop NaN / Inf
    mask = np.isfinite(points).all(axis=1)
    pts  = points[mask]

    if pts.shape[0] == 0:
        return {}

    lon = pts[:, 0]
    lat = pts[:, 1]
    h   = pts[:, 2]

    # Apply polygon filter
    if polygon and len(polygon) >= 3:
        in_poly = _pip(lon, lat, polygon)
        lon, lat, h = lon[in_poly], lat[in_poly], h[in_poly]

    if len(lon) == 0:
        return {}

    i_lon = np.floor(lon / lon_step).astype(np.int64)
    i_lat = np.floor(lat / lat_step).astype(np.int64)
    i_h   = np.floor(h   / h_step  ).astype(np.int64)

    surface: VoxelMap = {}
    for il, ia, ih in zip(i_lon, i_lat, i_h):
        key = f"{il},{ia},{ih}"
        if key not in surface:
            surface[key] = (int(il), int(ia), int(ih))

    return surface


# ── Step 2: solidification ────────────────────────────────────────────────

def solidify(
    surface_a: VoxelMap,
    surface_b: VoxelMap,
    grid_def:  dict,          # kept for API symmetry with JS; not used here
) -> tuple[VoxelMap, VoxelMap]:
    """
    Fill each (iLon, iLat) column from per-column floor up to maxH.

    Returns
    -------
    (solid_a, solid_b) — two VoxelMaps of filled-solid voxels
    """
    # ── Column stats per dataset ──────────────────────────────────────────
    def _col_stats(surface: VoxelMap) -> dict[str, dict]:
        cols: dict[str, dict] = {}
        for (il, ia, ih) in surface.values():
            ck = f"{il},{ia}"
            if ck not in cols:
                cols[ck] = {"il": il, "ia": ia, "min_h": ih, "max_h": ih}
            else:
                if ih < cols[ck]["min_h"]: cols[ck]["min_h"] = ih
                if ih > cols[ck]["max_h"]: cols[ck]["max_h"] = ih
        return cols

    cols_a = _col_stats(surface_a)
    cols_b = _col_stats(surface_b)

    # ── Per-column floor = min(minH_A, minH_B) ───────────────────────────
    col_floor: dict[str, int] = {}
    for ck, col in cols_a.items():
        col_floor[ck] = col["min_h"]
    for ck, col in cols_b.items():
        prev = col_floor.get(ck)
        col_floor[ck] = col["min_h"] if prev is None else min(prev, col["min_h"])

    # ── Fill columns floor → maxH ─────────────────────────────────────────
    def _fill(cols: dict[str, dict]) -> VoxelMap:
        solid: VoxelMap = {}
        for ck, col in cols.items():
            il, ia  = col["il"], col["ia"]
            floor_h = col_floor.get(ck, 0)
            for ih in range(floor_h, col["max_h"] + 1):
                key = f"{il},{ia},{ih}"
                if key not in solid:
                    solid[key] = (il, ia, ih)
        return solid

    solid_a = _fill(cols_a)
    solid_b = _fill(cols_b)

    print(
        f"[voxelizer] Solid voxels — A: {len(solid_a)}, B: {len(solid_b)}"
    )
    return solid_a, solid_b


# ── Step 3: diff ──────────────────────────────────────────────────────────

def diff_solid(
    solid_a: VoxelMap,
    solid_b: VoxelMap,
) -> tuple[list[dict], list[dict]]:
    """
    Compute the volumetric diff between two solid voxel maps.

    Returns
    -------
    (added, removed)
    Each element is a list of dicts: { iLon, iLat, iH, type }
    """
    added:   list[dict] = []
    removed: list[dict] = []

    for key, (il, ia, ih) in solid_b.items():
        if key not in solid_a:
            added.append({"iLon": il, "iLat": ia, "iH": ih, "type": "added"})

    for key, (il, ia, ih) in solid_a.items():
        if key not in solid_b:
            removed.append({"iLon": il, "iLat": ia, "iH": ih, "type": "removed"})

    return added, removed
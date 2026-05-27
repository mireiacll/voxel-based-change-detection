"""
glb_parser.py — mago3d-tiler GLB point-cloud parser (server-side)

Mirrors the exact transform pipeline from lib/glbParser.js using numpy
for vectorised operations (~10-50x faster than the browser JS version).

Transform pipeline (verified against real Korea site files):
  1.  uint16 / 65535            → normalised local coords  [0, 1]
  2.  Apply PointCloudNode matrix M (column-major 4×4)
  3.  Add RootNode translation
  4.  glTF Y-up → ECEF Z-up:   ecef = (gx, -gz, gy)
  5.  ECEF → (lon°, lat°, h m)  via Bowring iterative method (10 iters)
"""

import json
import struct
from pathlib import Path

import numpy as np

# ── WGS-84 constants ──────────────────────────────────────────────────────
_A  = 6_378_137.0
_E2 = 0.006_694_379_990_14


def _ecef_to_geodetic(ecef: np.ndarray) -> np.ndarray:
    """
    Vectorised ECEF → geodetic (lon°, lat°, h m).

    Parameters
    ----------
    ecef : (N, 3) float64  [x, y, z] metres

    Returns
    -------
    (N, 3) float64  [lon°, lat°, h m]
    """
    x, y, z = ecef[:, 0], ecef[:, 1], ecef[:, 2]
    p   = np.sqrt(x * x + y * y)
    lat = np.arctan2(z, p * (1.0 - _E2))

    for _ in range(10):                          # Bowring iteration
        s   = np.sin(lat)
        N   = _A / np.sqrt(1.0 - _E2 * s * s)
        lat = np.arctan2(z + _E2 * N * s, p)

    s   = np.sin(lat)
    c   = np.cos(lat)
    N   = _A / np.sqrt(1.0 - _E2 * s * s)
    h   = np.where(
        np.abs(c) > 1e-9,
        p / c - N,
        np.abs(z) / s - N * (1.0 - _E2),
    )
    lon = np.arctan2(y, x) * (180.0 / np.pi)

    return np.column_stack([lon, lat * (180.0 / np.pi), h])


def parse_glb(glb_path: Path) -> np.ndarray:
    """
    Parse one mago3d-tiler .glb point-cloud file from disk.

    Parameters
    ----------
    glb_path : Path to the .glb file

    Returns
    -------
    (N, 3) float64  [lon°, lat°, h m]
    Empty (0, 3) array on any error.
    """
    data = glb_path.read_bytes()

    # Validate GLB magic  b'glTF'
    if data[:4] != b"glTF":
        print(f"[glb_parser] Not a valid GLB: {glb_path}")
        return np.zeros((0, 3), dtype=np.float64)

    json_len = struct.unpack_from("<I", data, 12)[0]
    gltf     = json.loads(data[20 : 20 + json_len])

    # Binary chunk starts after: 12-byte GLB header
    #                          + 8-byte chunk-0 header (len + type)
    #                          + json_len bytes
    bin_base = 20 + json_len + 8

    # ── Locate POSITION accessor ──────────────────────────────────────────
    pos_acc_idx = -1
    for mesh in gltf.get("meshes", []):
        for prim in mesh.get("primitives", []):
            if "POSITION" in prim.get("attributes", {}):
                pos_acc_idx = prim["attributes"]["POSITION"]
                break
        if pos_acc_idx >= 0:
            break

    if pos_acc_idx < 0:
        print(f"[glb_parser] No POSITION attribute: {glb_path}")
        return np.zeros((0, 3), dtype=np.float64)

    acc     = gltf["accessors"][pos_acc_idx]
    bv      = gltf["bufferViews"][acc["bufferView"]]
    count   = acc["count"]
    # mago3d uses byteStride = 8  (3 × uint16 = 6 bytes + 2 bytes padding)
    stride  = bv.get("byteStride", 6)
    bin_off = bin_base + bv.get("byteOffset", 0) + acc.get("byteOffset", 0)

    # ── Node transforms ───────────────────────────────────────────────────
    rtx = rty = rtz = 0.0
    pcm = None

    for nd in gltf.get("nodes", []):
        if "matrix" in nd and nd.get("mesh") is not None:
            pcm = nd["matrix"]                           # PointCloudNode
        elif "translation" in nd and "children" in nd and "matrix" not in nd:
            rtx, rty, rtz = nd["translation"]            # RootNode

    if pcm is None:
        print(f"[glb_parser] PointCloudNode matrix not found: {glb_path}")
        return np.zeros((0, 3), dtype=np.float64)

    M = pcm   # 16-element list, column-major

    # ── Read uint16 positions (vectorised) ────────────────────────────────
    # stride in bytes, uint16 = 2 bytes → stride // 2 elements per row
    elems = stride // 2
    raw   = (
        np.frombuffer(
            data[bin_off : bin_off + count * stride], dtype=np.uint16
        )
        .reshape(count, elems)[:, :3]          # keep only x, y, z
        .astype(np.float64) / 65535.0
    )

    lx, ly, lz = raw[:, 0], raw[:, 1], raw[:, 2]

    # ── Apply PointCloudNode matrix (column-major 4×4) ────────────────────
    wx = M[0]*lx + M[4]*ly + M[8]*lz  + M[12]
    wy = M[1]*lx + M[5]*ly + M[9]*lz  + M[13]
    wz = M[2]*lx + M[6]*ly + M[10]*lz + M[14]

    # ── Add RootNode translation ──────────────────────────────────────────
    gx = wx + rtx
    gy = wy + rty
    gz = wz + rtz

    # ── glTF Y-up → ECEF Z-up → geodetic ─────────────────────────────────
    ecef = np.column_stack([gx, -gz, gy])
    return _ecef_to_geodetic(ecef)


def _collect_glb_uris(tile: dict, out: list) -> None:
    """Walk a 3D-Tiles tile tree and collect all .glb content URIs."""
    if not tile:
        return
    content = tile.get("content", {})
    uri = content.get("uri") or content.get("url", "")
    if uri.lower().endswith(".glb"):
        out.append(uri)
    for child in tile.get("children", []):
        _collect_glb_uris(child, out)


def load_all_points(tileset_path: Path) -> np.ndarray:
    """
    Read a tileset.json from disk, walk its tile tree, parse every .glb,
    and return the combined geodetic point array.

    Parameters
    ----------
    tileset_path : absolute Path to tileset.json

    Returns
    -------
    (N, 3) float64  [lon°, lat°, h m]
    """
    if not tileset_path.exists():
        print(f"[glb_parser] tileset not found: {tileset_path}")
        return np.zeros((0, 3), dtype=np.float64)

    with open(tileset_path) as f:
        ts_json = json.load(f)

    uris: list[str] = []
    _collect_glb_uris(ts_json.get("root", {}), uris)
    print(f"[glb_parser] {len(uris)} GLB tiles in {tileset_path}")

    tile_dir = tileset_path.parent
    batches  = []
    for uri in uris:
        glb_path = (tile_dir / uri).resolve()
        pts = parse_glb(glb_path)
        if pts.shape[0] > 0:
            batches.append(pts)

    if not batches:
        return np.zeros((0, 3), dtype=np.float64)

    all_pts = np.vstack(batches)
    print(f"[glb_parser] {all_pts.shape[0]} total points from {tileset_path}")
    return all_pts
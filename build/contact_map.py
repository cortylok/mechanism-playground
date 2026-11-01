"""Make a depth map for physics/modules/contact_map.js from a cam-face STL.

The follower tip presses DOWN the chosen axis (default -y) onto the surface. For each (x, z) grid cell a ray finds the
surface height h; depth = top - h. A ball tip of radius R cannot reach into gaps narrower than itself, so the depth is
min-filtered over a disc of radius R (a conservative ball model). Cells with no surface below get --through depth.
Cells shallower than --min-depth are walls (255).

  py build/contact_map.py cam.stl --x -6 6 --z -30 12 --res 0.05 --tip-r 0.75 --min-wall 25 -o map.json
"""
import argparse
import base64
import json
import zlib

import numpy as np
import trimesh
from scipy import ndimage

AX = {"x": 0, "y": 1, "z": 2}


def depth_map(mesh, xr, zr, res, axis="y", top=None, tip_r=0.0, through=None, min_depth=-1.0):
    a = AX[axis]
    u, w = [k for k in (0, 1, 2) if k != a]                          # grid axes (x-like, z-like)
    xs = np.arange(xr[0], xr[1] + res / 2, res)
    zs = np.arange(zr[0], zr[1] + res / 2, res)
    top = float(mesh.bounds[1][a]) if top is None else top
    X, Z = np.meshgrid(xs, zs)                                       # rows = z, cols = x
    org = np.zeros((X.size, 3))
    org[:, u], org[:, w], org[:, a] = X.ravel(), Z.ravel(), top + 1.0
    d = np.zeros(3)
    d[a] = -1.0
    loc, ray, _ = mesh.ray.intersects_location(org, np.tile(d, (len(org), 1)), multiple_hits=False)
    h = np.full(X.size, np.nan)
    h[ray] = loc[:, a]
    depth = top - h.reshape(X.shape)
    through = float(np.nanmax(depth)) if through is None else through
    depth = np.where(np.isnan(depth), through, depth)
    if tip_r > 0:
        r = int(np.ceil(tip_r / res))
        yy, xx = np.mgrid[-r:r + 1, -r:r + 1]
        depth = ndimage.minimum_filter(depth, footprint=(xx * xx + yy * yy) <= r * r, mode="nearest")
    wall = depth < min_depth
    return xs, zs, depth, wall


def encode(xs, zs, depth, wall, res, min_wall):
    mx = float(depth[~wall].max()) if (~wall).any() else 1.0
    scale = max(1, int(np.floor(254 / max(mx, 1e-6))))
    q = np.clip(np.round(depth * scale), 0, 254).astype(np.uint8)
    q[wall] = 255
    return dict(x0=float(xs[0]), z0=float(zs[0]), res=res, nx=len(xs), nz=len(zs), scale=scale, min_wall=min_wall,
                data_b64=base64.b64encode(zlib.compress(q.tobytes(), 9)).decode())


def main():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("stl")
    p.add_argument("--axis", default="y", choices="xyz")
    p.add_argument("--x", nargs=2, type=float, required=True)
    p.add_argument("--z", nargs=2, type=float, required=True)
    p.add_argument("--res", type=float, default=0.05)
    p.add_argument("--top", type=float)
    p.add_argument("--tip-r", type=float, default=0.0)
    p.add_argument("--through", type=float)
    p.add_argument("--min-depth", type=float, default=-1.0)
    p.add_argument("--min-wall", type=float, default=25.0, help="shallowest wall angle, deg (friction cone)")
    p.add_argument("-o", "--out", required=True)
    a = p.parse_args()
    m = trimesh.load(a.stl, force="mesh")
    xs, zs, depth, wall = depth_map(m, a.x, a.z, a.res, a.axis, a.top, a.tip_r, a.through, a.min_depth)
    json.dump(encode(xs, zs, depth, wall, a.res, a.min_wall), open(a.out, "w"), separators=(",", ":"))
    print(f"{a.out}: {len(xs)} x {len(zs)} cells, depth 0..{depth[~wall].max():.3f} mm, walls {int(wall.sum())}")


if __name__ == "__main__":
    main()

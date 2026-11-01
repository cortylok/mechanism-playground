"""Pack a project's meshes for the page: <project>/parts.json + STLs -> <project>/out/data.json.

Meshes are quantised to uint16 per axis, vertices put in Morton (space-filling) order and faces sorted, both stored as
deltas, zlib-compressed and base64-encoded (lossless after quantisation; neighbours are close, so deltas zip well).
Mass properties come from parts.json ("mass", "com", "inertia") or, for a watertight mesh with a "density" (g/cm^3),
from the mesh. Units: mm, kg, kg*mm^2.

  py build/pack.py examples/starter
"""
import base64
import json
import os
import sys
import zlib

import numpy as np
import trimesh

MAX_TRIS = int(os.environ.get("MAX_TRIS", "20000"))


def fail(msg):
    sys.exit(f"pack.py: {msg}")


def enc(t):
    v, f = np.asarray(t.vertices), np.asarray(t.faces)
    lo, hi = v.min(0), v.max(0)
    q = np.round((v - lo) / np.maximum(hi - lo, 1e-9) * 65535).astype(np.int64)

    def b64(a):
        return base64.b64encode(zlib.compress(a.tobytes(), 9)).decode()

    def part1by2(k):
        x = (q[:, k] >> 6) & 0x3FF
        x = (x | (x << 16)) & 0x30000FF
        x = (x | (x << 8)) & 0x300F00F
        x = (x | (x << 4)) & 0x30C30C3
        return (x | (x << 2)) & 0x9249249
    order = np.argsort(part1by2(0) | (part1by2(1) << 1) | (part1by2(2) << 2), kind="stable")
    inv = np.empty_like(order)
    inv[order] = np.arange(len(order))
    q, f = q[order], inv[f]
    f = f[np.argsort(f.min(1), kind="stable")]
    vd = (np.diff(q, axis=0, prepend=0) % 65536).astype("<u2")
    fd = np.diff(f.ravel().astype(np.int64), prepend=0).astype("<i4")
    return dict(lo=lo.round(4).tolist(), hi=hi.round(4).tolist(), v=b64(vd), vd=True, f=b64(fd), fd=True, nf=int(len(f)))


def decimate(t, pid):
    if len(t.faces) <= MAX_TRIS:
        return t
    import fast_simplification
    v, f = fast_simplification.simplify(np.asarray(t.vertices, np.float32), np.asarray(t.faces, np.int32),
                                        1 - MAX_TRIS / len(t.faces), agg=3)
    d = trimesh.Trimesh(v, f, process=True)
    dev = float(trimesh.proximity.closest_point(d, t.sample(5000))[1].max())
    print(f"  decimated {pid}: {len(t.faces)} -> {len(d.faces)} tris, max deviation {dev:.3f} mm")
    return d


def mass_props(t, p, pid):
    out = {k: p[k] for k in ("mass", "com", "inertia") if k in p}
    if "mass" in out and "com" in out:
        return out
    if "density" in p:
        if not t.is_watertight:
            print(f"  WARNING {pid}: mesh is not watertight - give mass/com/inertia in parts.json")
            return out
        rho = float(p["density"]) * 1e-6                                # g/cm^3 -> kg/mm^3
        out.setdefault("mass", round(float(t.volume) * rho, 6))
        out.setdefault("com", np.round(t.center_mass, 4).tolist())
        out.setdefault("inertia", np.round(np.asarray(t.moment_inertia) * rho, 6).tolist())
    return out


def pack(project):
    pj = os.path.join(project, "parts.json")
    if not os.path.exists(pj):
        fail(f"{pj} not found")
    spec = json.load(open(pj, encoding="utf-8"))
    parts = []
    for p in spec["parts"]:
        pid = p["id"]
        path = os.path.join(project, p["stl"])
        if not os.path.exists(path):
            fail(f"part '{pid}': STL {p['stl']} not found")
        t = trimesh.load(path, force="mesh", process=True)
        t.merge_vertices()
        if not t.is_watertight:
            print(f"  note {pid}: mesh is not watertight (fine for display)")
        props = mass_props(t, p, pid)
        t = decimate(t, pid)
        parts.append(dict(id=pid, label=p.get("label", pid), group=p.get("group", "parts"), colour=p.get("colour"),
                          motion=p.get("motion"), info=p.get("info"), mesh=enc(t), **props))
    groups = spec.get("groups") or [{"key": g, "label": g} for g in dict.fromkeys(q["group"] for q in parts)]
    data = dict(name=spec.get("name", os.path.basename(os.path.abspath(project))), units="mm", groups=groups, parts=parts)
    for k, v in spec.items():                                        # extra keys (e.g. "geometry") pass through to the page
        if k not in ("parts", "groups", "name"):
            data[k] = v
    os.makedirs(os.path.join(project, "out"), exist_ok=True)
    s = json.dumps(data, separators=(",", ":"))
    open(os.path.join(project, "out", "data.json"), "w", encoding="utf-8").write(s)
    print(f"{len(parts)} parts, {sum(q['mesh']['nf'] for q in parts)} tris, data {len(s) / 1e6:.2f} MB")
    return data


if __name__ == "__main__":
    if len(sys.argv) != 2:
        fail("usage: py build/pack.py <project folder>")
    pack(sys.argv[1])

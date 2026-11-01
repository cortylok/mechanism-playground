"""Lighter display copies of very large meshes inside a packed data.json (the page only - print / CAD files are not
touched). Each part above --over triangles is decimated toward --target and kept only if its deviation from the
original (two-way, sampled) stays under --max-dev mm.

  py build/display_decimate.py examples/s3-side-table/data/data.json --over 150000 --target 100000 --max-dev 0.05
  py build/display_decimate.py <data.json> --list          # just list the biggest parts
"""
import argparse
import base64
import json
import os
import sys
import zlib

import numpy as np
import trimesh

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from pack import enc                                                # noqa: E402


def dec(m):
    q = np.frombuffer(zlib.decompress(base64.b64decode(m["v"])), "<u2").astype(np.int64).reshape(-1, 3)
    if m.get("vd"):
        q = np.cumsum(q, axis=0) % 65536
    if m.get("fd"):
        f = np.cumsum(np.frombuffer(zlib.decompress(base64.b64decode(m["f"])), "<i4").astype(np.int64))
    else:
        f = np.frombuffer(zlib.decompress(base64.b64decode(m["f"])), "<u4" if m.get("i32") else "<u2").astype(np.int64)
    lo, hi = np.array(m["lo"]), np.array(m["hi"])
    return trimesh.Trimesh(lo + q / 65535.0 * (hi - lo), f.reshape(-1, 3), process=False)


def main():
    p = argparse.ArgumentParser()
    p.add_argument("data")
    p.add_argument("--over", type=int, default=150000)
    p.add_argument("--target", type=int, default=100000)
    p.add_argument("--max-dev", type=float, default=0.05)
    p.add_argument("--agg", type=int, default=1, help="fast-simplification aggressiveness (lower = closer to the original, slower)")
    p.add_argument("--list", action="store_true")
    a = p.parse_args()
    D = json.load(open(a.data, encoding="utf-8"))
    parts = sorted(D["parts"], key=lambda q: -q["mesh"]["nf"])
    if a.list:
        for q in parts[:8]:
            print(f"{q['mesh']['nf']:8d}  {q['id']}")
        return
    import fast_simplification
    changed = 0
    for q in parts:
        if q["mesh"]["nf"] <= a.over:
            break
        t = dec(q["mesh"])
        v, f = fast_simplification.simplify(np.asarray(t.vertices, np.float32), np.asarray(t.faces, np.int32), 1 - a.target / len(t.faces), agg=a.agg)
        d = trimesh.Trimesh(v, f, process=True)
        pa, pb = t.sample(20000), d.sample(20000)
        dev = max(float(trimesh.proximity.closest_point(d, pa)[1].max()), float(trimesh.proximity.closest_point(t, pb)[1].max()))
        ok = dev <= a.max_dev
        print(f"{q['id']}: {len(t.faces)} -> {len(d.faces)} tris, deviation {dev:.3f} mm -> {'kept' if ok else 'REJECTED (over --max-dev)'}")
        if ok:
            q["mesh"] = enc(d)
            q.setdefault("info", None)
            changed += 1
    if changed:
        open(a.data, "w", encoding="utf-8").write(json.dumps(D, separators=(",", ":")))
        print(f"{changed} part(s) replaced in {a.data}")


if __name__ == "__main__":
    main()

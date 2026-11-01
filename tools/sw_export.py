"""Export the active SolidWorks assembly for the playground: one STL per visible part in assembly coordinates (mm) and a
parts.json with mass properties. Read-only: it never saves, rebuilds or changes the assembly.

  py tools/sw_export.py <out project folder> [--config "Closed"] [--no-mass] [--group-by top|none]

Needs Windows, SolidWorks running with the assembly open and active, and pywin32 (pip install pywin32).
Each leaf component's bodies are tessellated face by face (IFace2.GetTessTriangles) and moved by the component
transform; the result box is compared with IComponent2.GetBox and the closer of raw / transformed is kept (some
SolidWorks versions return the tessellation already in assembly space).
Mass properties (IMassProperty from the part's own document) are moved into assembly space: com = R c + t,
inertia = R I R^T. Units out: mm, kg, kg*mm^2. Check them against SolidWorks' own Mass Properties for one part.
Tip: export each pose you need (closed / open configurations) into its own folder; the playground poses parts from
the first export with the matrices your mechanism.js computes.
"""
import argparse
import json
import os
import re
import struct
import sys

import numpy as np


def com():
    try:
        import pythoncom
        import win32com.client as wc
    except ImportError:
        sys.exit("sw_export.py: needs pywin32 (pip install pywin32) on Windows")
    try:
        sw = wc.GetActiveObject("SldWorks.Application")
    except Exception:                                             # noqa: BLE001
        sys.exit("sw_export.py: SolidWorks is not running (start it and open the assembly)")
    return sw, pythoncom, wc


def leaves(c, out, path=""):
    if c.IsSuppressed():
        return
    kids = c.GetChildren() or ()
    if kids:
        for k in kids:
            leaves(k, out, path + c.Name2 + "/")
    elif c.Visible:
        out.append((path + c.Name2, c))


def bodies_of(c, pythoncom, wc):
    try:
        info = wc.VARIANT(pythoncom.VT_BYREF | pythoncom.VT_VARIANT, None)
        res = c.GetBodies3(0, info)                               # 0 = solid bodies
    except Exception:                                             # noqa: BLE001
        res = c.GetBodies2(0)
    if isinstance(res, tuple) and res and isinstance(res[0], (tuple, list)):
        res = res[0]
    return res or ()


def transform(c):
    T = np.array(c.Transform2.ArrayData, float)
    return T[0:9].reshape(3, 3), T[9:12], T[12]


def tess(c, pythoncom, wc):
    R, t, s = transform(c)
    tris = []
    for b in bodies_of(c, pythoncom, wc):
        for f in b.GetFaces() or ():
            tt = f.GetTessTriangles(True)
            if tt:
                tris.append(np.array(tt, float).reshape(-1, 3))
    if not tris:
        return None
    p = np.vstack(tris)
    box = np.array(c.GetBox(False, False) or [0] * 6, float) * 1000
    cand = {"raw": p * 1000, "xf": (p @ R * s + t) * 1000}
    err = {k: np.abs(np.r_[v.min(0), v.max(0)] - box).max() for k, v in cand.items()}
    return cand[min(err, key=err.get)].reshape(-1, 3, 3)


def write_stl(path, tris):
    n = np.cross(tris[:, 1] - tris[:, 0], tris[:, 2] - tris[:, 0])
    n /= np.maximum(np.linalg.norm(n, axis=1, keepdims=True), 1e-12)
    with open(path, "wb") as f:
        f.write(b"mechanism-playground sw_export".ljust(80, b" "))
        f.write(struct.pack("<I", len(tris)))
        for k in range(len(tris)):
            f.write(struct.pack("<12fH", *n[k], *tris[k].ravel(), 0))


def mass(c, R, t):
    doc = c.GetModelDoc2()
    if doc is None:
        return {}
    mp = doc.Extension.CreateMassProperty()
    if mp is None:
        return {}
    m = float(mp.Mass)
    if m <= 0:
        return {}
    cm = np.array(mp.CenterOfMass, float) * 1000                   # part frame, mm
    I = np.array(mp.GetMomentOfInertia(0), float).reshape(3, 3) * 1e6   # about the com, part axes, kg*mm^2
    # SolidWorks transforms act on row vectors (p @ R + t, as the tessellation above): the inertia turns as R^T I R
    return dict(mass=round(m, 6), com=np.round(cm @ R + t * 1000, 4).tolist(), inertia=np.round(R.T @ I @ R, 6).tolist())


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("out")
    ap.add_argument("--config", help="show this configuration first (the original is restored after)")
    ap.add_argument("--no-mass", action="store_true")
    ap.add_argument("--group-by", choices=("top", "none"), default="top")
    a = ap.parse_args()
    sw, pythoncom, wc = com()
    doc = sw.ActiveDoc
    if doc is None or doc.GetType() != 2:                           # swDocASSEMBLY
        sys.exit("sw_export.py: make an assembly the active document")
    before = doc.GetActiveConfiguration().Name
    if a.config:
        doc.ShowConfiguration2(a.config)
        if doc.GetActiveConfiguration().Name != a.config:
            sys.exit(f"sw_export.py: configuration '{a.config}' not found")
        doc.EditRebuild3()
    os.makedirs(os.path.join(a.out, "meshes"), exist_ok=True)
    comps = []
    for c in doc.GetComponents(True) or ():
        leaves(c, comps)
    parts, used = [], set()
    for name, c in comps:
        tris = tess(c, pythoncom, wc)
        if tris is None:
            print(f"  skip {name}: no solid bodies")
            continue
        pid = re.sub(r"[^\w\-. ]", "_", name.split("/")[-1]).strip() or "part"
        base, k = pid, 2
        while pid in used:
            pid, k = f"{base} ({k})", k + 1
        used.add(pid)
        fn = f"meshes/{re.sub(r'[^A-Za-z0-9_.-]', '_', pid)}.stl"
        write_stl(os.path.join(a.out, fn), tris)
        p = dict(id=pid, stl=fn, label=name.split("/")[-1], group=name.split("/")[0] if a.group_by == "top" and "/" in name else "parts")
        if not a.no_mass:
            try:
                R, t, _ = transform(c)
                p.update(mass(c, R, t))
            except Exception as e:                                   # noqa: BLE001
                print(f"  {name}: no mass properties ({e})")
        parts.append(p)
        print(f"  {name}: {len(tris)} tris" + (f", {p['mass']} kg" if "mass" in p else ""))
    if a.config and before != a.config:
        doc.ShowConfiguration2(before)
    title = os.path.splitext(os.path.basename(doc.GetPathName() or "assembly"))[0]
    json.dump(dict(name=re.sub(r"[^a-z0-9-]+", "-", title.lower()).strip("-") or "project", parts=parts),
              open(os.path.join(a.out, "parts.json"), "w", encoding="utf-8"), indent=1)
    print(f"{len(parts)} parts -> {a.out} (assembly not saved)")


if __name__ == "__main__":
    main()

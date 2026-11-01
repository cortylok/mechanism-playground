"""Make the starter example's parts: an open box, a lid hinged on the box's back top edge, and a gas strut (body + rod)
between the box's right wall and the lid. Writes meshes/*.stl and parts.json.  py examples/starter/make_parts.py"""
import json
import os

import numpy as np
import trimesh

HERE = os.path.dirname(os.path.abspath(__file__))
os.makedirs(os.path.join(HERE, "meshes"), exist_ok=True)

W, D, H, T = 400.0, 300.0, 200.0, 12.0           # box outside x, y, z; wall thickness
A = np.array([170.0, 100.0, 60.0])               # strut lower pivot on the right wall (box)
B = np.array([170.0, 0.0, 200.0])                # strut upper pivot under the lid (lid, closed pose)
EXT, STROKE = 300.0, 130.0                       # strut length fully extended, stroke


def box(x0, x1, y0, y1, z0, z1):
    return trimesh.creation.box(bounds=[[x0, y0, z0], [x1, y1, z1]])


def cyl_between(p, q, r):
    """Cylinder of radius r from p to q."""
    v = q - p
    c = trimesh.creation.cylinder(radius=r, height=float(np.linalg.norm(v)), sections=32)
    c.apply_transform(trimesh.geometry.align_vectors([0, 0, 1], v / np.linalg.norm(v)))
    c.apply_translation((p + q) / 2)
    return c


x0, x1, y0, y1 = -W / 2, W / 2, -D / 2, D / 2
walls = trimesh.boolean.union([box(x0, x1, y0, y1, 0, T), box(x0, x0 + T, y0, y1, 0, H), box(x1 - T, x1, y0, y1, 0, H),
                               box(x0, x1, y0, y0 + T, 0, H), box(x0, x1, y1 - T, y1, 0, H)], engine="manifold")
lid = box(x0, x1, y0, y1, H, H + T)
u = (B - A) / np.linalg.norm(B - A)
L0 = float(np.linalg.norm(B - A))
body = cyl_between(A, A + u * (EXT - STROKE - 10), 9.0)          # body from the lower pivot
rod = cyl_between(B - u * (STROKE + 20), B, 4.0)                 # rod from the upper pivot
parts = {"box": walls, "lid": lid, "strut-body": body, "strut-rod": rod}
for k, m in parts.items():
    m.export(os.path.join(HERE, "meshes", f"{k}.stl"))

spec = {
    "name": "starter",
    "groups": [{"key": "box", "label": "Box", "colour": "#c8a46e"}, {"key": "lid", "label": "Lid", "colour": "#b98a55"},
               {"key": "strut", "label": "Gas strut", "colour": "#3d4247"}],
    "parts": [
        {"id": "box", "stl": "meshes/box.stl", "group": "box", "label": "Box (12 mm ply)", "density": 0.6,
         "info": {"kind": "Fixed", "rows": [["Size", "400 x 300 x 200 mm"], ["Material", "12 mm plywood"]]}},
        {"id": "lid", "stl": "meshes/lid.stl", "group": "lid", "label": "Lid", "density": 2.08,
         "info": {"kind": "Moving: hinge", "rows": [["Hinge", "back top edge (y +150, z 200)"], ["Mass", "3 kg with fittings (density set to suit)"]]}},
        {"id": "strut-body", "stl": "meshes/strut-body.stl", "group": "strut", "label": "Strut body",
         "info": {"kind": "Gas strut", "rows": [["Length", f"{EXT:.0f} extended, {STROKE:.0f} stroke"], ["Lower pivot", str(A.tolist())]]}},
        {"id": "strut-rod", "stl": "meshes/strut-rod.stl", "group": "strut", "label": "Strut rod",
         "info": {"kind": "Gas strut", "rows": [["Upper pivot (lid)", str(B.tolist())]]}},
    ],
    "geometry": {"A": A.tolist(), "B": B.tolist(), "hinge": [0.0, D / 2, H], "ext": EXT, "stroke": STROKE, "L0": L0},
}
json.dump(spec, open(os.path.join(HERE, "parts.json"), "w"), indent=1)
print(f"closed strut length {L0:.1f} mm (min {EXT - STROKE:.0f})")

"""Make the pneumatic-slide example's parts: base plate, a 32 bore x 100 stroke cylinder, its rod, a sled on a rail and an
end stop. Writes meshes/*.stl and parts.json.  py examples/pneumatic-slide/make_parts.py"""
import json
import os

import numpy as np
import trimesh

HERE = os.path.dirname(os.path.abspath(__file__))
os.makedirs(os.path.join(HERE, "meshes"), exist_ok=True)
AXZ = 45.0                                                    # cylinder axis height


def box(x0, x1, y0, y1, z0, z1):
    return trimesh.creation.box(bounds=[[x0, y0, z0], [x1, y1, z1]])


def xcyl(r, x0, x1, y=0.0, z=AXZ):
    c = trimesh.creation.cylinder(radius=r, height=x1 - x0, sections=40)
    c.apply_transform(trimesh.transformations.rotation_matrix(np.pi / 2, [0, 1, 0]))
    c.apply_translation(((x0 + x1) / 2, y, z))
    return c


parts = {
    "base": box(-200, 200, -50, 50, 0, 10),
    "rail": box(-10, 190, -10, 10, 10, 18),
    "cylinder": trimesh.util.concatenate([xcyl(20, -180, -20), box(-190, -180, -22, 22, 10, 67), box(-20, -12, -22, 22, 10, 67)]),
    "rod": xcyl(6, -140, 0),
    "sled": box(0, 60, -30, 30, 18, 72),
    "stop": box(170, 190, -30, 30, 10, 72),
}
for k, m in parts.items():
    m.export(os.path.join(HERE, "meshes", f"{k}.stl"))
spec = {
    "name": "pneumatic-slide",
    "groups": [{"key": "frame", "label": "Base, rail, stop", "colour": "#7d858c"}, {"key": "cylinder", "label": "Cylinder", "colour": "#5f86ad"},
               {"key": "sled", "label": "Sled + rod", "colour": "#c2a54a"}],
    "parts": [
        {"id": "base", "stl": "meshes/base.stl", "group": "frame", "label": "Base plate"},
        {"id": "rail", "stl": "meshes/rail.stl", "group": "frame", "label": "Rail"},
        {"id": "stop", "stl": "meshes/stop.stl", "group": "frame", "label": "End stop",
         "info": {"rows": [["Note", "The sled reaches it at full stroke (rod 100 mm out)."]]}},
        {"id": "cylinder", "stl": "meshes/cylinder.stl", "group": "cylinder", "label": "Cylinder 32 x 100",
         "info": {"kind": "Pneumatic cylinder", "rows": [["Bore / rod / stroke", "32 / 12 / 100 mm"], ["Cushions", "15 mm, adjustable"]]}},
        {"id": "rod", "stl": "meshes/rod.stl", "group": "sled", "label": "Piston rod", "mass": 0.15, "com": [-70, 0, AXZ]},
        {"id": "sled", "stl": "meshes/sled.stl", "group": "sled", "label": "Sled (load)", "mass": 2.0, "com": [30, 0, 45],
         "info": {"kind": "Moving: rail", "rows": [["Mass", "2.0 kg"]]}},
    ],
}
json.dump(spec, open(os.path.join(HERE, "parts.json"), "w"), indent=1)
print("parts written")

"""Gripper project data from the SolidWorks export (parts_export.json, density 1.0 g/cm3 = no materials set) ->
parts.json: groups, materials (masses scaled), card rows, the test object, and the geometry the mechanism needs.
  py projects/gripper/prepare.py"""
import json
import os

import numpy as np
import trimesh

HERE = os.path.dirname(os.path.abspath(__file__))
E = json.load(open(os.path.join(HERE, "parts_export.json"), encoding="utf-8"))
AL, ST = 2.70, 7.85
# per part: (group, material, density). Jaws aluminium and pins steel as asked; the rest are assumptions (say so).
def classify(pid):
    if pid.startswith("Jaw-"):
        return "jaws", "Aluminium (as asked)", AL
    if pid.startswith("pin"):
        return "pins", "Steel (as asked)", ST
    if pid.startswith("Nut"):
        return "pins", "Steel (assumed)", ST
    if pid.startswith(("shift", "spur gear", "crank")):
        return "drive", "Steel (assumed)", ST
    if pid.startswith("Bracket"):
        return "bracket", "Aluminium (assumed)", AL
    if pid.startswith("Slider"):
        return "drive", "Aluminium (assumed)", AL
    return "links", "Aluminium (assumed)", AL


NAMES = {"shift": "Lead screw", "connctor Big": "Big connector", "connctor small": "Small connector", "Jaw Connctor": "Jaw connector",
         "spur gear_iso": "Spur gear (Toolbox)", "crank": "Crank handle"}
parts = []
for p in E["parts"]:
    g, mat, rho = classify(p["id"])
    q = dict(p, group=g)
    base = p["id"].rsplit("-", 1)[0]
    q["label"] = NAMES.get(base, base) + " (" + p["id"] + ")"
    if "mass" in q:                                                   # export density 1.0 g/cm3 -> scale
        q["mass"] = round(q["mass"] * rho, 6)
        q["inertia"] = (np.asarray(q["inertia"]) * rho).round(6).tolist()
    q["info"] = {"kind": g.capitalize(), "rows": [["Material", f"{mat}, {rho} g/cm³"], ["SolidWorks part", base + ".SLDPRT"]]}
    parts.append(q)

# test object: a cylinder along y, unit diameter (the page scales it to the set diameter), centred on the jaw notch
obj = trimesh.creation.cylinder(radius=0.5, height=36.0, sections=64)
obj.apply_transform(trimesh.transformations.rotation_matrix(np.pi / 2, [1, 0, 0]))
obj.export(os.path.join(HERE, "meshes", "test_object.stl"))
parts.append(dict(id="test-object", stl="meshes/test_object.stl", group="object", label="Test object (cylinder)", colour="#d0452f",
                  info={"kind": "Test load", "rows": [["What", "A round part between the jaws. Set its diameter and stiffness in Settings (0 = no object)."]]}))

# jaw inner profile (upper jaw, closed pose): the notch and tip edge the object can touch, in the (x, z) plane
jm = trimesh.load(os.path.join(HERE, "meshes", "Jaw-1.stl"), force="mesh")
pts, fi = trimesh.sample.sample_surface_even(jm, 60000, seed=1)
inner = (jm.face_normals[fi][:, 2] < -0.3) & (pts[:, 0] > 180) & (pts[:, 2] < 17.0)   # faces looking at the other jaw
prof = np.unique(np.round(pts[inner][:, [0, 2]], 1), axis=0)
prof = prof[np.lexsort((prof[:, 1], np.round(prof[:, 0] * 2)))]
keep = np.r_[True, np.any(np.abs(np.diff(prof, axis=0)) > 0.4, axis=1)]   # thin to ~0.5 mm spacing
prof = prof[keep]
geometry = dict(pitch=3.0, gearCentre=[-50.42, 13.81], gearTeeth=12, object=[218.0, 0.0], tip=[270.0, 0.8],
                profile=prof.tolist(), travel=[0.0, 30.0])
groups = [{"key": "jaws", "label": "Jaws", "colour": "#c2a54a"}, {"key": "links", "label": "Links", "colour": "#5f86ad"},
          {"key": "drive", "label": "Slider, screw, gear", "colour": "#3d4247"}, {"key": "pins", "label": "Pins + nuts", "colour": "#9aa3ab"},
          {"key": "bracket", "label": "Bracket", "colour": "#4f8a5b", "mode": "solid"}, {"key": "object", "label": "Test object", "colour": "#d0452f"}]
json.dump(dict(name="gripper", groups=groups, parts=parts, geometry=geometry), open(os.path.join(HERE, "parts.json"), "w", encoding="utf-8"), indent=1)
m = {g["key"]: round(sum(p.get("mass", 0) for p in parts if p["group"] == g["key"]) * 1000, 1) for g in groups}
print(f"{len(parts)} parts; profile {len(prof)} points; masses g: {m}")

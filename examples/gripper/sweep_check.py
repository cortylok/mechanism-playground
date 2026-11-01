"""Sweep the gripper over slider travel: exact overlap (mm^3) of each moving link / jaw / slider with the bracket and
with the other moving parts (pins and nuts left out: they sit in their holes). Poses from linkage.js via node.
  py projects/gripper/sweep_check.py"""
import json
import os
import subprocess

import numpy as np
import trimesh

HERE = os.path.dirname(os.path.abspath(__file__))
xs = [round(-3 + 0.5 * i, 2) for i in range(87)]                    # -3 .. 40
js = f"""const L2=require({json.dumps(os.path.join(HERE, '..', '..', 'physics', 'modules', 'linkage2d.js'))});
const G=require({json.dumps(os.path.join(HERE, 'linkage.js'))})(L2);
const t=G.solver.table({json.dumps(xs)}); console.log(JSON.stringify(t.map(r=>({{ok:r.ok,b:r.bodies}}))));"""
T = json.loads(subprocess.run(["node", "-e", js], capture_output=True, text=True, check=True).stdout)
BODY = {"Slider-1": "slider", "connctor small-1": "smallU", "Jaw Connctor-1": "jcU", "connctor Big-2": "bigU", "Jaw-1": "jawU",
        "connctor small-2": "smallL", "Jaw Connctor-2": "jcL", "connctor Big-3": "bigL", "Jaw-2": "jawL"}
M = {k: trimesh.load(os.path.join(HERE, "meshes", f"{k.replace(' ', '_')}.stl"), force="mesh") for k in list(BODY) + ["Bracket-1"]}
ADJ = {("Slider-1", "connctor small-1"), ("Slider-1", "connctor small-2"), ("connctor small-1", "Jaw Connctor-1"), ("connctor small-2", "Jaw Connctor-2"),
       ("Jaw Connctor-1", "Jaw-1"), ("Jaw Connctor-2", "Jaw-2"), ("connctor Big-2", "Jaw-1"), ("connctor Big-3", "Jaw-2"),
       ("Bracket-1", "Jaw Connctor-1"), ("Bracket-1", "Jaw Connctor-2"), ("Bracket-1", "connctor Big-2"), ("Bracket-1", "connctor Big-3")}


def posed(k, r):
    if k == "Bracket-1":
        return M[k]
    b = r["b"][BODY[k]]
    a, dx, dz = b["ang"], b["dx"] if "dx" in b else b["dy"], b["dz"]
    c, s = np.cos(a), np.sin(a)
    T4 = np.array([[c, 0, -s, dx], [0, 1, 0, 0], [s, 0, c, dz], [0, 0, 0, 1]])   # 2D (x, z) rotation + shift
    return M[k].copy().apply_transform(T4)


names = list(M)
for x, r in zip(xs, T):
    if not r["ok"]:
        print(f"x {x:5.1f}: linkage does not close")
        break
    P = {k: posed(k, r) for k in names}
    hits = []
    for i, a in enumerate(names):
        for b in names[i + 1:]:
            if (a, b) in ADJ or (b, a) in ADJ:
                continue
            if not (np.all(P[a].bounds[0] <= P[b].bounds[1]) and np.all(P[b].bounds[0] <= P[a].bounds[1])):
                continue
            v = trimesh.boolean.intersection([P[a], P[b]], engine="manifold").volume
            if v > 0.5:
                hits.append(f"{a} x {b}: {v:.1f}")
    if hits or x in (-3, -1, 0, 10, 20, 30, 40):
        print(f"x {x:5.1f}: " + ("; ".join(hits) if hits else "clear"))

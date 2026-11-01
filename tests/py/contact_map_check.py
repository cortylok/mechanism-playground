"""py tests/py/contact_map_check.py - depth map of a generated V-groove block vs the analytic surface."""
import os
import sys

import numpy as np
import trimesh

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "build"))
import contact_map as CM  # noqa: E402

# block x -5..5, z 0..20, top y 0 with a 45 deg V-groove 3 deep along z
prof = [(-5, -6), (5, -6), (5, 0), (3, 0), (0, -3), (-3, 0), (-5, 0)]
poly = trimesh.path.polygons.Polygon(prof)
m = trimesh.creation.extrude_polygon(poly, 20.0)                    # profile in (x, y), extruded along z 0..20
xs, zs, depth, wall = CM.depth_map(m, (-4, 4), (1, 19), 0.05, axis="y", top=0.0)
fails = 0
for x in (-2.0, 0.0, 1.5):
    j = int(round((x + 4) / 0.05))
    want = max(0.0, 3 - abs(x))
    got = float(depth[100, j])
    ok = abs(got - want) <= 0.05 + 1e-9
    fails += not ok
    print(f"{'PASS' if ok else 'FAIL'}  depth at x {x:+.1f}: {got:.4f} (analytic {want:.4f})")
xs, zs, d2, _ = CM.depth_map(m, (-4, 4), (1, 19), 0.05, axis="y", top=0.0, tip_r=0.5)
ok = d2[100, 80] < depth[100, 80] - 0.2                               # a 0.5 ball cannot reach the sharp V bottom
fails += not ok
print(f"{'PASS' if ok else 'FAIL'}  ball tip r 0.5 sits higher in the V: {d2[100, 80]:.3f} < {depth[100, 80]:.3f}")
enc = CM.encode(xs, zs, d2, np.zeros_like(d2, bool), 0.05, 45)
print("PASS  encode" if enc["nx"] == len(xs) and enc["data_b64"] else "FAIL  encode")
sys.exit(1 if fails else 0)

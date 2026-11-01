"""py tests/py/holes_check.py - tools/holes.py finds a D6 hole in a generated 40 x 40 x 8 plate."""
import os
import sys

import numpy as np
import trimesh

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "tools"))
import holes  # noqa: E402

plate = trimesh.creation.box(extents=[40, 40, 8])
hole = trimesh.creation.cylinder(radius=3.0, height=20, sections=96)
hole.apply_translation((5, -4, 0))
t = plate.difference(hole, engine="manifold")
H = [h for h in holes.find(t, 2) if h["hole"]]
ok = len(H) == 1 and abs(2 * H[0]["r"] - 6.0) <= 0.05 and np.allclose(H[0]["c"], (5, -4), atol=0.05)
print(("PASS" if ok else "FAIL") + f"  holes.py finds the D6 hole: {[(round(2 * h['r'], 3), np.round(h['c'], 2).tolist()) for h in H]}")
sys.exit(0 if ok else 1)

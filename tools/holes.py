"""Find round holes, bosses and countersinks in a triangle mesh, for one axis (0 x, 1 y, 2 z).
A cylinder wall = a connected strip of faces whose normals are square to the axis and turn smoothly; a circle fit of
its vertices gives the centre, radius and axial extent. Hole = the normals point at the centre (concave).
A countersink = a strip of faces at ~45 deg to the axis round a hole centre (90 deg cone).
   py tools/holes.py part.stl [more.stl ...]      prints what it finds on all three axes"""
import numpy as np
import trimesh
from trimesh.graph import connected_components


def _circle(P):
    """Least-squares circle through 2D points: centre, radius, rms."""
    A = np.c_[2 * P, np.ones(len(P))]
    b = (P ** 2).sum(1)
    s, *_ = np.linalg.lstsq(A, b, rcond=None)
    c = s[:2]
    r = np.sqrt(max(s[2] + c @ c, 0.0))
    return c, r, float(np.sqrt(np.mean((np.linalg.norm(P - c, axis=1) - r) ** 2)))


def strips(t, axis, cos_lo, cos_hi, max_turn=35.0):
    """Connected face strips whose |n . axis| is in [cos_lo, cos_hi] and that turn < max_turn deg per edge."""
    n = t.face_normals
    a = np.abs(n[:, axis])
    ok = (a >= cos_lo) & (a <= cos_hi)
    adj = t.face_adjacency
    keep = ok[adj[:, 0]] & ok[adj[:, 1]] & (np.degrees(t.face_adjacency_angles) < max_turn)
    return [c for c in connected_components(adj[keep], nodes=np.where(ok)[0], min_len=3)]


def find(t, axis, rmin=0.4, rmax=15.0, rms_max=0.03, min_arc=200.0):
    """Cylinders along `axis`: list of dict(c=(u, v), r, lo, hi, hole, arc). (u, v) = the other two axes in order."""
    other = [i for i in range(3) if i != axis]
    out = []
    for comp in strips(t, axis, 0.0, 0.02):
        f = t.faces[comp]
        V = t.vertices[np.unique(f)]
        P = V[:, other]
        if len(P) < 6:
            continue
        c, r, rms = _circle(P)
        if not (rmin <= r <= rmax) or rms > rms_max:
            continue
        ang = np.sort(np.degrees(np.arctan2(*(P - c).T[::-1])))
        gaps = np.diff(np.r_[ang, ang[0] + 360.0])
        arc = 360.0 - gaps.max()
        if arc < min_arc:
            continue
        cen = t.triangles_center[comp][:, other]
        nn = t.face_normals[comp][:, other]
        hole = float(np.mean(np.einsum("ij,ij->i", nn, c - cen))) > 0
        out.append(dict(c=c, r=r, lo=float(V[:, axis].min()), hi=float(V[:, axis].max()), hole=hole, arc=arc))
    return out


def cones(t, axis, half_angle=45.0, tol=8.0):
    """Cone strips (countersinks / chamfers) about `axis`: dict(c, r_lo, r_hi, at_lo, at_hi, hole)."""
    other = [i for i in range(3) if i != axis]
    cmid = np.cos(np.radians(90.0 - half_angle))
    lo_, hi_ = np.cos(np.radians(90.0 - half_angle + tol)), np.cos(np.radians(90.0 - half_angle - tol))
    out = []
    for comp in strips(t, axis, min(lo_, hi_), max(lo_, hi_)):
        V = t.vertices[np.unique(t.faces[comp])]
        if len(V) < 6:
            continue
        # cone apex line: fit circles to the top and bottom rims
        z = V[:, axis]
        top, bot = V[z > z.max() - 1e-3], V[z < z.min() + 1e-3]
        if len(top) < 3 or len(bot) < 3:
            continue
        c1, r1, e1 = _circle(top[:, other])
        c2, r2, e2 = _circle(bot[:, other])
        if max(e1, e2) > 0.05 or np.linalg.norm(c1 - c2) > 0.05:
            continue
        cen = t.triangles_center[comp][:, other]
        nn = t.face_normals[comp][:, other]
        hole = float(np.mean(np.einsum("ij,ij->i", nn, c1 - cen))) > 0
        out.append(dict(c=(c1 + c2) / 2, r_lo=r2, r_hi=r1, at_lo=float(z.min()), at_hi=float(z.max()), hole=hole))
    _ = cmid
    return out


def near(lst, c, tol=0.15):
    return [h for h in lst if np.linalg.norm(np.asarray(h["c"]) - np.asarray(c)) < tol]


if __name__ == "__main__":
    import sys
    for n in sys.argv[1:]:
        t = trimesh.load(n, force="mesh")
        t.merge_vertices()
        print(f"== {n}  bounds {np.round(t.bounds, 2).tolist()}")
        for ax in range(3):
            H, C = find(t, ax), cones(t, ax)
            if not H and not C:
                continue
            print(f"  axis {'xyz'[ax]}:")
            for h in sorted(H, key=lambda h: (round(h["c"][0], 1), round(h["c"][1], 1), h["lo"])):
                kind = "hole" if h["hole"] else "boss"
                print(f"    {kind} D{2 * h['r']:.3f} at {np.round(h['c'], 2).tolist()} {'xyz'[ax]} {h['lo']:.2f}..{h['hi']:.2f} arc {h['arc']:.0f}")
            for h in C:
                kind = "hole" if h["hole"] else "boss"
                print(f"    cone D{2 * h['r_lo']:.2f}->D{2 * h['r_hi']:.2f} at {np.round(h['c'], 2).tolist()} {'xyz'[ax]} {h['at_lo']:.2f}..{h['at_hi']:.2f} {kind}")

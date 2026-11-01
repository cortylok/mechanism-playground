// Mechanism playground - effective mass and gravity force for one DOF, from part mass properties and the pose function
// (virtual work, numeric derivatives). No DOM.
//   M(q) = sum( m |dc/dq|^2 + w^T I_world w )      c = part centre of mass, w = angular rate per unit q
//   Q(q) = -sum( m g dc_z/dq )                       gravity along -z
// For a "deg" DOF the derivatives are taken per radian, so M is kg*mm^2 and Q is N*mm - the units the core expects.
// parts: [{ id, mass (kg), com [x,y,z] mm (CAD frame), inertia 3x3 kg*mm^2 about the com (CAD axes) }]
// pose(q) -> { partId: 4x4 column-major } for the full DOF vector q (parts it leaves out do not move: they add nothing)
(function (root) {
  const MAT4 = typeof module !== "undefined" && module.exports ? require("./mat4.js") : root.MAT4;
  const R3 = (m) => [[m[0], m[4], m[8]], [m[1], m[5], m[9]], [m[2], m[6], m[10]]];
  const DEG = 180 / Math.PI;
  function build({ parts, pose, dof = 0, q0, grid, unit = "mm", g = 9.81 }) {
    const per = unit === "deg" ? DEG : 1, h = unit === "deg" ? 1e-3 : 1e-3;
    const M = [], Q = [];
    for (const u of grid) {
      const qa = q0.slice(), qb = q0.slice(), qc = q0.slice(); qa[dof] = u - h; qb[dof] = u + h; qc[dof] = u;
      const Pa = pose(qa), Pb = pose(qb), Pc = pose(qc);
      let m = 0, f = 0;
      for (const p of parts) {
        if (!(p.mass > 0) || !p.com || !Pc[p.id]) continue;
        const ca = MAT4.apply(Pa[p.id], p.com), cb = MAT4.apply(Pb[p.id], p.com);
        const dc = [0, 1, 2].map((k) => ((cb[k] - ca[k]) / (2 * h)) * per);
        m += p.mass * (dc[0] ** 2 + dc[1] ** 2 + dc[2] ** 2);
        f += -p.mass * g * dc[2];
        if (p.inertia) {
          const Ra = R3(Pa[p.id]), Rb = R3(Pb[p.id]), Rc = R3(Pc[p.id]);
          // W = dR/dq R^T (skew): w = (W32, W13, W21)
          const W = [0, 1, 2].map((i) => [0, 1, 2].map((j) => { let s = 0; for (let k = 0; k < 3; k++) s += ((Rb[i][k] - Ra[i][k]) / (2 * h)) * Rc[j][k]; return s * per; }));
          const w = [(W[2][1] - W[1][2]) / 2, (W[0][2] - W[2][0]) / 2, (W[1][0] - W[0][1]) / 2];
          // I_world = R I R^T
          const RI = [0, 1, 2].map((i) => [0, 1, 2].map((j) => { let s = 0; for (let k = 0; k < 3; k++) s += Rc[i][k] * p.inertia[k][j]; return s; }));
          const Iw = [0, 1, 2].map((i) => [0, 1, 2].map((j) => { let s = 0; for (let k = 0; k < 3; k++) s += RI[i][k] * Rc[j][k]; return s; }));
          for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) m += w[i] * Iw[i][j] * w[j];
        }
      }
      M.push(m); Q.push(f);
    }
    function at(u) {
      const n = grid.length;
      if (u <= grid[0]) return { M: M[0], Q: Q[0] };
      if (u >= grid[n - 1]) return { M: M[n - 1], Q: Q[n - 1] };
      let lo = 0, hi = n - 1;
      while (hi - lo > 1) { const k = (lo + hi) >> 1; if (grid[k] <= u) lo = k; else hi = k; }
      const t = (u - grid[lo]) / (grid[hi] - grid[lo]);
      return { M: M[lo] + (M[hi] - M[lo]) * t, Q: Q[lo] + (Q[hi] - Q[lo]) * t };
    }
    return { grid, M, Q, at };
  }
  const MASSTABLE = { build };
  if (typeof module !== "undefined" && module.exports) module.exports = MASSTABLE; else root.MASSTABLE = MASSTABLE;
})(typeof window !== "undefined" ? window : globalThis);

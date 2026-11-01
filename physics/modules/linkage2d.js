// Mechanism playground - planar linkage solver (no DOM).
// Rigid bodies in one plane carry named pins. A pin name shared by two bodies (or a body and the ground) is a revolute
// joint. Sliders keep a body's pin on a line with the body's angle fixed. One driver body is turned about a pivot
// ("angle", deg) or pushed along a direction ("slide", mm). Newton loop closure in full coordinates (y, z, angle per
// body), starting from the previous pose, so a table follows one assembly branch.
// Output per body: ang (rad) and (dy, dz) with  p = R(ang) * p0 + (dy, dz)  for any point p0 of the body in the
// starting pose - the same form as the page's pose tables.
(function (root) {
  const D2R = Math.PI / 180;

  function gauss(A, b) {                                              // dense solve with partial pivoting; null if singular
    const n = b.length, M = A.map((r, i) => r.concat([b[i]]));
    for (let c = 0; c < n; c++) {
      let p = c; for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
      if (Math.abs(M[p][c]) < 1e-14) return null;
      [M[c], M[p]] = [M[p], M[c]];
      for (let r = c + 1; r < n; r++) { const f = M[r][c] / M[c][c]; if (f) for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k]; }
    }
    const x = new Array(n).fill(0);
    for (let r = n - 1; r >= 0; r--) { let s = M[r][n]; for (let k = r + 1; k < n; k++) s -= M[r][k] * x[k]; x[r] = s / M[r][r]; }
    return x;
  }

  function create({ bodies, ground = {}, driver, sliders = [] }) {
    const names = Object.keys(bodies), drv = driver.body, kind = driver.kind || "angle";
    const B = {};
    for (const nm of names) {                                         // local pin coordinates about a reference point
      const pins = bodies[nm].pins, keys = Object.keys(pins);
      const ref = nm === drv && kind === "angle" ? (pins[driver.pivot] || ground[driver.pivot]) : pins[keys[0]];
      B[nm] = { ref: ref.slice(), local: Object.fromEntries(keys.map((k) => [k, [pins[k][0] - ref[0], pins[k][1] - ref[1]]])) };
    }
    const free = names.filter((nm) => nm !== drv), idx = Object.fromEntries(free.map((nm, i) => [nm, 3 * i]));
    const dirN = driver.dir ? (() => { const l = Math.hypot(...driver.dir); return [driver.dir[0] / l, driver.dir[1] / l]; })() : null;
    // joints: every pin held by two or more (bodies | ground)
    const holders = {};
    for (const nm of names) for (const k of Object.keys(B[nm].local)) (holders[k] = holders[k] || []).push(nm);
    for (const k of Object.keys(ground)) (holders[k] = holders[k] || []).push("@ground");
    const joints = [];
    for (const [k, hs] of Object.entries(holders)) for (let j = 1; j < hs.length; j++) {
      const a = hs[0], b = hs[j];
      const known = (h) => h === "@ground" || h === drv;
      if (known(a) && known(b)) continue;
      joints.push({ pin: k, a, b });
    }
    const nEq = 2 * joints.length + 2 * sliders.length, nX = 3 * free.length;

    function drvPose(u) {                                             // driver body (angle, pos)
      if (kind === "slide") return { th: 0, y: B[drv].ref[0] + dirN[0] * u, z: B[drv].ref[1] + dirN[1] * u };
      return { th: u * D2R, y: B[drv].ref[0], z: B[drv].ref[1] };
    }
    function poseOf(nm, x, dp) {
      if (nm === drv) return dp;
      const i = idx[nm]; return { th: x[i + 2], y: x[i], z: x[i + 1] };
    }
    function world(nm, k, x, dp) {
      if (nm === "@ground") return ground[k];
      const p = poseOf(nm, x, dp), l = B[nm].local[k], c = Math.cos(p.th), s = Math.sin(p.th);
      return [c * l[0] - s * l[1] + p.y, s * l[0] + c * l[1] + p.z];
    }
    function dWorld(nm, k, x) {                                       // d(world)/d(y, z, th) for a free body
      const th = x[idx[nm] + 2], l = B[nm].local[k], c = Math.cos(th), s = Math.sin(th);
      return [[1, 0, -s * l[0] - c * l[1]], [0, 1, c * l[0] - s * l[1]]];
    }
    function system(x, dp) {
      const f = [], J = [];
      const row = () => new Array(nX).fill(0);
      for (const jt of joints) {
        const pa = world(jt.a, jt.pin, x, dp), pb = world(jt.b, jt.pin, x, dp);
        const r0 = row(), r1 = row();
        for (const [h, sg] of [[jt.a, 1], [jt.b, -1]]) {
          if (h === "@ground" || h === drv) continue;
          const d = dWorld(h, jt.pin, x), i = idx[h];
          for (let q = 0; q < 3; q++) { r0[i + q] += sg * d[0][q]; r1[i + q] += sg * d[1][q]; }
        }
        f.push(pa[0] - pb[0], pa[1] - pb[1]); J.push(r0, r1);
      }
      for (const sl of sliders) {                                     // pin on the line, angle held
        const l = Math.hypot(...sl.line.dir), u = [sl.line.dir[0] / l, sl.line.dir[1] / l];
        const p = world(sl.body, sl.pin, x, dp), i = idx[sl.body], d = dWorld(sl.body, sl.pin, x);
        const r0 = row(), r1 = row();
        for (let q = 0; q < 3; q++) r0[i + q] = u[0] * d[1][q] - u[1] * d[0][q];
        r1[i + 2] = 1;
        f.push(u[0] * (p[1] - sl.line.p[1]) - u[1] * (p[0] - sl.line.p[0]), x[i + 2] - (sl.angle || 0));
        J.push(r0, r1);
      }
      return { f, J };
    }
    function newton(x0, dp) {
      const x = x0.slice();
      for (let it = 0; it < 50; it++) {
        const { f, J } = system(x, dp);
        const err = Math.max(0, ...f.map(Math.abs));
        if (err < 1e-11) return { ok: true, x };
        let dx;
        if (nEq === nX) dx = gauss(J, f.map((v) => -v));
        else {                                                        // over/under-determined: normal equations
          const JT = J[0].map((_, c) => J.map((r) => r[c]));
          dx = gauss(JT.map((r) => JT.map((r2) => r.reduce((a, v, i) => a + v * r2[i], 0) + 1e-12)), JT.map((r) => -r.reduce((a, v, i) => a + v * f[i], 0)));
        }
        if (!dx || dx.some((v) => !Number.isFinite(v))) return { ok: false, x: x0 };
        let sc = 1;                                                    // limit turning per step (stay on the branch)
        for (let i = 2; i < nX; i += 3) if (Math.abs(dx[i]) * sc > 0.5) sc = 0.5 / Math.abs(dx[i]);
        for (let i = 0; i < nX; i++) x[i] += sc * dx[i];
      }
      return { ok: false, x: x0 };
    }
    const start = [];
    for (const nm of free) start.push(B[nm].ref[0], B[nm].ref[1], 0);
    let last = start;
    function result(x, dp, ok) {
      const pins = {}, out = {};
      for (const [k, hs] of Object.entries(holders)) pins[k] = world(hs[0], k, x, dp);
      for (const nm of names) {
        const p = poseOf(nm, x, dp), c = Math.cos(p.th), s = Math.sin(p.th), r = B[nm].ref;
        out[nm] = { ang: p.th, dy: p.y - (c * r[0] - s * r[1]), dz: p.z - (s * r[0] + c * r[1]) };
      }
      return { ok, pins, bodies: out };
    }
    function solve(u, guess) {
      const dp = drvPose(u), r = newton(guess || last, dp);
      if (r.ok) last = r.x;
      return result(r.ok ? r.x : guess || last, dp, r.ok);
    }
    function table(us) { last = start; return us.map((u) => solve(u)); }
    return { solve, table, joints, nEq, nX };
  }

  const LINKAGE2D = { create };
  if (typeof module !== "undefined" && module.exports) module.exports = LINKAGE2D; else root.LINKAGE2D = LINKAGE2D;
})(typeof window !== "undefined" ? window : globalThis);

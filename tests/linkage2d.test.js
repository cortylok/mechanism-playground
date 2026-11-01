// node tests/linkage2d.test.js - planar linkage solver vs analytic cases and the S3 golden poses
const L2 = require("../physics/modules/linkage2d.js");
const { check, done } = require("./_lib.js");
const G = require("./data/s3_golden_poses.json");
const D2R = Math.PI / 180, dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

// 1 S3 door linkage (multi-loop, 6 moving bodies) against the private solver's poses
const pin = (k) => G.pins0[k];
const bodies = {};
for (const [name, ps] of Object.entries(G.bodies)) bodies[name] = { pins: Object.fromEntries(ps.map((k) => [k, pin(k)])) };
const ground = Object.fromEntries(G.ground.map((k) => [k, pin(k)]));
const s3 = L2.create({ bodies, ground, driver: { body: "lower", pivot: "W3" } });
const tab = s3.table(G.phi);
let worst = 0, okAll = true, where = "";
tab.forEach((r, i) => {
  okAll = okAll && r.ok;
  for (const k of Object.keys(G.pins)) { const e = dist(r.pins[k], G.pins[k][i]); if (e > worst) { worst = e; where = `${k} at phi ${G.phi[i]}`; } }
});
check("S3 golden poses: every pin within 0.01 mm", okAll && worst <= 0.01, `${tab.length} steps, worst ${worst.toExponential(2)} mm (${where})`);
// body transforms reproduce the pins: p = R(ang) p0 + (dy, dz)
const r40 = tab[160], b = r40.bodies.inner, c = Math.cos(b.ang), s = Math.sin(b.ang), p0 = pin("D");
const pD = [c * p0[0] - s * p0[1] + b.dy, s * p0[0] + c * p0[1] + b.dz];
check("body transform (ang, dy, dz) carries pins", dist(pD, r40.pins.D) < 1e-9, `phi ${G.phi[160]}: ${dist(pD, r40.pins.D).toExponential(1)} mm`);

// 2 four-bar crank-rocker: ground A(0,0) D(4,0), crank 1, coupler 3, rocker 3; crank starts at 90 deg
const circ = (P, r1, Q, r2, up) => { const d = dist(P, Q), a = (r1 * r1 - r2 * r2 + d * d) / (2 * d), h = Math.sqrt(r1 * r1 - a * a);
  const ex = [(Q[0] - P[0]) / d, (Q[1] - P[1]) / d], m = [P[0] + a * ex[0], P[1] + a * ex[1]], sg = up ? 1 : -1;
  return [m[0] - sg * h * ex[1], m[1] + sg * h * ex[0]]; };
const B0 = [0, 1], C0 = circ(B0, 3, [4, 0], 3, true);
const fb = L2.create({ bodies: { crank: { pins: { A: [0, 0], B: B0 } }, coupler: { pins: { B: B0, C: C0 } }, rocker: { pins: { C: C0, D: [4, 0] } } },
  ground: { A: [0, 0], D: [4, 0] }, driver: { body: "crank", pivot: "A" } });
let wf = 0;
fb.table(Array.from({ length: 73 }, (_, i) => -i * 5)).forEach((r, i) => {
  const th = (90 - i * 5) * D2R, B = [Math.cos(th), Math.sin(th)], C = circ(B, 3, [4, 0], 3, true);
  wf = Math.max(wf, dist(r.pins.C, C) + (r.ok ? 0 : 1));
});
check("four-bar: coupler point = analytic over a full crank turn", wf < 1e-8, `worst ${wf.toExponential(2)}`);

// 3 slider-crank: crank 1 about (0,0), rod 3, slider on the y axis line z = 0 -> y = cos t + sqrt(9 - sin^2 t)
const sc = L2.create({ bodies: { crank: { pins: { A: [0, 0], B: [1, 0] } }, rod: { pins: { B: [1, 0], C: [4, 0] } }, slider: { pins: { C: [4, 0] } } },
  ground: { A: [0, 0] }, driver: { body: "crank", pivot: "A" }, sliders: [{ body: "slider", pin: "C", line: { p: [0, 0], dir: [1, 0] } }] });
let ws = 0;
sc.table(Array.from({ length: 37 }, (_, i) => i * 10)).forEach((r, i) => {
  const t = i * 10 * D2R; ws = Math.max(ws, Math.abs(r.pins.C[0] - (Math.cos(t) + Math.sqrt(9 - Math.sin(t) ** 2))) + Math.abs(r.pins.C[1]) + (r.ok ? 0 : 1));
});
check("slider-crank: slider position = analytic", ws < 1e-8, `worst ${ws.toExponential(2)}`);

// 4 slide driver: a body pushed along a line (like a carriage) pulls a link
const sd = L2.create({ bodies: { cart: { pins: { P: [0, 0] } }, link: { pins: { P: [0, 0], Q: [3, 4] } }, slider: { pins: { Q: [3, 4] } } },
  ground: {}, driver: { body: "cart", kind: "slide", dir: [1, 0] }, sliders: [{ body: "slider", pin: "Q", line: { p: [0, 4], dir: [0, 1] } }] });
const rs = sd.solve(-2);
check("slide driver: rigid link length kept", rs.ok && Math.abs(dist(rs.pins.P, rs.pins.Q) - 5) < 1e-9 && Math.abs(rs.pins.P[0] + 2) < 1e-12, `Q ${rs.pins.Q.map((v) => v.toFixed(4))}`);

// 5 impossible pose: drive the rocker far past its range -> ok false, no throw
const rk = L2.create({ bodies: { rocker: { pins: { D: [4, 0], C: C0 } }, coupler: { pins: { B: B0, C: C0 } }, crank: { pins: { A: [0, 0], B: B0 } } },
  ground: { A: [0, 0], D: [4, 0] }, driver: { body: "rocker", pivot: "D" } });
let res = null, threw = false; try { res = rk.solve(150); } catch (e) { threw = true; }
check("impossible pose returns ok false (no throw)", !threw && res && res.ok === false, `ok ${res && res.ok}`);
done();

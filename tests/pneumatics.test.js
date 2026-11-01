// node tests/pneumatics.test.js - ISO 6358 flow, cylinder force, chamber fill, range guard
const PN = require("../physics/modules/pneumatics.js");
const { check, near, done } = require("./_lib.js");
const bar = 1e5, PATM = PN.PATM;

// choked: C 1 dm3/(s bar), p1 6 bar(g), p2 0 bar(g), b 0.3 -> qm = 1e-8 * 701325 * 1.185 = 8.3107e-3 kg/s
const q1 = PN.flow(1, 0.3, 6 * bar + PATM, PATM);
check("choked flow = ISO 6358", near(q1, 8.3107e-3, 0.01), q1.toExponential(4));
// subsonic: pr 0.7, b 0.3 -> psi = sqrt(1 - (0.4/0.7)^2) = 0.82065
const p1 = 6 * bar + PATM, q2 = PN.flow(1, 0.3, p1, 0.7 * p1);
check("subsonic flow = ISO 6358", near(q2, 1e-8 * p1 * 1.185 * 0.82065, 0.01), q2.toExponential(4));
check("reverse flow is negative", PN.flow(1, 0.3, PATM, p1) < 0 && near(-PN.flow(1, 0.3, PATM, p1), q1, 1e-9), "");
const s = PN.series([{ C: 1, b: 0.3 }, { C: 1, b: 0.3 }]);
check("two equal elements in series: C / 2^(1/3)", near(s.C, 1 / Math.cbrt(2), 1e-9), `C ${s.C.toFixed(4)} b ${s.b.toFixed(3)}`);

// static force: cap 6 bar(g), rod side 0 bar(g), bore 32, rod 12 -> 0.6 MPa * pi * 16^2 = 482.5 N
const sys = PN.system({ supply: 6, valve: { type: "5/2", C: 1, b: 0.3 }, cyl: { bore: 32, rod: 12, stroke: 100 } });
sys.st.pA = 6 * bar + PATM; sys.st.pB = PATM;
check("static force on the rod", near(sys.force(), 482.5, 0.01), sys.force().toFixed(1) + " N");
sys.st.pA = PATM; sys.st.pB = 6 * bar + PATM;
check("retract force uses the annulus", near(sys.force(), -0.6 * Math.PI * (16 * 16 - 6 * 6), 0.01), sys.force().toFixed(1) + " N");

// fill 0.1 L from 0 to 5 bar(g), choked all the way (b 0.9), n = 1: t = V dp / (R T qm) = 0.07148 s
const f = PN.system({ supply: 6, n: 1, valve: { type: "5/2", C: 1, b: 0.9 }, cyl: { bore: 32, rod: 12, stroke: 100, deadA: 1e5, deadB: 1e5 } });
f.st.pA = PATM; f.setValve(true);
let t = 0; const dt = 1e-5;
while (f.st.pA < 5 * bar + PATM && t < 1) { f.step(0, 0, dt); t += dt; }
check("chamber fill time = analytic (isothermal, choked)", near(t, 0.07148, 0.01), t.toFixed(5) + " s (0.07148)");
check("fill never passes supply", (() => { for (let i = 0; i < 20000; i++) f.step(0, 0, 1e-4); return f.st.pA <= 6 * bar + PATM + 1; })(), (f.st.pA / bar - 1.01325).toFixed(4) + " bar(g)");

// range guard: a forced impossible state throws PneumaticRangeError
const g = PN.system({ supply: 6, valve: { type: "5/2", C: 1, b: 0.3 }, cyl: { bore: 32, rod: 12, stroke: 100 } });
g.st.pB = -5;
let threw = null; try { g.step(50, 0, 1e-4); } catch (e) { threw = e; }
check("range guard throws on negative absolute pressure", threw && threw.name === "PneumaticRangeError", threw && threw.message);
done();

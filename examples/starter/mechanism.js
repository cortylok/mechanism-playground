// Starter example: a lid on a gas strut. One DOF: the lid angle (deg, 0 = shut, + = open) about the hinge on the box's
// back top edge. Forces: lid weight (from the packed mass properties), the gas strut, hinge friction, the hand.
// This file is the body of a function: it gets CORE, SPRINGS, PNEUMATICS, LINKAGE2D, CONTACT, MAT4, MASSTABLE, BUNDLE,
// DATA (the packed parts + parts.json extras) and CONFIG, and must return the mechanism object.
const G = DATA.geometry, D2R = Math.PI / 180;
const AXIS = [-1, 0, 0];                                     // + angle lifts the front edge
const lidPose = (deg) => MAT4.rotateAbout(AXIS, G.hinge, deg * D2R);
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const strutTop = (deg) => MAT4.apply(lidPose(deg), G.B);
const strutLen = (deg) => Math.hypot(...sub(strutTop(deg), G.A));
const dLen = (deg) => (strutLen(deg + 1e-3) - strutLen(deg - 1e-3)) / 2e-3;   // mm per deg

function poseOf(deg) {
  const b = strutTop(deg), d0 = sub(G.B, G.A), d1 = sub(b, G.A);
  const phi = Math.atan2(d1[2], d1[1]) - Math.atan2(d0[2], d0[1]);           // the strut turns in its x plane
  return {
    lid: lidPose(deg),
    "strut-body": MAT4.rotateAbout([1, 0, 0], G.A, phi),
    "strut-rod": MAT4.mul(MAT4.translate(sub(b, G.B)), MAT4.rotateAbout([1, 0, 0], G.B, phi)),
  };
}
const grid = Array.from({ length: 96 }, (_, i) => i);
const table = MASSTABLE.build({ parts: DATA.parts, pose: (q) => poseOf(q[0]), dof: 0, q0: [0], grid, unit: "deg" });
const design = { F1: 27, prog: 1.3, damp: 60, hinge: 100 };
let strut = null, strutKey = "";
const mkStrut = (P) => { strut = SPRINGS.gasStrut({ ext: G.ext, stroke: G.stroke, F1: P.F1, prog: P.prog, damp: P.damp, dampedFrac: 1 }); strutKey = [P.F1, P.prog, P.damp].join(); };
const strutTorque = (deg, w, P) => { if ([P.F1, P.prog, P.damp].join() !== strutKey) mkStrut(P);
  const k = dLen(deg); return strut.force(strutLen(deg), k * w) * k / D2R; };   // N*mm per rad

return {
  dofs: [{ key: "lid", label: "Lid angle", unit: "deg", min: 0, max: 95, q0: 0 }],
  design,
  mass: (q) => [table.at(q[0]).M],
  forces: (q, v, t, sim) => [table.at(q[0]).Q + strutTorque(q[0], v[0], sim.P)],
  friction: (q, v, sim) => [sim.P.hinge],
  grab: { dof: 0, k: 400, c: 4, max: 60000 },                // N*mm per deg; the hand pulls the lid edge
  hand: { groups: ["lid"], axis: AXIS, pivot: G.hinge },
  pose: (sim) => poseOf(sim.q[0]),
  table, strutLen, strutTorque,
  settings: [["F1", "Strut force at full extension, N", 1, 0], ["prog", "Strut progression (F2/F1)", 0.01, 1], ["damp", "Strut damping (F1 / damp per mm/s)", 1, 0],
    ["hinge", "Hinge friction, N·mm", 10, 0]],
  resets: [{ label: "Reset: shut" }],
  hud: (sim) => ({ big: sim.q[0].toFixed(1) + "°", state: sim.q[0] < 0.5 ? "shut" : sim.q[0] > 94.5 ? "open (stop)" : sim.v[0] > 2 ? "opening" : sim.v[0] < -2 ? "closing" : "held" }),
  readouts: (sim) => {
    const deg = sim.q[0], g = table.at(deg).Q, s = strutTorque(deg, 0, sim.P);
    return [["Lid angle", deg.toFixed(1) + "°"], ["Speed", sim.v[0].toFixed(0) + "°/s"], ["Strut length", strutLen(deg).toFixed(1) + " mm"],
      ["Strut force", (strut ? strut.force(strutLen(deg), 0) : 0).toFixed(0) + " N"], ["Weight torque", (g / 1000).toFixed(2) + " N·m"],
      ["Strut torque", (s / 1000).toFixed(2) + " N·m"], ["Hand", (sim.fHand / 1000).toFixed(2) + " N·m"]];
  },
  eventText: (e) => (e.kind === "stop" ? `STOP · ${Math.abs(e.val).toFixed(0)}°/s` : null),
};

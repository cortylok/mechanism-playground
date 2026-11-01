// 2-finger gripper. CAD model by Hussein Syria (GrabCAD, September 11th, 2026); physics by this playground. One DOF: slider travel x (mm, 0 = closed as in the CAD, 30 = the screw
// collar meets the bracket). A motor turns the 3 mm pitch lead screw (Close / Open / Stop buttons); the screw pushes
// the slider; small connectors swing the jaw connectors; each jaw rides a four-bar (jaw connector + big connector).
// A test cylinder sits in the jaw notch: a stiff contact gives the grip force. Masses: aluminium jaws, steel pins (as
// asked); the rest assumed (see the cards). Gravity is off (the gripper's mounting is not known).
const G = DATA.geometry, LK = gripperLinkage(LINKAGE2D), PIN = LK.P;
const X0 = G.travel[0], X1 = G.travel[1], STEP = 0.25;
const grid = []; for (let x = X0 - 1; x <= X1 + 1 + 1e-9; x += STEP) grid.push(+x.toFixed(4));   // 1 mm past each stop: clean derivatives
const tab = LK.solver.table(grid);
if (!tab.every((r) => r.ok)) throw new Error("gripper linkage does not close over the travel");
function body(name, x) {                                             // interpolated planar pose of a linkage body
  const u = Math.max(0, Math.min(grid.length - 1.000001, (x - grid[0]) / STEP)), i = Math.floor(u), f = u - i;
  const a = tab[i].bodies[name], b = tab[i + 1].bodies[name];
  return { ang: a.ang + (b.ang - a.ang) * f, d1: a.dy + (b.dy - a.dy) * f, d2: a.dz + (b.dz - a.dz) * f };
}
// which body each part rides on: links and jaws by name; pins and nuts by where their centre is
const BODY = { "Slider-1": "slider", "connctor small-1": "smallU", "connctor small-2": "smallL", "Jaw Connctor-1": "jcU", "Jaw Connctor-2": "jcL",
  "connctor Big-2": "bigU", "connctor Big-3": "bigL", "Jaw-1": "jawU", "Jaw-2": "jawL" };
const AT = [["S", "slider"], ["K", "small"], ["J1", "jaw"], ["J2", "jaw"]];
for (const p of DATA.parts) {
  if (BODY[p.id] || !p.com || !/^(pin|Nut)/.test(p.id)) continue;
  for (const [k, b] of AT) for (const s of [1, -1]) {
    if (Math.hypot(p.com[0] - PIN[k][0], p.com[2] - s * PIN[k][1]) < 1.0) BODY[p.id] = b === "slider" ? "slider" : b + (s > 0 ? "U" : "L");
  }
}
const screwTurn = (x, P) => -(x / P.pitch) * 2 * Math.PI;           // rad
function poseOf(x, P) {
  const out = {};
  for (const id in BODY) {
    const nm = BODY[id];
    out[id] = nm === "slider" ? MAT4.translate([x, 0, 0]) : (() => { const b = body(nm, x); return MAT4.planar(b.ang, b.d1, b.d2, "xz"); })();
  }
  const th = screwTurn(x, P);
  out["shift-1"] = MAT4.mul(MAT4.translate([x, 0, 0]), MAT4.rotate([1, 0, 0], th));
  // the 12-tooth gear meets the screw thread like a worm wheel: its axle (crank-1) stays on its fixed axis along y at
  // (x, z) = G.gearCentre and turns one tooth per screw turn
  const gear = MAT4.rotateAbout([0, 1, 0], [G.gearCentre[0], 0, G.gearCentre[1]], th / G.gearTeeth);
  out["spur gear_iso-1"] = gear; out["crank-1"] = gear;
  const D = P.objD > 0 ? P.objD : 1e-6;
  out["test-object"] = MAT4.mul(MAT4.translate([G.object[0], 0, G.object[1]]), [D, 0, 0, 0, 0, 1, 0, 0, 0, 0, D, 0, 0, 0, 0, 1]);
  return out;
}
// object contact: least distance from the object axis to the upper jaw's inner profile, per grid step (both jaws
// are mirror images, so the lower jaw sees the same distance)
const dmin = grid.map((x) => {
  const b = body("jawU", x), c = Math.cos(b.ang), s = Math.sin(b.ang);
  let m = Infinity;
  for (const [px, pz] of G.profile) {
    const wx = c * px - s * pz + b.d1, wz = s * px + c * pz + b.d2;
    m = Math.min(m, Math.hypot(wx - G.object[0], wz - G.object[1]));
  }
  return m;
});
const lerp = (arr, x) => { const u = Math.max(0, Math.min(grid.length - 1.000001, (x - grid[0]) / STEP)), i = Math.floor(u); return arr[i] + (arr[i + 1] - arr[i]) * (u - i); };
const dDmin = (x) => (lerp(dmin, x + 0.05) - lerp(dmin, x - 0.05)) / 0.1;
const tipGap = (x) => { const b = body("jawU", x), c = Math.cos(b.ang), s = Math.sin(b.ang); return 2 * (s * G.tip[0] + c * G.tip[1] + b.d2); };
const design = { torque: 400, rpm: 300, eff: 0.35, pitch: G.pitch, objD: 50, objK: 300, objZeta: 0.7, hold: 15, guide: 2 };
const massT = MASSTABLE.build({ parts: DATA.parts, pose: (q) => poseOf(q[0], design), dof: 0, q0: [0], grid, unit: "mm", g: 0 });
let motor = 0;                                                        // -1 close, +1 open, 0 stop
const contact = (x, P) => (P.objD > 0 ? Math.max(0, P.objD / 2 - lerp(dmin, x)) * P.objK : 0);   // spring force, N per jaw
// motor: torque falls linearly from stall (P.torque) to zero at the no-load speed (P.rpm); it brakes above that speed
function screwForce(P, v = 0) {
  if (!motor) return 0;
  const rpm = (motor * v / P.pitch) * 60;                            // screw speed in the driven direction
  const T = P.torque * Math.max(-1, Math.min(1, 1 - rpm / Math.max(1, P.rpm)));
  return motor * T * 2 * Math.PI * P.eff / P.pitch;                  // N on the slider
}
// object contact on the slider DOF: spring + damper (damping ratio objZeta on the contact's own stiffness and the moving
// mass). It only pushes, never pulls (an object does not stick to the jaws).
function contactQ(x, v, P) {
  const F = contact(x, P);
  if (F <= 0) return 0;
  const dd = dDmin(x), kgen = 2 * P.objK * dd * dd * 1000;           // N/m on the slider
  const c = 2 * P.objZeta * Math.sqrt(kgen * massT.at(x).M);         // N s/m
  const Q = 2 * F * dd - c * v / 1000;
  return Q * dd > 0 ? Q : 0;
}

return {
  dofs: [{ key: "x", label: "Slider travel", unit: "mm", min: X0, max: X1, q0: X1 }],
  design, grid, dmin, tipGap, contact, contactQ, screwForce, massT,
  mass: (q) => [massT.at(q[0]).M],
  forces: (q, v, t, sim) => [screwForce(sim.P, v[0]) + contactQ(q[0], v[0], sim.P)],
  friction: (q, v, sim) => [sim.P.hold + sim.P.guide],
  grab: { dof: 0, k: 60, c: 1.0, max: 400 },
  hand: { groups: ["jaws", "links", "drive"], auto: true },
  pose: (sim) => poseOf(sim.q[0], sim.P),
  reset: () => { motor = 0; },
  setMotor: (m) => { motor = m; },
  buttons: [
    { label: "Close", press: () => { motor = -1; }, active: () => motor === -1 },
    { label: "Open", press: () => { motor = 1; }, active: () => motor === 1 },
    { label: "Stop", press: () => { motor = 0; }, active: () => motor === 0 }],
  resets: [{ label: "Reset: open" }],
  settings: [["torque", "Motor stall torque on the screw, N·mm", 10, 0], ["rpm", "Motor no-load speed, rpm", 10, 1], ["eff", "Screw efficiency (0..1)", 0.01, 0.01], ["pitch", "Screw lead, mm per turn", 0.1, 0.1],
    ["objD", "Test object diameter, mm (0 = none)", 1, 0], ["objK", "Test object stiffness, N/mm", 10, 1], ["objZeta", "Test object damping ratio (0 = bouncy rubber)", 0.05, 0], ["hold", "Screw friction (holds the slider), N", 1, 0],
    ["guide", "Slider guide friction, N", 0.5, 0]],
  hud: (sim) => { const F = contact(sim.q[0], sim.P);
    return { big: `gap ${tipGap(sim.q[0]).toFixed(1)} mm`, state: motor < 0 ? "closing" : motor > 0 ? "opening" : "motor stopped",
      chips: [{ label: F > 0.5 ? `gripping ${F.toFixed(0)} N per jaw` : "not gripping", on: F > 0.5 }] }; },
  readouts: (sim) => { const x = sim.q[0], F = contact(x, sim.P);
    return [["Slider travel", x.toFixed(2) + " mm"], ["Jaw tip gap", tipGap(x).toFixed(1) + " mm"], ["Notch opening", (2 * lerp(dmin, x)).toFixed(1) + " mm"],
      ["Grip force", F.toFixed(1) + " N per jaw"], ["Screw push", screwForce(sim.P, sim.v[0]).toFixed(0) + " N"], ["Slider speed", sim.v[0].toFixed(1) + " mm/s"], ["Screw turns", (x / sim.P.pitch).toFixed(2)],
      ["Hand", sim.fHand.toFixed(0) + " N"], ["Moving mass (eff.)", massT.at(x).M.toFixed(2) + " kg"]]; },
  eventText: (e) => (e.kind === "stop" ? `END STOP · ${Math.abs(e.val).toFixed(0)} mm/s` : null),
};

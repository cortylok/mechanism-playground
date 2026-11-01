// Pneumatic slide: a 32 bore x 100 stroke double-acting cylinder drives a sled on a rail. One DOF: rod extension x (mm).
// A 5/2 single-solenoid valve, 4 mm tubes, meter-out flow controls on both ports, 15 mm cushions. The hand can push the
// sled too. The air model is lumped (see physics/modules/pneumatics.js); tune C/b and friction to one measured stroke.
const moving = DATA.parts.filter((p) => p.id === "rod" || p.id === "sled");
const mass = moving.reduce((a, p) => a + (p.mass || 0), 0);
const design = { supply: 6, fcA: 0.25, fcB: 0.25, cushionC: 0.03, cushion: 15, load: 0, rail: 3 };

function makePn(P, keep) {
  const pn = PNEUMATICS.system({
    supply: P.supply, n: 1.2,
    valve: { type: "5/2", C: 0.6, b: 0.3, solenoid: "single" },
    tubeA: { id: 4, len: 1000 }, tubeB: { id: 4, len: 1000 },
    fcA: P.fcA > 0 ? { mode: "out", C: P.fcA, b: 0.3 } : null,
    fcB: P.fcB > 0 ? { mode: "out", C: P.fcB, b: 0.3 } : null,
    cyl: { bore: 32, rod: 12, stroke: 100, deadA: 2000, deadB: 2000,
      cushion: P.cushion > 0 ? { len: P.cushion, C: P.cushionC, b: 0.3 } : null, friction: { static: 15, dynamic: 10 } },
  });
  if (keep) { pn.st.pA = Math.min(keep.st.pA, pn.psup); pn.st.pB = Math.min(keep.st.pB, pn.psup); pn.st.valve = keep.st.valve; }
  return pn;
}
let pn = null;
const ensure = (sim) => { if (!pn) pn = makePn(sim.P); return pn; };

return {
  dofs: [{ key: "x", label: "Rod out", unit: "mm", min: 0, max: 100, q0: 0 }],
  design,
  mass: () => [mass],
  update: (sim, dt) => ensure(sim).step(sim.q[0], sim.v[0], dt),
  forces: (q, v, t, sim) => [ensure(sim).force() - sim.P.load],
  friction: (q, v, sim) => [ensure(sim).friction(v[0]) + sim.P.rail],
  reset: (sim) => { pn = makePn(sim.P); },
  onSetting: (sim) => { pn = makePn(sim.P, pn); },
  get pn() { return pn; },
  grab: { dof: 0, k: 60, c: 1.0, max: 400 },
  hand: { groups: ["sled"], axis: [1, 0, 0] },
  pose: (sim) => { const m = MAT4.translate([sim.q[0], 0, 0]); return { rod: m, sled: m }; },
  buttons: [{ label: "Valve", press: (sim) => { ensure(sim).setValve(!pn.st.valve); }, active: () => !!(pn && pn.st.valve),
    text: () => (pn && pn.st.valve ? "Valve ON (extend)" : "Valve OFF (retract)") }],
  settings: [["supply", "Supply pressure, bar(g)", 0.5, 0], ["fcA", "Flow control A (cap end, meter-out) C, dm³/(s·bar)", 0.01, 0],
    ["fcB", "Flow control B (rod end, meter-out) C, dm³/(s·bar)", 0.01, 0], ["cushion", "Cushion length, mm (0 = off)", 1, 0],
    ["cushionC", "Cushion needle C, dm³/(s·bar)", 0.005, 0.001], ["load", "Load against extension, N", 10, 0], ["rail", "Rail friction, N", 0.5, 0]],
  resets: [{ label: "Reset" }],
  hud: (sim) => { const g = ensure(sim).gauges(); return { big: sim.q[0].toFixed(1) + " mm", state: pn.st.valve ? "valve on" : "valve off",
    chips: [{ label: "A " + g.A.toFixed(2) + " bar", on: g.A > g.B }, { label: "B " + g.B.toFixed(2) + " bar", on: g.B > g.A }] }; },
  gauges: (sim) => { const g = ensure(sim).gauges(); return [{ label: "A (cap)", value: g.A, max: sim.P.supply || 1, unit: "bar" }, { label: "B (rod)", value: g.B, max: sim.P.supply || 1, unit: "bar" }]; },
  readouts: (sim) => { const g = ensure(sim).gauges(); return [["Rod out", sim.q[0].toFixed(1) + " mm"], ["Speed", sim.v[0].toFixed(0) + " mm/s"],
    ["Rod force", pn.force().toFixed(0) + " N"], ["Chamber A", g.A.toFixed(2) + " bar(g)"], ["Chamber B", g.B.toFixed(2) + " bar(g)"],
    ["Flow A", g.qA.toFixed(0) + " NL/min"], ["Flow B", g.qB.toFixed(0) + " NL/min"], ["Hand", sim.fHand.toFixed(0) + " N"]]; },
  eventText: (e) => (e.kind === "stop" ? `END STOP · ${Math.abs(e.val).toFixed(0)} mm/s` : null),
};

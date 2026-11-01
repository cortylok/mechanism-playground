// Mechanism playground - physics core (no DOM: runs in node and in the page).
// Generic N-DOF integrator. A mechanism plug-in supplies masses, forces, friction and stops per DOF; the core adds the
// hand (a spring + damper from the pointer target to the grabbed DOF), substeps, Coulomb stick/slip, inelastic stops,
// an event log and a scripted push for tests.
// Units: mm, s, kg, N. A "deg" DOF uses deg, deg/s, kg*mm^2 and N*mm.
(function (root) {
  const DEG = 180 / Math.PI;
  // acceleration per unit force/mass: mm DOF: F[N]/m[kg] -> 1000 mm/s^2; deg DOF: T[N*mm]/I[kg*mm^2] -> 1000 rad/s^2
  const ACC = { mm: 1000, deg: 1000 * DEG };

  function create(mech) {
    const n = mech.dofs.length;
    const grab = Object.assign({ dof: 0, k: 60, c: 1.0, max: 400 }, mech.grab || {});
    const sim = {
      mech, n, q: mech.dofs.map((d) => d.q0 || 0), v: new Array(n).fill(0), t: 0,
      hand: false, target: 0, vh: 0, fHand: 0, events: [], slow: false, script: null,
      P: Object.assign({}, mech.design || {}), tscale: 1, vmin: mech.vmin || 300,
      grabDof: grab, F: new Array(n).fill(0),
    };
    if (sim.P.tscale != null) sim.tscale = sim.P.tscale;
    const scale = mech.dofs.map((d) => ACC[d.unit || "mm"]);
    const bounds = (q) => (mech.bounds ? mech.bounds(q, sim) : mech.dofs.map((d) => ({ lo: d.min, hi: d.max })));

    sim.event = (kind, val) => {
      sim.events.push({ t: sim.t, kind, val, q: sim.q.slice() });
      if (sim.events.length > 50) sim.events.shift();
      if (sim.onEvent) sim.onEvent(sim.events[sim.events.length - 1]);
    };

    sim.substep = (dt) => {
      sim.t += dt;
      if (sim.script) runScript(dt);
      if (mech.update) mech.update(sim, dt);
      const q = sim.q, v = sim.v, gi = grab.dof;
      const m = mech.mass(q, sim), F = mech.forces(q, v, sim.t, sim), fr = mech.friction ? mech.friction(q, v, sim) : null;
      sim.fHand = sim.hand ? Math.max(-grab.max, Math.min(grab.max, grab.k * (sim.target - q[gi]) - grab.c * (v[gi] - sim.vh))) : 0;
      const b = bounds(q);
      for (let i = 0; i < n; i++) {
        const Fi = F[i] + (i === gi ? sim.fHand : 0);
        sim.F[i] = Fi;
        const k = scale[i] / m[i];
        let vn = v[i] + Fi * k * dt;
        const f = fr ? fr[i] : 0;
        if (f > 0) {
          const fd = f * k * dt;                                       // Coulomb: sticks when slow and the push is small
          if (Math.abs(vn) <= fd && Math.abs(Fi) <= f) vn = 0; else vn -= Math.sign(vn) * Math.min(Math.abs(vn), fd);
        }
        let q1 = q[i] + vn * dt;
        const e = (mech.dofs[i].hit && mech.dofs[i].hit.e) || 0;
        if (q1 >= b[i].hi) { q1 = b[i].hi; if (vn > 0) { if (vn > 1) sim.event("stop", vn); vn = -e * vn; } }
        if (q1 <= b[i].lo) { q1 = b[i].lo; if (vn < 0) { if (vn < -1) sim.event("stop", vn); vn = -e * vn; } }
        q[i] = q1; v[i] = vn;
      }
      if (mech.after) mech.after(sim, dt);
    };

    sim.step = (frameDt) => {
      const dt = Math.min(0.05, frameDt) * sim.tscale;
      let vmax = Math.max(sim.vmin, Math.abs(sim.vh) * 1.5);
      for (let i = 0; i < n; i++) vmax = Math.max(vmax, Math.abs(sim.v[i]) * 1.5);
      const need = Math.ceil(Math.max(vmax * dt / 0.01, dt / 1e-4));
      // substep count held steady (power of two, steps down only when 8x too many): a count that follows the speed
      // every frame breaks the integrator's energy balance and drains an undamped spring by ~0.4 %/s
      if (need > sim.ns || need * 8 < sim.ns || !sim.ns) sim.ns = 2 ** Math.ceil(Math.log2(need));
      sim.slow = sim.ns > 6000;
      const ns = Math.min(6000, sim.ns);
      for (let i = 0; i < ns; i++) sim.substep(dt / ns);
      if (mech.frame) mech.frame(sim);
    };

    function runScript(dt) {                                          // a hand target that moves like a pointer
      const sc = sim.script;
      if (sc.phase === "move") {
        const dir = Math.sign(sc.to - sim.target);
        sim.target += dir * sc.v * dt; sim.vh = dir * sc.v;
        if ((sc.to - sim.target) * dir <= 0) { sim.target = sc.to; sim.vh = 0; sc.phase = "hold"; sc.t = 0; }
      } else if ((sc.t += dt) >= sc.hold) { sim.script = null; sim.release(); }
    }
    sim.grab = () => { sim.hand = true; sim.target = sim.q[grab.dof]; sim.vh = 0; };
    sim.drag = (target, vPointer) => { sim.target = target; sim.vh = vPointer || 0; };
    sim.release = () => { sim.hand = false; sim.fHand = 0; sim.vh = 0; };
    // test hook: the hand moves to `to` at speed v, holds `hold` s, lets go; it leads by a little so the spring pushes
    sim.scriptedPush = (to, v, hold, lead) => {
      sim.grab();
      const ld = lead != null ? lead : Math.min(120, 0.3 * grab.max) / grab.k;
      sim.script = { phase: "move", to: to + Math.sign(to - sim.q[grab.dof]) * ld, v, hold };
    };
    sim.reset = (where) => {
      sim.q = mech.dofs.map((d) => d.q0 || 0); sim.v = new Array(n).fill(0);
      Object.assign(sim, { t: 0, hand: false, target: 0, vh: 0, fHand: 0, events: [], script: null });
      if (mech.reset) mech.reset(sim, where);
    };
    if (mech.init) mech.init(sim);
    return sim;
  }

  const CORE = { create, DEG };
  if (typeof module !== "undefined" && module.exports) module.exports = CORE; else root.CORE = CORE;
})(typeof window !== "undefined" ? window : globalThis);

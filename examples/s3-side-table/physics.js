// S3 assembly physics (DOM-free; node + browser). One carriage lift DOF + the S2 push-push latch (ported from the
// ST-401 latch lab: friction-held swing arm, spring plunger pin on the HS2E cam map) + 4 dock pogo pins.
// Lift is + up, mm; lift 0 = closed and latched, -6 = latch overtravel. Forces in N, masses in kg, time in s.
const PHYS = (() => {
  // ------------------------------------------------------------------ fixed design data
  const G = 9.81;
  const STRUT = { ext: 550, stroke: 220, len0: 350, damp: 250 };      // GS535: ball-to-ball at lift 0 = 350 (lower ball z -533)
  const LIFT_BOTTOM = STRUT.ext - STRUT.stroke - STRUT.len0;          // -20: strut fully compressed (the latch cam stops first)
  const LIFT_TOP = STRUT.ext - STRUT.len0;                           // 200: strut fully extended = the open stop
  const LATCH = { L: 40, EPS: 0.12, PIN_MASS: 0.0015, ZTOP: -39 };    // lab constants; ZTOP: pin above the cam map
  const K_HAND = 60, C_HAND = 1.0, HAND_MAX = 400;
  const DOCK = { pins: [[22, -231.5], [22, -238.5], [28, -231.5], [28, -238.5]], tip: -161.3, pad: -162.3, rampTo: -158.0,
    rampDeg: 25, pads: { A: { zc: -235, half: 8 }, B: { zc: -435, half: 10 } } };
  // masses: mass_budget.py 2026-10-31 - halves = ASA upper + lower + bay lid at 60 % infill, 4 walls + the SOLID
  // modifiers (the owner's print plan); hardware = rail blocks, strut body, latch cam, screws, electrics; contents = bat 865 +
  // torch 258 + knife 189 g
  const DESIGN = { strut: 100, prog: 1.3, halves: 1.94, hardware: 0.35, contents: 1.31, blockDrag: 2.0, pivot: 1.0,   // pivot: ~ pin mu 0.3 (door_close_margin.py)
   
    armFric: 0.10, amass: 3, plunger: 2, pinF0: 0.3, pinK: 0.4, pinMu: 0.2, tscale: 1 };
  const P = Object.assign({}, DESIGN);
  // motor false: strut off AND no gravity - path driven. The hand sets the lift (rate KIN_V), the lift
  // stays where it is let go, the guide edges push the knob and it stays where they leave it. Not in DESIGN, so
  // "Design values" does not switch it.
  P.motor = true;
  const KIN_V = 800;                                                  // mm/s, model time
  let T = null, TR = null, TANW = Math.tan(25 * Math.PI / 180);

  const st = { lift: 0, v: 0, hand: false, target: 0, vh: 0, fHand: 0, x: -6, vx: 0, d: 3.8, vd: 0, fallFrom: null,
    blocked: false, latch: "", padA: false, padB: false, fStrut: 0, script: null, t: 0, clicks: 0, slow: false, events: [],
    pinC: [0, 0, 0, 0], trail: [], phi: 0, w: 0, edge: "hi", door: 0, lam: 0 };

  // ------------------------------------------------------------------ tables
  function init({ phys, track }) {
    T = phys; TR = track; TANW = Math.tan((TR.min_wall || 25) * Math.PI / 180);
    T.rateSum = T.lifts.map((_, i) => Object.values(T.rates).reduce((a, r) => a + Math.abs(r[i]), 0));
  }
  function tab(arr, L) {
    const X = T.lifts, n = X.length;
    if (L <= X[0]) return arr[0];
    if (L >= X[n - 1]) return arr[n - 1];
    let lo = 0, hi = n - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (X[m] <= L) lo = m; else hi = m; }
    return arr[lo] + (arr[hi] - arr[lo]) * (L - X[lo]) / (X[hi] - X[lo]);
  }
  const carriageMass = () => P.halves + P.hardware + P.contents;
  // ------------------------------------------------------------------ the linkage: its own degree of freedom (owner
  // 2026-10-30: closing, the knob rides the TOP edge of the guide). phi = lower-arm angle (deg, 0 = closed, - = open);
  // the knob is free between the guide's bottom edge (cam, hi) and top edge (lo) at rel = lift - carrier rise.
  const D2R = Math.PI / 180;
  function tphi(arr, ph) {                                           // tables on the phi grid 0, -0.25, ... deg
    const u = Math.max(0, Math.min(arr.length - 1.000001, -ph / 0.25)), i = Math.floor(u);
    return arr[i] + (arr[i + 1] - arr[i]) * (u - i);
  }
  function guideAt(rel) {                                            // edges (deg) and slopes (deg per mm of rel)
    const g = T.guide, r0 = g.rel[0], n = g.rel.length;
    const u = Math.max(0, Math.min(n - 1.000001, (rel - r0) / 0.5)), i = Math.floor(u), f = u - i;
    return { hi: g.hi[i] + (g.hi[i + 1] - g.hi[i]) * f, lo: g.lo[i] + (g.lo[i + 1] - g.lo[i]) * f,
      dhi: rel < r0 || rel > g.rel[n - 1] ? 0 : (g.hi[i + 1] - g.hi[i]) / 0.5, dlo: rel < r0 || rel > g.rel[n - 1] ? 0 : (g.lo[i + 1] - g.lo[i]) / 0.5 };
  }
  const carrierRise = (L) => Math.max(0, Math.min(T.slide, L));
  const relOf = (L) => L - carrierRise(L);
  const drelOf = (L) => (L < 0 || L > T.slide ? 1 : 0);
  function keyLo(dd) {                                               // collar keyway: most open arm, carrier dd below its top
    const k = T.key, n = k.d.length;
    if (dd <= k.d[0]) return { lo: k.lo[0], s: 0 };
    let i = 0; while (i < n - 2 && k.d[i + 1] < dd) i++;
    const s = (k.lo[i + 1] - k.lo[i]) / (k.d[i + 1] - k.d[i]);
    return { lo: dd >= k.d[n - 1] ? k.lo[n - 1] : k.lo[i] + s * (dd - k.d[i]), s: dd >= k.d[n - 1] ? 0 : s };
  }
  function bounds(L) {                                               // arm limits (deg) + slopes per mm of lift: guide + key
    const g = guideAt(relOf(L)), dr = drelOf(L);
    const b = { hi: g.hi, lo: g.lo, dhi: g.dhi * dr, dlo: g.dlo * dr };
    if (L <= T.slide) {                                               // the carrier is below its top: the key holds the arm
      const dd = T.slide - carrierRise(L), k = keyLo(dd);
      if (k.lo > b.lo) { b.lo = k.lo; b.dlo = L >= 0 ? -k.s : 0; }    // d falls as the lift rises (carrier riding)
    }
    return b;
  }

  // ------------------------------------------------------------------ forces on the lift (+ up)
  function strutForce(L, v) {
    const len = STRUT.len0 + L, comp = Math.max(0, Math.min(1, (STRUT.ext - len) / STRUT.stroke));
    let f = P.strut * (1 + (P.prog - 1) * comp);
    if (v > 0) f -= (P.strut / STRUT.damp) * v;                       // damped on extension only
    return f;
  }
  function padSurface(z) {                                           // pad surface y at carriage-frame z (or null)
    const run = (DOCK.rampTo - DOCK.pad) / Math.tan(DOCK.rampDeg * Math.PI / 180);
    for (const k in DOCK.pads) {
      const p = DOCK.pads[k], dz = Math.abs(z - p.zc);
      if (dz <= p.half) return { y: DOCK.pad, slope: 0, pad: k };
      if (dz <= p.half + run) { const s = Math.tan(DOCK.rampDeg * Math.PI / 180) * Math.sign(z - p.zc);
        return { y: DOCK.pad + (dz - p.half) * Math.abs(s), slope: s, pad: k }; }
    }
    return null;
  }
  function pinForces(L, v) {                                          // vertical force of the 4 pogo pins + contact flags
    let f = 0; const on = { A: 0, B: 0 };
    DOCK.pins.forEach(([, zw], i) => { st.pinC[i] = 0; });
    for (const [i, [, zw]] of DOCK.pins.entries()) {
      const s = padSurface(zw - L);
      if (!s) continue;
      const c = DOCK.tip - s.y;                                       // compression (mm)
      if (c <= 0) continue;
      st.pinC[i] = c;
      const n = P.pinF0 + P.pinK * c;
      f += -n * s.slope - P.pinMu * n * Math.sign(v);                 // -dE/dlift + sliding friction
      if (c >= 0.5) on[s.pad]++;
    }
    st.padA = on.A === 4; st.padB = on.B === 4;
    return f;
  }

  // ------------------------------------------------------------------ latch (lab model, s = -lift)
  const pz = (s, x) => s + LATCH.L - Math.sqrt(LATCH.L * LATCH.L - x * x);
  function tipAt(x, z) {
    const j = Math.round((x - TR.tip_x0) / TR.tip_res), i = Math.round((z - TR.tip_z0) / TR.tip_res);
    if (i < 0 || j < 0 || i >= TR.tip_nz || j >= TR.tip_nx) return -1;
    const v = TR.tip[i * TR.tip_nx + j];
    return v === 255 ? -1 : v / 50;
  }
  function ok(s, x) {
    if (x < TR.arm_x[0] || x > TR.arm_x[1]) return -1;
    if (pz(s, x) < LATCH.ZTOP) return TR.pin_max;                     // pin below the cam (carriage up): free
    const t = tipAt(x, pz(s, x));
    return t >= 0 && t >= st.d - LATCH.EPS ? t : -1;
  }
  function landOrLift(t, dt) {
    if (t <= st.d) { st.d = t; st.vd = 0; st.fallFrom = null; return; }
    if (st.fallFrom === null) st.fallFrom = st.d;
    st.vd += (P.plunger / LATCH.PIN_MASS) * 1000 * dt;
    st.d += st.vd * dt;
    if (st.d >= t) { const drop = t - st.fallFrom; st.d = t; st.vd = 0; st.fallFrom = null; if (drop > 0.25) event("click", drop); }
  }
  function event(kind, val) { st.clicks += kind === "click" ? 1 : 0; st.events.push({ t: st.t, kind, val, lift: st.lift }); if (st.events.length > 50) st.events.shift(); }

  // ------------------------------------------------------------------ substep
  function substep(dt) {
    st.t += dt;
    if (st.seq) seqStep(dt);
    else if (st.script) {                                             // test hook: a hand target moving like a pointer
      const sc = st.script;
      if (sc.phase === "move") { const dir = Math.sign(sc.to - st.target); st.target += dir * sc.v * dt; st.vh = dir * sc.v;
        if ((sc.to - st.target) * dir <= 0) { st.target = sc.to; st.vh = 0; sc.phase = "hold"; sc.t = 0; } }
      else if ((sc.t += dt) >= sc.hold) { st.script = null; release(); }
    }
    const L = st.lift, v = st.v;
    let vn;
    if (!P.motor) {                                                   // path driven: no forces, the hand places the lift
      st.fHand = 0; st.fStrut = 0; st.lam = 0; pinForces(L, 0);
      vn = st.hand ? Math.max(-KIN_V, Math.min(KIN_V, (st.target - L) / dt)) : 0;
    } else {
    st.fHand = st.hand ? Math.max(-HAND_MAX, Math.min(HAND_MAX, K_HAND * (st.target - L) - C_HAND * (v - st.vh))) : 0;
    st.fStrut = strutForce(L, v);
    // carriage: while the carrier rides with it (lift 0 .. slide) it also carries the whole linkage's weight
    const carried = L >= 0 && L <= T.slide;
    const m = carriageMass() + (carried ? T.mlink : 0);
    const Fc = st.fHand + st.fStrut - m * G + pinForces(L, v);
    // linkage on phi: gravity torque, inertia, pivot drag (N*mm per joint x 4 end sets x |dtheta/dphi|)
    const I = tphi(T.Iphi, st.phi), Qp = tphi(T.Qphi, st.phi), fr = P.pivot * 4 * tphi(T.ratePhi, st.phi);
    const gd = bounds(L);
    let drive = Fc, lam = 0, s = 0;
    if (st.edge) {                                                    // knob on an edge: arm slaved to the carriage
      s = (st.edge === "hi" ? gd.dhi : gd.dlo) * D2R;                 // rad per mm of lift
      const w = s * v, fs = Math.abs(w) > 1e-4 ? fr * Math.sign(w) : 0;
      lam = (s * Fc / m - (Qp - fs) / I) / (1 / I + s * s / m);       // guide torque on the arm (N*mm)
      if ((st.edge === "hi" && lam > 0) || (st.edge === "lo" && lam < 0)) { st.edge = null; lam = 0; s = 0; }
      else drive = Fc - lam * s;
    }
    vn = v + (drive / m) * 1000 * dt;                                 // mm/s
    const fd = (P.blockDrag / m) * 1000 * dt;                         // rail block drag: Coulomb, sticks when slow
    if (Math.abs(vn) <= fd && Math.abs(drive) <= P.blockDrag) vn = 0; else vn -= Math.sign(vn) * Math.min(Math.abs(vn), fd);
    if (!st.edge) {                                                   // knob free: the arm swings on gravity + pivot drag
      let w = st.w + (Qp / I) * 1000 * dt;
      const fw = (fr / I) * 1000 * dt;
      if (Math.abs(w) <= fw && Math.abs(Qp) <= fr) w = 0; else w -= Math.sign(w) * Math.min(Math.abs(w), fw);
      st.w = w;
    }
    st.lam = lam;
    }
    let L1 = L + vn * dt;
    if (L1 >= LIFT_TOP) { L1 = LIFT_TOP; if (vn > 0) { if (vn > 20 && P.motor) event("top", vn); vn = 0; } }
    if (L1 <= LIFT_BOTTOM) { L1 = LIFT_BOTTOM; if (vn < 0) vn = 0; }
    // arm: pendulum + pivot friction (no side spring on S2)
    const ma = P.amass / 1000, F = -0.0196 * st.x / LATCH.L;
    let vx = st.vx + (F / ma) * 1000 * dt;
    const fdv = (P.armFric / ma) * 1000 * dt;
    if (Math.abs(vx) <= fdv && Math.abs(F) <= P.armFric) vx = 0; else vx -= Math.sign(vx) * Math.min(Math.abs(vx), fdv);
    const x1 = st.x + vx * dt;
    // latch contact (lab): walls may swing the arm within the friction cone or stop the carriage
    const s0 = -L, s1 = -L1, ds = s1 - s0;
    let moved = false;
    if (Math.abs(ds) > 1e-12) {
      const reach = (Math.abs(ds) + TR.tip_res) / TANW + 1.5 * TR.tip_res + Math.abs(x1 - st.x);
      for (let off = 0; off <= reach + 1e-9 && !moved; off += 0.0025) {
        for (const c of off === 0 ? [x1, st.x] : [x1 + off, x1 - off]) {
          const t = ok(s1, c);
          if (t >= 0) {
            const vw = (c - x1) / dt, cap = Math.abs(ds / dt) / TANW, kf = dt / (dt + 0.001);
            st.vx = vx + kf * Math.max(-cap, Math.min(cap, vw));
            st.x = c; st.lift = L1; st.v = vn; landOrLift(t, dt); moved = true; break;
          }
        }
      }
      if (!moved) { st.blocked = true; st.v = 0; } else st.blocked = false;
    } else { st.blocked = false; st.v = vn; }
    if (!moved) {
      const t = ok(-st.lift, x1);
      if (t >= 0) { st.x = x1; st.vx = vx; landOrLift(t, dt); }
      else {
        const h = Math.sign(x1 - st.x) * 0.0025;
        if (h) for (let n = st.x + h; (x1 - n) * h >= 0; n += h) { const tt = ok(-st.lift, n); if (tt < 0) break; st.x = n; }
        st.vx = 0; landOrLift(Math.max(0, pz(-st.lift, st.x) < LATCH.ZTOP ? TR.pin_max : tipAt(st.x, pz(-st.lift, st.x))), dt);
      }
    }
    if (st.x <= TR.arm_x[0] + 1e-6 && st.vx < 0) st.vx = 0;
    if (st.x >= TR.arm_x[1] - 1e-6 && st.vx > 0) st.vx = 0;
    if (P.motor) linkStep(dt); else kinLink();
  }
  function kinLink() {                                                // no gravity: the edge that reaches the knob pushes it
    const g = bounds(st.lift);
    st.edge = st.phi >= g.hi ? "hi" : st.phi <= g.lo ? "lo" : null;
    st.phi = Math.max(-84, Math.min(0, Math.max(g.lo, Math.min(g.hi, st.phi)))); st.w = 0;
    st.door = tphi(T.door, st.phi);
  }
  function setMotor(on) {                                            // switch at rest: the next step finds the edges again
    P.motor = !!on; st.v = 0; st.w = 0; st.vh = 0; st.target = st.lift; if (on) st.edge = null;
  }
  function linkStep(dt) {                                             // move the arm with the final lift, keep it in the guide
    const L = st.lift, g = bounds(L), dr = D2R;
    if (st.edge) { st.phi = st.edge === "hi" ? g.hi : g.lo; st.w = (st.edge === "hi" ? g.dhi : g.dlo) * dr * st.v; }
    else st.phi += (st.w / D2R) * dt;
    const I = tphi(T.Iphi, st.phi), m = carriageMass() + (L >= 0 && L <= T.slide ? T.mlink : 0);
    for (const e of ["hi", "lo"]) {                                   // hit an edge: inelastic, momentum shared with the carriage
      const b = e === "hi" ? g.hi : g.lo, over = e === "hi" ? st.phi > b : st.phi < b;
      if (!over) continue;
      const s = (e === "hi" ? g.dhi : g.dlo) * dr;
      const vC = (m * st.v + I * s * st.w) / (m + I * s * s);
      if (!st.blocked) st.v = vC;
      st.phi = b; st.w = s * st.v; st.edge = e;
    }
    st.phi = Math.max(-84, Math.min(0, st.phi));
    st.door = tphi(T.door, st.phi);
  }

  function step(frameDt) {
    const dt = Math.min(0.05, frameDt) * P.tscale;
    const vmax = Math.max(Math.abs(st.v) * 1.5, Math.abs(st.vh) * 1.5, 300, Math.abs(st.vx) + 50);
    let n = Math.ceil(Math.max(vmax * dt / 0.01, dt / 1e-4));
    st.slow = n > 6000; n = Math.min(6000, n);
    for (let i = 0; i < n; i++) { substep(dt / n); trailPoint(); }
    st.latch = latchState();
  }
  function trailPoint() {                                            // pin centre on the cam face (cam frame), per substep
    const z = pz(-st.lift, st.x);
    if (z < -32 || z > 12) return;
    const tr = st.trail, last = tr[tr.length - 1];
    if (!last || Math.abs(last[0] - st.x) + Math.abs(last[1] - z) > 0.04) { tr.push([st.x, z, st.v < 0 ? 1 : 0]); if (tr.length > 4000) tr.shift(); }
  }
  function latchState() {
    const z = pz(-st.lift, st.x);
    if (st.lift <= LATCH.ZTOP * -1 && st.blocked && Math.abs(st.v) < 1 && Math.abs(st.x) < 0.6 && Math.abs(z) < 0.6 && !st.hand) return "latched";
    if (Math.abs(st.lift) < 0.6 && Math.abs(st.x) < 0.6 && !st.hand) return "latched";
    if (st.lift < -0.3) return "overtravel";
    if (st.lift >= LIFT_TOP - 0.05) return "open (strut fully extended)";
    return st.v > 1 ? "rising" : st.v < -1 ? "lowering" : st.blocked ? "stalled" : "free";
  }

  // ------------------------------------------------------------------ hand + setup
  function grab() { st.hand = true; st.target = st.lift; st.vh = 0; }
  function drag(target, vPointer) { st.target = target; st.vh = vPointer || 0; }
  function release() { st.hand = false; st.fHand = 0; st.vh = 0; }
  function scriptedPush(to, v, hold) {                                 // test hook: hand moves to `to` at v, holds, lets go
    grab(); const lead = Math.sign(to - st.lift) * 120 / K_HAND;       // the hand overshoots so the spring can push
    st.script = { phase: "move", to: to + lead, v, hold };
  }
  // tap-to-cycle: the hand carries the carriage through legs at a constant speed, with a gentle
  // accel/decel at each turn; the physics (strut, latch cam, guide, pins) still runs underneath it
  const SEQ_A = 1500;                                                 // mm/s^2, model time
  function seqStep(dt) {
    const q = st.seq, lg = q.legs[q.i];
    if (!lg) { st.seq = null; release(); return; }
    if (lg.hold != null) { if ((q.t += dt) >= lg.hold) { q.i++; q.t = 0; } st.vh = 0; return; }
    if (lg.rel) { release(); q.i++; return; }
    if (lg.to0 == null) { lg.to0 = lg.to + Math.sign(lg.to - st.target) * 2; }   // 2 mm lead so the hand spring can push
    const rem = lg.to0 - st.target, dir = Math.sign(rem);
    const vcap = Math.min(q.v, Math.sqrt(2 * SEQ_A * Math.abs(rem)));
    q.u = Math.min(vcap, (q.u || 0) + SEQ_A * dt);
    const stepd = q.u * dt;
    if (Math.abs(rem) <= stepd || dir === 0) { st.target = lg.to0; st.vh = 0; q.u = 0; q.i++; q.t = 0; return; }
    st.target += dir * stepd; st.vh = dir * q.u;
  }
  // one tap opens, the next closes: below half lift it opens, above it closes and latches
  function cycle(v) {
    st.script = null; grab();
    const legs = [], open = st.lift < LIFT_TOP / 2;
    if (open) {
      if (st.lift < 20) legs.push({ to: -5 }, { hold: 0.12 });          // push into overtravel: the cam lets the pin out
      legs.push({ to: LIFT_TOP }, { hold: 0.15 });
    } else {
      legs.push({ to: -5 }, { hold: 0.15 });
      if (!P.motor) legs.push({ to: 0 });                              // strut off: nothing lifts it onto the latch, the hand does
    }
    legs.push({ rel: true });
    st.seq = { legs, i: 0, t: 0, u: 0, v, open };
  }
  function stopCycle() { if (st.seq) { st.seq = null; release(); } }
  function strutSpeed() {                                             // average 0 -> top speed of a free strut opening, now
    const keep = JSON.parse(JSON.stringify(st)), mo = P.motor;
    P.motor = true; reset("latched"); const ts = P.tscale; P.tscale = 1;
    scriptedPush(-5, 150, 0.1);
    let t = 0, t0 = null, t1 = null;
    for (let i = 0; i < 2000 && t1 === null; i++) { step(0.004); t += 0.004; if (t0 === null && st.lift > 0.5 && !st.hand) t0 = t;
      if (t0 !== null && st.lift >= LIFT_TOP - 0.1) t1 = t; }
    P.tscale = ts; P.motor = mo; Object.assign(st, keep);
    return t0 !== null && t1 !== null && t1 > t0 ? (LIFT_TOP - 0.5) / (t1 - t0) : 185;
  }
  function reset(where) {
    Object.assign(st, { v: 0, hand: false, vh: 0, fHand: 0, vx: 0, vd: 0, fallFrom: null, blocked: false, script: null, seq: null, events: [], clicks: 0, trail: [] });
    st.lift = LIFT_TOP; st.x = -6.0; st.d = TR.pin_max; st.target = st.lift;
    const g0 = bounds(st.lift);                                       // open: the doors are past vertical, on the top edge
    Object.assign(st, { phi: g0.lo, w: 0, edge: "lo", lam: 0 }); st.door = tphi(T.door, st.phi);
    if (where !== "open") {                                           // a real closing push, so the pin sits where it latches
      const ts = P.tscale, mo = P.motor; P.tscale = 1; P.motor = true;   // the strut sets the latch, also in strut-off mode
      scriptedPush(-5, 150, 0.15);
      for (let i = 0; i < 1500 && !(st.latch === "latched" && !st.script && Math.abs(st.v) < 0.5); i++) step(0.004);
      P.tscale = ts; P.motor = mo;
      Object.assign(st, { v: 0, vh: 0, events: [], clicks: 0, t: 0, trail: [] });
    }
    st.latch = latchState();
  }
  return { init, step, reset, grab, drag, release, scriptedPush, cycle, stopCycle, strutSpeed, setMotor, P, STRUT, DESIGN, st, LIFT_TOP, LIFT_BOTTOM, padSurface, strutForce,
    pz, tab: (k, L) => tab(T[k], L), state: st, DOCK, guideAt, relOf, bounds, tphi: (k, ph) => tphi(T[k], ph) };
})();
if (typeof module !== "undefined") module.exports = PHYS;

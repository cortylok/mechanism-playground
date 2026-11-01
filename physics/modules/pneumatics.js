// Mechanism playground - pneumatics (no DOM). Lumped model: two cylinder chambers with a polytropic gas law, ISO 6358
// flow through valve -> tube -> flow control -> cushion, valves switched by the mechanism or a page button.
// Interface units: bar(g) for settings and gauges, mm, mm/s, N. Inside: SI with absolute pressures (Pa).
// This is a lumped model, not CFD: expect stroke times within ~10-20 % with datasheet values; tune C/b and friction to
// one measured stroke for better.
(function (root) {
  const PATM = 101325, R = 287.1, T0 = 293.15, RHO0 = 1.185, BAR = 1e5;

  class PneumaticRangeError extends Error { constructor(m) { super(m); this.name = "PneumaticRangeError"; } }

  // ISO 6358 mass flow (kg/s) from p1 to p2 (Pa abs) through sonic conductance C (dm^3/(s*bar)) and critical
  // pressure ratio b. Negative when p2 > p1 (flow runs backwards). Upstream temperature taken as T0.
  function flow(C, b, p1, p2) {
    if (!(C > 0)) return 0;
    const fwd = p1 >= p2, up = fwd ? p1 : p2, dn = fwd ? p2 : p1;
    const pr = dn / up, psi = pr <= b ? 1 : Math.sqrt(Math.max(0, 1 - ((pr - b) / (1 - b)) ** 2));
    const q = C * 1e-8 * up * RHO0 * psi;                             // C dm^3/(s*bar) -> 1e-8 m^3/(s*Pa)
    return fwd ? q : -q;
  }
  // Elements in series -> one equivalent element (ISO 6358-3 approximation).
  function series(els) {
    const list = els.filter(Boolean);
    if (!list.length) return { C: 0, b: 0.5 };
    if (list.length === 1) return { C: list[0].C, b: list[0].b };
    const C = Math.pow(list.reduce((a, e) => a + 1 / e.C ** 3, 0), -1 / 3);
    const b = 1 - C * C * list.reduce((a, e) => a + (1 - e.b) / e.C ** 2, 0);
    return { C, b: Math.max(0, Math.min(0.99, b)) };
  }
  // Tube estimate (override with datasheet values): S = A / sqrt(1 + 0.02 L/D) mm^2, C = S / 5, b = 0.4.
  function tube({ id, len }) {
    const S = Math.PI * id * id / 4 / Math.sqrt(1 + 0.02 * len / id);
    return { C: S / 5, b: 0.4, vol: Math.PI * id * id / 4 * len };
  }

  // A cylinder driven through a valve. cfg:
  //   supply (bar g), n (polytropic index, default 1.2)
  //   valve: { type: "5/2" | "3/2", C, b, solenoid: "single" | "double" }
  //   tubeA / tubeB: { id, len } (mm) or { C, b, vol } or null
  //   fcA / fcB: { mode: "out" | "in", C, b } flow control with check-valve bypass, or null
  //   cyl: { bore, rod, stroke, deadA, deadB (mm^3), cushion: { len, C, b } | null, friction: { static, dynamic } | null }
  // Chamber A = cap end (pressure extends the rod), B = rod end. x = rod extension (mm, 0 = retracted).
  function system(cfg) {
    const c = cfg.cyl, n = cfg.n || 1.2;
    const Acap = Math.PI * c.bore * c.bore / 4, Aann = Acap - Math.PI * c.rod * c.rod / 4;
    const mkTube = (t) => (!t ? null : t.C ? t : tube(t));
    const tA = mkTube(cfg.tubeA), tB = mkTube(cfg.tubeB);
    const single = cfg.valve.type === "3/2";
    const S = {
      cfg, Acap, Aann,
      psup: (cfg.supply || 6) * BAR + PATM,
      st: { pA: PATM, pB: PATM, valve: false, qA: 0, qB: 0 },
    };
    S.st.pB = single ? PATM : S.psup;                                  // valve off: B on supply, A exhausted

    const deadA = (c.deadA != null ? c.deadA : 0.02 * Acap * c.stroke) + (tA ? tA.vol || 0 : 0);
    const deadB = (c.deadB != null ? c.deadB : 0.02 * Aann * c.stroke) + (tB ? tB.vol || 0 : 0);
    S.setValve = (on) => { S.st.valve = !!on; };
    function path(side, dir, x) {                                      // elements between the chamber and the valve port
      const t = side === "A" ? tA : tB, fc = side === "A" ? cfg.fcA : cfg.fcB, cu = c.cushion;
      const els = [cfg.valve, t];
      if (fc && fc.mode === dir) els.push(fc);                         // the other direction runs through the check valve
      if (cu && dir === "out" && (side === "A" ? x <= cu.len : x >= c.stroke - cu.len)) els.push(cu);
      return series(els);
    }
    function chamber(side, x, v, dt) {
      const key = side === "A" ? "pA" : "pB", p = S.st[key];
      const toSupply = side === "A" ? S.st.valve : !S.st.valve;
      const src = toSupply ? S.psup : PATM;
      const V = (side === "A" ? deadA + Acap * x : deadB + Aann * (c.stroke - x)) * 1e-9;
      const dV = (side === "A" ? Acap * v : -Aann * v) * 1e-9;
      const el = path(side, src >= p ? "in" : "out", x);
      const qm = flow(el.C, el.b, src, p);                            // + into the chamber
      let pn = p + (n / V) * R * T0 * qm * dt;
      if ((qm > 0 && pn > src) || (qm < 0 && pn < src)) pn = src;      // flow alone cannot carry p past its source
      pn += -(n * p / V) * dV * dt;
      if (!Number.isFinite(pn) || pn <= 0 || pn > 5 * S.psup)
        throw new PneumaticRangeError(`chamber ${side}: ${(pn / BAR).toFixed(3)} bar(a) is not physical - check volumes, C and dt`);
      S.st[key] = pn; S.st[side === "A" ? "qA" : "qB"] = qm;
    }
    // advance both chambers by dt at rod position x (mm) and speed v (mm/s)
    S.step = (x, v, dt) => {
      for (const k of ["pA", "pB"]) if (!Number.isFinite(S.st[k]) || S.st[k] <= 0)
        throw new PneumaticRangeError(`chamber ${k[1]}: ${S.st[k]} Pa(a) is not physical`);
      chamber("A", x, v, dt);
      if (single) S.st.pB = PATM; else chamber("B", x, v, dt);
    };
    S.force = () => ((S.st.pA - PATM) * Acap - (S.st.pB - PATM) * Aann) * 1e-6;   // N on the rod, + extends
    S.friction = (v) => (c.friction ? (Math.abs(v) < 0.5 ? c.friction.static : c.friction.dynamic) : 0);
    S.gauges = () => ({ A: (S.st.pA - PATM) / BAR, B: (S.st.pB - PATM) / BAR,
      qA: S.st.qA / RHO0 * 60000, qB: S.st.qB / RHO0 * 60000 });          // bar(g), NL/min
    return S;
  }

  const PNEUMATICS = { flow, series, tube, system, PATM, BAR, PneumaticRangeError };
  if (typeof module !== "undefined" && module.exports) module.exports = PNEUMATICS; else root.PNEUMATICS = PNEUMATICS;
})(typeof window !== "undefined" ? window : globalThis);

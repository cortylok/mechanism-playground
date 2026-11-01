// S3 side table: adapter between the S3 physics (physics.js above, its own engine: carriage lift + knob-in-guide arm
// angle + latch arm + latch pin + dock pins) and the generic playground page. build.py joins physics.js + this file.
const D = DATA, st = PHYS.st;
let ready = null;
async function initPhysics() {                               // node-safe: decode the latch map, init the tables
  if (ready) return ready;
  ready = (async () => {
    const track = Object.assign({}, D.track, { tip: new Uint8Array(await BUNDLE.inflate(D.track.tip)) });
    PHYS.init({ phys: D.phys, track });
  })();
  return ready;
}
// the generic page talks to a "sim": q, v, step, grab/drag/release, reset, tscale, P, events
let onEvent = null, nEv = 0;
const sim = {
  get q() { return [st.lift, st.phi, st.x, st.d]; },
  get v() { return [st.v, st.w, st.vx, st.vd]; },
  get t() { return st.t; }, get slow() { return st.slow; }, get hand() { return st.hand; }, get fHand() { return st.fHand; },
  get events() { return st.events; }, P: PHYS.P,
  get tscale() { return PHYS.P.tscale; }, set tscale(v) { PHYS.P.tscale = v; },
  set onEvent(f) { onEvent = f; }, get onEvent() { return onEvent; },
  grabDof: { dof: 0 },
  grab: () => PHYS.grab(), drag: (t, v) => PHYS.drag(t, v), release: () => PHYS.release(),
  step: (dt) => {
    PHYS.step(dt);
    if (st.events.length !== nEv) { const e = st.events[st.events.length - 1]; nEv = st.events.length; if (e && onEvent) onEvent(e); }
  },
  reset: (where) => { PHYS.reset(where || "latched"); nEv = st.events.length; },
};

// ---------------------------------------------------------------- poses (from the S3 page's pose())
const LF = D.latch, PIV = [LF.frame[0], 0, LF.frame[2] + LF.pivot_z];
const lerpT = (T, u) => { const j = Math.floor(u), q = u - j, lp = (a) => a[j] + (a[j + 1] - a[j]) * q; return [lp(T.ang), lp(T.dy), lp(T.dz)]; };
const scaleY = (y0, s) => [1, 0, 0, 0, 0, s, 0, 0, 0, 0, 1, 0, 0, y0 * (1 - s), 0, 1];   // scale y by s about y = y0
const pinIdx = {};
function pose() {
  const L = st.lift, out = {}, rise = Math.max(0, Math.min(D.phys.slide, L));
  const phiL = -Math.asin(Math.max(-1, Math.min(1, st.x / LF.L)));
  const arm = MAT4.mul(MAT4.translate(PIV), MAT4.mul(MAT4.rotate([0, 1, 0], phiL), MAT4.translate([-PIV[0], 0, -PIV[2]])));
  const carr = MAT4.translate([0, 0, L]);
  for (const p of D.parts) {
    const mo = p.motion;
    if (mo.kind === "carriage") out[p.id] = carr;
    else if (mo.kind === "link") {
      const T = D.linksPhi[mo.side][mo.link], u = Math.max(0, Math.min(T.ang.length - 1.000001, st.phi / D.phiStep));
      const [a, dy, dz] = lerpT(T, u);
      out[p.id] = MAT4.mul(MAT4.translate([0, dy, dz + rise]), MAT4.rotate([1, 0, 0], a));
    } else if (mo.kind === "latch-arm") out[p.id] = arm;
    else if (mo.kind === "latch-pin") out[p.id] = MAT4.mul(arm, MAT4.translate([0, D.track.pin_max - st.d, 0]));
    else if (mo.kind === "latch-spring") {
      const s = (mo.y_fixed - (mo.y_free0 + D.track.pin_max - st.d)) / mo.len0;
      out[p.id] = MAT4.mul(arm, scaleY(mo.y_fixed, s));
    } else if (mo.kind === "dock-pin") {
      if (!(p.id in pinIdx)) pinIdx[p.id] = PHYS.DOCK.pins.findIndex(([x, z]) => Math.abs(x - mo.x) < 0.01 && Math.abs(z - mo.z) < 0.01);
      out[p.id] = MAT4.translate([0, -(pinIdx[p.id] >= 0 ? st.pinC[pinIdx[p.id]] : 0), 0]);
    }
  }
  return out;
}

// ---------------------------------------------------------------- latch inset (from the S3 page): cam face seen from the pin,
// pin + its recent path. Built in the page only (it needs a canvas).
let faceImg = null;
const RAMP = [[1.6, [244, 211, 94]], [2.4, [240, 138, 75]], [3.0, [79, 179, 169]], [3.5, [61, 127, 214]], [3.95, [91, 63, 196]]];
function rampC(d) {
  if (d <= RAMP[0][0]) return RAMP[0][1];
  for (let i = 1; i < RAMP.length; i++) if (d <= RAMP[i][0]) { const t = (d - RAMP[i - 1][0]) / (RAMP[i][0] - RAMP[i - 1][0]); return RAMP[i - 1][1].map((c, j) => c + (RAMP[i][1][j] - c) * t); }
  return RAMP[RAMP.length - 1][1];
}
async function buildFace() {
  const tr = D.track, face = new Uint8Array(await BUNDLE.inflate(tr.face)), nx = tr.face_nx, nz = tr.face_nz;
  const c = document.createElement("canvas"); c.width = nx; c.height = nz;
  const g = c.getContext("2d"), im = g.createImageData(nx, nz);
  const Dp = (i, j) => face[Math.min(nz - 1, Math.max(0, j)) * nx + Math.min(nx - 1, Math.max(0, i))] / 25;
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const d = Dp(i, j), k = 4 * ((nz - 1 - j) * nx + i);
    if (d >= 8.9) { im.data[k + 3] = 0; continue; }
    const rgb = d >= 7.9 ? [42, 45, 48] : d < 0.05 ? [198, 202, 205] : rampC(d);
    const gx = Dp(i + 1, j) - Dp(i - 1, j), gz = Dp(i, j + 1) - Dp(i, j - 1);
    const sh = d >= 7.9 ? 1 : Math.max(0.55, Math.min(1.25, 1 + 0.9 * (gx * 0.6 - gz * 0.8)));
    im.data[k] = rgb[0] * sh; im.data[k + 1] = rgb[1] * sh; im.data[k + 2] = rgb[2] * sh; im.data[k + 3] = 255;
  }
  g.putImageData(im, 0, 0); faceImg = c;
}
function drawLatch(lg, W, H, _sim, css, dpr) {
  const tr = D.track;
  lg.fillStyle = css("--scene"); lg.fillRect(0, 0, W, H);
  const xl = tr.face_x0, xr = tr.face_x0 + tr.face_nx * tr.face_res, zb = tr.face_z0, zt = tr.face_z0 + tr.face_nz * tr.face_res + 4;
  const k = Math.min(W / (xr - xl), H / (zt - zb)), cx = W / 2 + ((xl + xr) / 2) * k, cy = H / 2 + ((zb + zt) / 2) * k;
  const sx = (x) => cx - x * k, sy = (z) => cy - z * k;
  if (faceImg) { lg.save(); lg.setTransform(-k * tr.face_res, 0, 0, k * tr.face_res, cx - k * tr.face_x0, sy(tr.face_z0 + tr.face_nz * tr.face_res)); lg.drawImage(faceImg, 0, 0); lg.restore(); }
  lg.lineWidth = Math.max(1.5 * dpr, k * 0.45); lg.lineJoin = "round";
  const trail = st.trail;
  for (let i = 1; i < trail.length; i++) {
    const a = trail[i - 1], b = trail[i];
    lg.strokeStyle = b[2] ? css("--accent") : css("--warn"); lg.globalAlpha = 0.15 + 0.75 * (i / trail.length);
    lg.beginPath(); lg.moveTo(sx(a[0]), sy(a[1])); lg.lineTo(sx(b[0]), sy(b[1])); lg.stroke();
  }
  lg.globalAlpha = 1;
  const z = PHYS.pz(-st.lift, st.x), below = z < zb + 1, shade = Math.max(0, Math.min(1, (st.d - 1.5) / 2.4));
  lg.fillStyle = `rgb(${230 - 170 * shade},${232 - 170 * shade},${235 - 170 * shade})`; lg.strokeStyle = css("--ink"); lg.lineWidth = 1.2 * dpr;
  lg.beginPath(); lg.arc(sx(st.x), sy(Math.max(zb + 1, Math.min(z, zt - 1))), 2 * k, 0, 7); lg.fill(); lg.stroke();
  return below ? `pin below the cam: carriage up (lift ${st.lift.toFixed(0)})` : `pin depth ${st.d.toFixed(2)} of ${tr.pin_max} · arm ${st.x.toFixed(2)} mm`;
}

const keyHolds = () => { const b = PHYS.bounds(st.lift), g = PHYS.guideAt(PHYS.relOf(st.lift)); return b.lo > g.lo + 1e-6; };
const design = Object.assign({}, PHYS.DESIGN); delete design.tscale;
return {
  PHYS, initPhysics,
  createSim: () => sim,
  dofs: [{ key: "lift", label: "Lift", unit: "mm" }, { key: "phi", label: "Lower arm", unit: "deg" }, { key: "x", label: "Latch arm", unit: "mm" }, { key: "d", label: "Pin depth", unit: "mm" }],
  mass: () => [1], forces: () => [0],
  design,
  hand: { groups: ["upper", "lower", "contents", "carriage", "strut", "cables", "latch"], axis: [0, 0, 1] },
  pageInit: async () => { await initPhysics(); await buildFace(); },
  pose: () => pose(),
  inset: { title: "Latch path · seen from the pin", draw: drawLatch },
  resets: [{ label: "Reset: latched", where: "latched" }, { label: "Reset: open", where: "open" }],
  buttons: [{ label: "Gas strut", press: () => { PHYS.release(); PHYS.setMotor(!PHYS.P.motor); }, active: () => PHYS.P.motor,
    text: () => (PHYS.P.motor ? "Gas strut: on" : "Gas strut: off (positions hold)") }],
  settings: [["contents", "Contents (bat, knife, torch), kg", 0.05, 0], ["strut", "Strut force at full extension, N", 1, 0], ["prog", "Strut progression (F2/F1)", 0.01, 1],
    ["halves", "Printed upper + lower (ASA), kg", 0.05, 0], ["hardware", "Rail blocks, strut body, electrics, screws, kg", 0.01, 0], ["blockDrag", "Rail block drag, both, N", 0.1, 0],
    ["pivot", "Pivot drag per joint, N·mm", 0.5, 0], ["armFric", "Latch arm friction at the pin, N", 0.01, 0]],
  hud: () => ({ big: st.lift.toFixed(1) + " mm", state: st.latch + (PHYS.P.motor ? "" : " · strut off"),
    chips: [{ label: "Pad A · torch charging", on: st.padA }, { label: "Pad B · LED on", on: st.padB }] }),
  readouts: () => [["Lift", st.lift.toFixed(1) + " mm"], ["Speed", Math.round(st.v) + " mm/s"], ["Hand", Math.round(st.fHand) + " N"],
    ["Strut", Math.round(st.fStrut) + " N"], ["Latch", st.latch], ["Arm swing at pin", st.x.toFixed(2) + " mm"], ["Doors", Math.max(0, st.door).toFixed(1) + "°"],
    ["Knob in guide", st.edge === "hi" ? "on the cam (bottom edge)" : st.edge === "lo" ? (keyHolds() ? "held by the keyway" : "on the top edge") : PHYS.P.motor ? "free (swinging)" : "free (no gravity: stays)"],
    ["Latch clicks", String(st.clicks)]],
  eventText: (e) => (e.kind === "click" ? `CLICK · ${e.val.toFixed(1)} mm drop` : e.kind === "top" ? `TOP-OUT · ${Math.round(e.val)} mm/s` : null),
};

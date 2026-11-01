// node examples/s3-side-table/test.js - the S3 physics suite (from the original project), run through the bundle loader
const fs = require("fs"), path = require("path");
const BUNDLE = require("../../physics/bundle.js");
const { check, done } = require("../../tests/_lib.js");
const data = JSON.parse(fs.readFileSync(path.join(__dirname, "data", "data.json"), "utf8"));
const mech = ["physics.js", "adapter.js"].map((f) => fs.readFileSync(path.join(__dirname, f), "utf8")).join("\n");
(async () => {
  const M = BUNDLE.makeMech({ data, mech, config: {} });
  await M.initPhysics();
  const PHYS = M.PHYS;
  function fresh(over) { Object.assign(PHYS.P, over || {}); PHYS.reset("latched"); return PHYS; }
  function run(S, secs, every) { const n = Math.round(secs / 0.004); for (let i = 0; i < n; i++) { S.step(0.004); if (every) every(S.st); } }

  let S = fresh(); run(S, 1.0);
  check("rests latched", S.st.latch === "latched" && Math.abs(S.st.lift) < 0.7, `lift ${S.st.lift.toFixed(3)} latch ${S.st.latch}`);
  S = fresh(); let vmax = 0, tTop = null, t = 0;
  S.scriptedPush(-5, 100, 0.2);
  run(S, 4.0, (st) => { t += 0.004; vmax = Math.max(vmax, st.v); if (tTop === null && st.lift > S.LIFT_TOP - 0.5) tTop = t; });
  check("push releases and the strut opens it", tTop !== null && tTop < 3.0, `top ${S.st.lift.toFixed(1)} at ${tTop && tTop.toFixed(2)} s, max speed ${vmax.toFixed(0)} mm/s`);
  check("opening speed is damped (<= 300 mm/s)", vmax <= 300, `${vmax.toFixed(0)} mm/s`);
  S.grab(); S.drag(200); run(S, 0.6);
  check("pad B (LED) contact when held at lift 200", S.st.padB && !S.st.padA, `lift ${S.st.lift.toFixed(2)} padA ${S.st.padA} padB ${S.st.padB}`);
  S.release();
  S = fresh(); S.reset("open"); S.scriptedPush(-5, 150, 0.15); run(S, 6.0);
  check("push down from open latches", S.st.latch === "latched", `lift ${S.st.lift.toFixed(2)} latch ${S.st.latch} arm x ${S.st.x.toFixed(2)}`);
  check("pad A (charging) contact when latched", S.st.padA && !S.st.padB, `padA ${S.st.padA} padB ${S.st.padB}`);
  S = fresh(); S.reset("open"); S.scriptedPush(1.5, 150, 0.15); run(S, 6.0);
  check("short push does not latch", S.st.latch !== "latched" && S.st.lift > S.LIFT_TOP - 1, `lift ${S.st.lift.toFixed(1)} latch ${S.st.latch}`);
  const openTime = (contents) => { const s = fresh({ contents }); let tt = 0, hit = null; s.scriptedPush(-5, 100, 0.2);
    run(s, 6.0, (st) => { tt += 0.004; if (hit === null && st.lift > s.LIFT_TOP - 0.5) hit = tt; }); return hit; };
  const te = openTime(0), tl = openTime(2.45);
  check("opens empty and loaded, empty faster", te !== null && tl !== null && te < tl, `empty ${te && te.toFixed(2)} s, loaded ${tl && tl.toFixed(2)} s`);
  S = fresh(); const upEdges = new Set(), downEdges = new Set(); let doorMax = 0, lagged = 0;
  S.scriptedPush(-5, 100, 0.2);
  run(S, 4.0, (st) => { if (st.v > 5 && st.door < 85) upEdges.add(st.edge || "free"); doorMax = Math.max(doorMax, st.door); });
  check("opening: knob on the cam (bottom edge) below 90 deg", upEdges.size === 1 && upEdges.has("hi"), `edges seen ${[...upEdges]} door max ${doorMax.toFixed(1)}`);
  S.scriptedPush(-5, 150, 0.15);
  const cam = (L) => { const g = S.guideAt(S.relOf(L)); return S.tphi("door", g.hi); };
  run(S, 6.0, (st) => { if (st.v < -5 && st.door > 95) downEdges.add(st.edge || "free"); if (st.v < -5 && st.lift > 40) lagged = Math.max(lagged, st.door - cam(st.lift)); });
  check("closing: knob on the top edge while the doors are past vertical", downEdges.size === 1 && downEdges.has("lo"), `edges seen ${[...downEdges]}`);
  check("closing: doors lag the opening path (more open)", lagged > 1.0, `largest lag ${lagged.toFixed(1)} deg`);
  check("latched again with the doors shut", S.st.latch === "latched" && S.st.door < 0.5, `latch ${S.st.latch} door ${S.st.door.toFixed(2)} deg edge ${S.st.edge}`);
  S = fresh(); S.setMotor(false);
  S.grab(); S.drag(-5); run(S, 0.5); S.drag(120); run(S, 1.5); S.release();
  const at = { lift: S.st.lift, door: S.st.door }; run(S, 3.0);
  check("strut off: lifted by hand and let go, it stays", Math.abs(at.lift - 120) < 0.5 && Math.abs(S.st.lift - at.lift) < 1e-9 && Math.abs(S.st.door - at.door) < 1e-9,
    `lift ${at.lift.toFixed(2)} -> ${S.st.lift.toFixed(2)}, doors ${at.door.toFixed(1)} -> ${S.st.door.toFixed(1)} deg`);
  check("strut off: the doors are open at lift 120", at.door > 80, `doors ${at.door.toFixed(1)} deg`);
  S.grab(); S.drag(60); run(S, 1.0); S.release(); const mid = S.st.door; run(S, 2.0);
  check("strut off: part-closed doors stay put", Math.abs(S.st.door - mid) < 1e-9, `lift ${S.st.lift.toFixed(1)} doors ${mid.toFixed(1)} deg`);
  S.grab(); S.drag(-6); run(S, 1.0); S.drag(5); run(S, 1.0); S.release(); run(S, 1.0);
  check("strut off: lowered by hand it latches with the doors shut", S.st.latch === "latched" && S.st.door < 0.5 && Math.abs(S.st.lift) < 0.7,
    `lift ${S.st.lift.toFixed(2)} latch ${S.st.latch} doors ${S.st.door.toFixed(2)} deg`);
  S.setMotor(true);
  S = fresh(); S.reset("open"); S.st.lift = 100; S.step(0.004);
  check("no pad contact at lift 100", !S.st.padA && !S.st.padB, `padA ${S.st.padA} padB ${S.st.padB}`);
  const P = M.pose(), bad = Object.entries(P).filter(([, m]) => m.length !== 16 || m.some((v) => !Number.isFinite(v)));
  check("pose() gives every moving part a finite 4x4", Object.keys(P).length > 100 && !bad.length, `${Object.keys(P).length} parts posed, ${bad.length} bad`);
  done();
})();

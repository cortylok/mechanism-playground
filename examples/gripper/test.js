// node projects/gripper/test.js - gripper behaviour checks
const fs = require("fs"), path = require("path");
const ROOT = path.join(__dirname, "..", "..");
const BUNDLE = require(path.join(ROOT, "physics", "bundle.js")), CORE = require(path.join(ROOT, "physics", "core.js"));
const { check, done } = require(path.join(ROOT, "tests", "_lib.js"));
const data = JSON.parse(fs.readFileSync(path.join(__dirname, "out", "data.json"), "utf8"));
const mech = ["linkage.js", "mechanism.js"].map((f) => fs.readFileSync(path.join(__dirname, f), "utf8")).join("\n");
function fresh(P) { const M = BUNDLE.makeMech({ data, mech, config: {} }); const s = CORE.create(M); Object.assign(s.P, P || {}); s.reset(); return [s, M]; }
const run = (s, secs) => { for (let i = 0; i < Math.round(secs / 0.004); i++) s.step(0.004); };

let [s, M] = fresh(); M.setMotor(-1); run(s, 4);
const F = M.contact(s.q[0], s.P), x = s.q[0];
check("Close on the 50 mm object: it stops gripping", F > 1 && x > 0.5 && Math.abs(s.v[0]) < 0.5, `x ${x.toFixed(2)} mm, grip ${F.toFixed(1)} N per jaw, gap ${M.tipGap(x).toFixed(1)} mm`);
const h = 0.01;
const Qc = 2 * F * ((M.contact(x - h, s.P) - M.contact(x + h, s.P)) / (2 * h)) / s.P.objK;  // 2 F d(dmin)/dx
check("force balance: screw push = 2 x grip x d(notch)/dx within the friction", Math.abs(M.screwForce(s.P) + Qc) <= s.P.hold + s.P.guide + 1,
  `screw ${M.screwForce(s.P).toFixed(0)} N, contact ${Qc.toFixed(0)} N`);
const [s2, M2] = fresh({ torque: 800 }); M2.setMotor(-1); run(s2, 4);
const F2 = M2.contact(s2.q[0], s2.P);
check("twice the motor torque: about twice the grip", F2 / F > 1.7 && F2 / F < 2.4, `${F.toFixed(1)} -> ${F2.toFixed(1)} N per jaw`);
[s, M] = fresh({ objD: 0 }); M.setMotor(-1); run(s, 6);
check("no object: closes to the stop", s.q[0] === 0, `x ${s.q[0].toFixed(3)} mm, gap ${M.tipGap(s.q[0]).toFixed(1)} mm`);
M.setMotor(1); run(s, 8);
check("Open: back to the 30 mm stop", s.q[0] === 30, `x ${s.q[0].toFixed(2)} mm`);
[s, M] = fresh({ objD: 0 }); s.scriptedPush(20, 40, 0.3); run(s, 3);
check("by hand (motor stopped): a push moves the slider and it stays (screw friction)", s.q[0] < 25 && s.q[0] > 15, `x ${s.q[0].toFixed(2)} mm`);
// closing on the object must not ring (the bounce corty saw: an undamped contact with a motor that had no speed limit)
function closeOn(P) {
  const [c, Mc] = fresh(P); Mc.setMotor(-1); let hit = false, flips = 0, last = 0, peak = 0;
  for (let i = 0; i < 1500; i++) { c.step(0.002); const f = Mc.contact(c.q[0], c.P);
    if (f > 0) hit = true; if (!hit) continue; peak = Math.max(peak, f);
    const sg = Math.sign(c.v[0]); if (sg && last && sg !== last) flips++; if (sg) last = sg; }
  return { flips, peak, final: Mc.contact(c.q[0], c.P) };
}
let r = closeOn();
check("design motor (300 rpm): closes on the object without a bounce", r.flips <= 1 && r.peak <= 1.2 * r.final, `${r.flips} reversals, peak ${r.peak.toFixed(0)} N, final ${r.final.toFixed(0)} N`);
r = closeOn({ rpm: 5000 });
check("fast motor (5000 rpm): the contact damping stops it in one swing", r.flips <= 2, `${r.flips} reversals, impact peak ${r.peak.toFixed(0)} N, final ${r.final.toFixed(0)} N`);
const mt = M.massT; let okM = true; for (const v of mt.M) okM = okM && Number.isFinite(v) && v > 0;
check("mass table finite and positive", okM, `${mt.M[4].toFixed(2)} .. ${mt.M[mt.M.length - 5].toFixed(2)} kg`);
done();

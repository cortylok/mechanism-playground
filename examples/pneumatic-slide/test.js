// node examples/pneumatic-slide/test.js - cylinder + valve + flow controls + cushions
const fs = require("fs"), path = require("path");
const BUNDLE = require("../../physics/bundle.js"), CORE = require("../../physics/core.js");
const { check, done } = require("../../tests/_lib.js");
const data = JSON.parse(fs.readFileSync(path.join(__dirname, "out", "data.json"), "utf8"));
const mech = fs.readFileSync(path.join(__dirname, "mechanism.js"), "utf8");
function fresh(P) { const M = BUNDLE.makeMech({ data, mech, config: {} }); const s = CORE.create(M); Object.assign(s.P, P || {}); s.reset(); return [s, M]; }
// run until cond or timeout; returns time (s) or null
function until(s, cond, secs, every) { let t = 0; while (t < secs) { s.step(0.002); t += 0.002; if (every) every(s); if (cond(s)) return t; } return null; }
function stroke(P) {
  const [s, M] = fresh(P); until(s, () => false, 0.3);           // settle retracted
  M.pn.setValve(true); let vEnd = 0;
  const t = until(s, (x) => x.q[0] >= 99.9, 5, (x) => { if (x.q[0] > 95) vEnd = Math.max(vEnd, x.v[0]); });
  return { t, vEnd, s, M };
}
const a = stroke();
check("valve on: extends to full stroke", a.t !== null, `t ${a.t && a.t.toFixed(3)} s`);
a.M.pn.setValve(false);
const tr = until(a.s, (x) => x.q[0] <= 0.1, 5);
check("valve off: retracts", tr !== null, `t ${tr && tr.toFixed(3)} s`);
const slow = stroke({ fcB: 0.05 }), fast = stroke({ fcB: 0.4 });
check("extend time falls as the meter-out opens", slow.t > fast.t * 1.3, `C 0.05: ${slow.t && slow.t.toFixed(3)} s, C 0.4: ${fast.t && fast.t.toFixed(3)} s`);
const cu = stroke({ cushion: 15 }), nc = stroke({ cushion: 0 });
check("cushion lowers the end speed", cu.vEnd < nc.vEnd * 0.7, `with ${cu.vEnd.toFixed(0)} mm/s, without ${nc.vEnd.toFixed(0)} mm/s`);
const st = stroke({ supply: 1, load: 300 });
check("1 bar with a 300 N load stalls", st.t === null && st.s.q[0] < 5, `x ${st.s.q[0].toFixed(1)} mm`);
const g = a.M.pn.gauges();
check("pressures stay inside 0 .. supply at rest", g.A >= -0.01 && g.B <= 6.01, `A ${g.A.toFixed(2)} B ${g.B.toFixed(2)} bar(g)`);
done();

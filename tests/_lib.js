// Tiny test helpers shared by tests/*.test.js and examples/*/test.js.
let fails = 0;
function check(name, ok, info) { console.log(`${ok ? "PASS" : "FAIL"}  ${name}  ${info == null ? "" : info}`); if (!ok) fails++; }
const near = (a, b, rel) => Math.abs(a - b) <= Math.abs(b) * rel;
function done() { console.log(fails ? `${fails} FAILED` : "all passed"); process.exit(fails ? 1 : 0); }
function run(sim, secs, every, dt = 0.004) { const n = Math.round(secs / dt); for (let i = 0; i < n; i++) { sim.step(dt); if (every) every(sim); } }
// period from upward zero crossings of f(sim), linear interpolation between frames
function period(sim, f, secs, dt = 0.001) {
  const ups = []; let prev = f(sim), t = 0;
  for (let i = 0; i < Math.round(secs / dt); i++) {
    sim.step(dt); t += dt; const cur = f(sim);
    if (prev < 0 && cur >= 0) ups.push(t - dt + dt * (-prev) / (cur - prev));
    prev = cur;
  }
  return ups.length > 1 ? (ups[ups.length - 1] - ups[0]) / (ups.length - 1) : NaN;
}
module.exports = { check, near, done, run, period };

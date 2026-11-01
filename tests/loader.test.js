// node tests/loader.test.js - bundle checks and mechanism loading (needs the built bundles: py build/build.py <examples>)
const fs = require("fs"), path = require("path");
const BUNDLE = require("../physics/bundle.js"), CORE = require("../physics/core.js");
const { check, done } = require("./_lib.js");
const dist = path.join(__dirname, "..", "dist");
const names = ["starter", "pneumatic-slide", "s3-side-table"];
(async () => {
  for (const n of names) {
    const f = path.join(dist, `${n}.playground.json`);
    if (!fs.existsSync(f)) { check(`bundle ${n} built`, false, "missing - run py build/build.py examples/" + n); continue; }
    const B = JSON.parse(fs.readFileSync(f, "utf8"));
    check(`bundle ${n}: format accepted`, BUNDLE.check(B) === null, B.format);
    const M = BUNDLE.makeMech(B);
    let err = null;
    try {
      if (M.initPhysics) await M.initPhysics();
      const sim = M.createSim ? M.createSim() : CORE.create(M);
      sim.reset(M.resets && M.resets[0] ? M.resets[0].where : undefined);
      for (let i = 0; i < 250; i++) sim.step(0.004);
      if (M.pose) { const P = M.pose(sim); for (const m of Object.values(P)) if (m.length !== 16 || m.some((v) => !Number.isFinite(v))) throw new Error("bad pose matrix"); }
      if (M.readouts) M.readouts(sim);
    } catch (e) { err = e; }
    check(`bundle ${n}: mechanism runs 1 s, poses and readouts finite`, !err, err ? err.message : "ok");
  }
  const base = { format: "mechanism-playground/1", name: "x", data: { parts: [] }, mech: "return {}" };
  check("rejects a file that is not a bundle", /not a playground bundle/.test(BUNDLE.check({ hello: 1 })), BUNDLE.check({ hello: 1 }));
  check("rejects a newer major format with a clear message", /needs a newer playground/.test(BUNDLE.check(Object.assign({}, base, { format: "mechanism-playground/2" }))),
    BUNDLE.check(Object.assign({}, base, { format: "mechanism-playground/2" })));
  check("rejects a bundle without mechanism code", /no mechanism code/.test(BUNDLE.check(Object.assign({}, base, { mech: "" }))), "");
  let msg = ""; try { BUNDLE.makeMech(base); } catch (e) { msg = e.message; }
  check("rejects mechanism code that returns no dofs", /dofs/.test(msg), msg);
  msg = ""; try { BUNDLE.makeMech(Object.assign({}, base, { mech: "return { dofs: [{}] }" })); } catch (e) { msg = e.message; }
  check("rejects mechanism code without mass()/forces()", /mass\(\) and forces\(\)/.test(msg), msg);
  done();
})();

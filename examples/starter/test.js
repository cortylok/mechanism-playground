// node examples/starter/test.js - lid on a gas strut
const fs = require("fs"), path = require("path");
const BUNDLE = require("../../physics/bundle.js"), CORE = require("../../physics/core.js");
const { check, done, run } = require("../../tests/_lib.js");
const data = JSON.parse(fs.readFileSync(path.join(__dirname, "out", "data.json"), "utf8"));
const mech = fs.readFileSync(path.join(__dirname, "mechanism.js"), "utf8");
const fresh = (P) => { const M = BUNDLE.makeMech({ data, mech, config: {} }); const s = CORE.create(M); Object.assign(s.P, P || {}); s.reset(); return [s, M]; };
const liftTo = (s, deg) => { s.grab(); s.drag(deg); run(s, 1.5); s.release(); };

let [s, M] = fresh();
const lid = data.parts.find((p) => p.id === "lid");
check("mass table: lid inertia about the hinge = m (D^2 + T^2)/12 + m r^2", Math.abs(M.table.M[0] / (lid.mass * 30048) - 1) < 0.01, `${M.table.M[0].toFixed(0)} vs ${(lid.mass * 30048).toFixed(0)} kg mm^2`);
run(s, 2.0);
check("design strut: the shut lid stays shut", s.q[0] < 0.5, `angle ${s.q[0].toFixed(2)}°`);
liftTo(s, 80); run(s, 3.0);
check("design strut: lifted past the balance angle it opens to the stop", s.q[0] > 94.9, `angle ${s.q[0].toFixed(1)}°`);
[s] = fresh({ F1: 10 }); liftTo(s, 80); run(s, 3.0);
check("weak strut (10 N): lifted to 80° it falls shut", s.q[0] < 0.5, `angle ${s.q[0].toFixed(1)}°`);
[s, M] = fresh(); liftTo(s, 45);
const net = M.table.at(s.q[0]).Q + M.strutTorque(s.q[0], 0, s.P), a0 = s.q[0]; run(s, 0.3);
check("let go at 45°: it moves the way the net torque says", Math.sign(s.q[0] - a0) === Math.sign(net), `net ${(net / 1000).toFixed(2)} N m, moved ${(s.q[0] - a0).toFixed(1)}°`);
done();

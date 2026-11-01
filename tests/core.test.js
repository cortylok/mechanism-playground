// node tests/core.test.js - generic N-DOF physics core
const CORE = require("../physics/core.js");
const { check, near, done, run, period } = require("./_lib.js");
const dof = (o) => Object.assign({ key: "x", unit: "mm", min: -1e6, max: 1e6, q0: 0 }, o);

// 1 free fall 0.2 s: 0.5 g t^2 = 196.2 mm
let s = CORE.create({ dofs: [dof()], mass: () => [1], forces: () => [-9.81] });
run(s, 0.2);
check("free fall 0.2 s", near(-s.q[0], 196.2, 0.005), `${(-s.q[0]).toFixed(2)} mm (196.20)`);

// 2 spring-mass period: m 1 kg, k 1 N/mm -> 2 pi sqrt(1/1000) = 0.19869 s
const spring = (k) => ({ dofs: [dof({ q0: 10 })], mass: () => [1], forces: (q) => [-k * q[0]] });
s = CORE.create(spring(1));
const T = period(s, (x) => x.q[0], 2.0);
check("spring-mass period", near(T, 0.19869, 0.005), `${T.toFixed(5)} s (0.19869)`);

// 3 energy at zero damping over 10 periods
s = CORE.create(spring(1));
const E = (x) => 0.5 * 1 * (x.v[0] / 1000) ** 2 + 0.5 * 1 * x.q[0] ** 2 / 1000;
const E0 = E(s); let worst = 0;
run(s, 2.0, (x) => { worst = Math.max(worst, Math.abs(E(x) - E0) / E0); }, 0.001);
check("energy drift < 0.5 % over 10 periods", worst < 0.005, `${(worst * 100).toFixed(3)} %`);

// 4 inelastic stop
s = CORE.create({ dofs: [dof({ max: 10 })], mass: () => [1], forces: () => [500] });
run(s, 1.0);
check("inelastic stop", s.q[0] === 10 && s.v[0] === 0 && s.events.some((e) => e.kind === "stop"), `q ${s.q[0]} v ${s.v[0]} events ${s.events.length}`);

// 5 Coulomb stick
s = CORE.create({ dofs: [dof()], mass: () => [1], forces: () => [1], friction: () => [2] });
run(s, 0.5);
check("Coulomb friction holds below breakaway", s.q[0] === 0, `q ${s.q[0]}`);
s = CORE.create({ dofs: [dof()], mass: () => [1], forces: () => [3], friction: () => [2] });
run(s, 0.1);
check("Coulomb friction slides above breakaway (net 1 N)", near(s.q[0], 0.5 * 1 * 0.1 ** 2 * 1000, 0.01), `q ${s.q[0].toFixed(3)} mm (5.000)`);

// 6 hand: scripted push into a stop, then let go
s = CORE.create({ dofs: [dof({ max: 50 })], mass: () => [1], forces: () => [0], friction: () => [0.5], grab: { dof: 0 } });
s.scriptedPush(50, 200, 0.2);
let peak = 0; run(s, 1.0, (x) => { peak = Math.max(peak, x.fHand); });
check("hand pushes to the stop and lets go", s.q[0] === 50 && !s.hand && s.fHand === 0 && peak > 0, `q ${s.q[0]} hand ${s.hand} peak ${peak.toFixed(0)} N`);

// 7 deg DOF: torsion pendulum I 1000 kg mm^2, k 10 N mm/deg -> T = 2 pi sqrt(1e-3 / 0.57296) = 0.26249 s
s = CORE.create({ dofs: [dof({ unit: "deg", q0: 5 })], mass: () => [1000], forces: (q) => [-10 * q[0]] });
const Td = period(s, (x) => x.q[0], 3.0);
check("torsion pendulum period (deg DOF)", near(Td, 0.26249, 0.005), `${Td.toFixed(5)} s (0.26249)`);

// 8 two DOFs are independent
s = CORE.create({ dofs: [dof(), dof({ key: "y" })], mass: () => [1, 2], forces: () => [-9.81, -9.81 * 2] });
run(s, 0.2);
check("two DOFs integrate independently", near(s.q[0], s.q[1], 1e-9), `${s.q[0].toFixed(3)} / ${s.q[1].toFixed(3)}`);
done();

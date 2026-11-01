// node tests/contact_map.test.js - follower on a precomputed depth map (synthetic maps)
const CONTACT = require("../physics/modules/contact_map.js");
const { check, done } = require("./_lib.js");
// map over x -5..5, z 0..20, res 0.05; depth(x, z) from f, 255 = wall
function mk(f, minWall = 45) {
  const res = 0.05, nx = 201, nz = 401, data = new Uint8Array(nx * nz), scale = 50;
  for (let i = 0; i < nz; i++) for (let j = 0; j < nx; j++) { const d = f(-5 + j * res, i * res); data[i * nx + j] = d < 0 ? 255 : Math.round(d * scale); }
  return CONTACT.create({ x0: -5, z0: 0, res, nx, nz, scale, data, min_wall: minWall });
}
// 1 V-groove (45 deg walls, 3 deep): a plunger dropped at the centre settles at the bottom
const V = mk((x, z) => (z >= 10 ? -1 : Math.max(0, 3 - Math.abs(x))));
const st = { x: 0, vx: 0, d: 0, vd: 0 };
for (let i = 0; i < 2000; i++) CONTACT.fall(st, V.depthAt(st.x, 5), 1e-5, 2 / 0.0015 * 1000);
check("plunger settles at the groove bottom", Math.abs(st.d - 3) < 1e-9, `d ${st.d.toFixed(3)}`);
// 2 a wall row at z 10 blocks the travel
let z = 5, blocked = null; const s2 = { x: 0, vx: 0, d: 3, vd: 0 };
for (let i = 0; i < 800 && blocked === null; i++) { const z1 = z + 0.01, r = V.follow(s2, z, z1, s2.x, 1e-4); if (!r.moved) blocked = z; else z = z1; }
check("wall blocks the travel", blocked !== null && blocked < 10 && blocked > 9.9, `blocked at z ${blocked && blocked.toFixed(3)}`);
// 3 diagonal channel (x follows z/2): the follower is pushed sideways, never faster than the slope allows
const C = mk((x, z) => (Math.abs(x - (z * 0.5 - 4)) <= 0.6 ? 1 : -1), 45);
const s3 = { x: -4, vx: 0, d: 1, vd: 0 }, dt = 1e-4, vz = 50; let worst = 0, okAll = true; z = 0;
for (let i = 0; i < 2000; i++) {
  const z1 = z + vz * dt, r = C.follow(s3, z, z1, s3.x + s3.vx * dt, dt);
  okAll = okAll && r.moved; if (r.moved) z = z1;
  worst = Math.max(worst, Math.abs(s3.vx) / (vz / Math.tan(45 * Math.PI / 180)));
}
check("channel pushes the follower along", okAll && Math.abs(s3.x - (z * 0.5 - 4)) <= 0.65, `z ${z.toFixed(2)} x ${s3.x.toFixed(3)} (centre ${(z * 0.5 - 4).toFixed(3)})`);
check("sideways speed within the slope cap", worst <= 1.0 + 1e-9, `peak ${(worst * 100).toFixed(1)} % of the cap`);
done();

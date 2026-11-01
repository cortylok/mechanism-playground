// node tests/springs.test.js - springs and gas struts
const SPRINGS = require("../physics/modules/springs.js");
const { check, near, done } = require("./_lib.js");

const g = SPRINGS.gasStrut({ ext: 550, stroke: 220, F1: 100, prog: 1.3, damp: 250, dampedFrac: 1 });
check("strut F1 at full extension", near(g.force(550, 0), 100, 0.01), g.force(550, 0).toFixed(2));
check("strut F1*prog at full compression", near(g.force(330, 0), 130, 0.01), g.force(330, 0).toFixed(2));
check("strut mid stroke = F1(1+prog)/2", near(g.force(440, 0), 115, 0.01), g.force(440, 0).toFixed(2));
check("strut beyond its ends clamps", g.force(600, 0) === 100 && g.force(300, 0) === 130, `${g.force(600, 0)} / ${g.force(300, 0)}`);
// S3 physics.js strutForce(L, v) at lift L: len = 350 + L, damped on extension: F1/damp * v
const s3 = (L, v) => { const len = 350 + L, comp = Math.max(0, Math.min(1, (550 - len) / 220)); let f = 100 * (1 + 0.3 * comp); if (v > 0) f -= (100 / 250) * v; return f; };
let worst = 0;
for (const L of [-20, 0, 50, 100, 150, 200]) for (const v of [-100, 0, 80, 200]) worst = Math.max(worst, Math.abs(g.force(350 + L, v) - s3(L, v)) / Math.abs(s3(L, v)));
check("matches the S3 strut model within 1 %", worst < 0.01, `worst ${(worst * 100).toFixed(3)} %`);
const gd = SPRINGS.gasStrut({ ext: 550, stroke: 220, F1: 100, prog: 1.3, damp: 250, dampedFrac: 0.15 });
check("damping only in the last 15 % of extension", gd.force(400, 100) === gd.force(400, 0) && gd.force(540, 100) < gd.force(540, 0),
  `${gd.force(400, 100).toFixed(1)} / ${gd.force(540, 100).toFixed(1)}`);
check("strut on retraction is not damped", g.force(440, -100) === g.force(440, 0), g.force(440, -100).toFixed(2));

const lin = SPRINGS.linear({ k: 2, free: 50, preload: 0 });
check("linear spring Hooke (compressed 10 mm -> 20 N push)", near(lin(40), 20, 1e-9) && lin(60) === -20, `${lin(40)} / ${lin(60)}`);
const comp = SPRINGS.linear({ k: 2, free: 50, compressionOnly: true });
check("compression-only spring is slack when stretched", comp(60) === 0 && comp(40) === 20, `${comp(60)} / ${comp(40)}`);
const tor = SPRINGS.torsion({ k: 5, preloadDeg: 10 });
check("torsion spring T = k (angle + preload)", near(tor(20), -150, 1e-9), tor(20));
done();

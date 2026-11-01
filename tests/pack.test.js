// node tests/pack.test.js - build/pack.py round trip: a 20 mm cube packs and decodes to its 8 corners
const fs = require("fs"), path = require("path"), os = require("os"), { spawnSync } = require("child_process");
const BUNDLE = require("../physics/bundle.js");
const { check, done } = require("./_lib.js");
const PY = process.platform === "win32" ? ["py", ["-3"]] : ["python3", []];
const pack = (dir) => spawnSync(PY[0], [...PY[1], path.join(__dirname, "..", "build", "pack.py"), dir], { encoding: "utf8" });
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mpg-pack-"));
const V = [[0, 0, 0], [20, 0, 0], [20, 20, 0], [0, 20, 0], [0, 0, 20], [20, 0, 20], [20, 20, 20], [0, 20, 20]];
const F = [[0, 2, 1], [0, 3, 2], [4, 5, 6], [4, 6, 7], [0, 1, 5], [0, 5, 4], [1, 2, 6], [1, 6, 5], [2, 3, 7], [2, 7, 6], [3, 0, 4], [3, 4, 7]];
fs.mkdirSync(path.join(dir, "meshes"));
const facet = (f) => `facet normal 0 0 0\nouter loop\n${f.map((i) => `vertex ${V[i].join(" ")}`).join("\n")}\nendloop\nendfacet`;
fs.writeFileSync(path.join(dir, "meshes", "cube.stl"), "solid c\n" + F.map(facet).join("\n") + "\nendsolid c\n");
fs.writeFileSync(path.join(dir, "parts.json"), JSON.stringify({ name: "cube", parts: [{ id: "cube", stl: "meshes/cube.stl", density: 1.0 }] }));
const r = pack(dir);
check("pack.py runs", r.status === 0, (r.stdout + r.stderr).trim().split("\n").pop());
const data = JSON.parse(fs.readFileSync(path.join(dir, "out", "data.json"), "utf8"));
fs.writeFileSync(path.join(dir, "parts.json"), JSON.stringify({ parts: [{ id: "x", stl: "meshes/none.stl" }] }));
const r2 = pack(dir);
check("missing STL stops with a clear message", r2.status !== 0 && /none\.stl not found/.test(r2.stderr), r2.stderr.trim());
(async () => {
  const p = data.parts[0], m = await BUNDLE.decodeMesh(p.mesh);
  const pts = []; for (let i = 0; i < m.position.length; i += 3) pts.push([m.position[i], m.position[i + 1], m.position[i + 2]]);
  const worst = Math.max(...V.map((c) => Math.min(...pts.map((q) => Math.hypot(q[0] - c[0], q[1] - c[1], q[2] - c[2])))));
  check("decoded cube has its 8 corners", pts.length === 8 && worst < 1e-3 && m.index.length === 36, `${pts.length} verts, worst ${worst.toExponential(1)} mm`);
  check("mass from density 1 g/cm3 = 8 g, com at the centre", Math.abs(p.mass - 0.008) < 1e-9 && Math.abs(p.com[0] - 10) < 1e-6, `mass ${p.mass} kg com ${p.com}`);
  fs.rmSync(dir, { recursive: true, force: true });
  done();
})();

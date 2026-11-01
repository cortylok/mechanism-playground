// Mechanism playground - bundle helpers (no DOM): decode packed meshes and binary maps in node and in the browser.
(function (root) {
  const isNode = typeof window === "undefined" && typeof process !== "undefined" && !!(process.versions && process.versions.node);
  async function inflate(b64) {
    if (isNode) {
      const b = require("zlib").inflateSync(Buffer.from(b64, "base64"));
      return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
    }
    const bin = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    return await new Response(new Blob([bin]).stream().pipeThrough(new DecompressionStream("deflate"))).arrayBuffer();
  }
  // packed mesh (build/pack.py enc) -> { position: Float32Array (xyz per vertex), index: Uint32Array }
  async function decodeMesh(m) {
    const q = new Uint16Array(await inflate(m.v));
    if (m.vd) for (let i = 3; i < q.length; i++) q[i] = (q[i] + q[i - 3]) & 0xffff;   // delta xyz: running sum mod 65536
    let index;
    if (m.fd) {                                                       // delta face indices: running sum
      const d = new Int32Array(await inflate(m.f)); index = new Uint32Array(d.length);
      let a = 0; for (let i = 0; i < d.length; i++) { a += d[i]; index[i] = a; }
    } else index = m.i32 ? new Uint32Array(await inflate(m.f)) : Uint32Array.from(new Uint16Array(await inflate(m.f)));
    const position = new Float32Array(q.length);
    for (let i = 0; i < q.length; i++) { const a = i % 3; position[i] = m.lo[a] + (q[i] / 65535) * (m.hi[a] - m.lo[a]); }
    return { position, index };
  }
  // contact map JSON with data_b64 -> the same map with data as a Uint8Array
  async function decodeMap(map) {
    if (map.data && typeof map.data !== "string") return map;
    return Object.assign({}, map, { data: new Uint8Array(await inflate(map.data_b64 || map.data)) });
  }
  const FORMAT = "mechanism-playground/1";
  // null when the bundle can run, else a message that names the problem
  function check(B) {
    if (!B || typeof B !== "object") return "This is not a playground bundle (no JSON object).";
    if (typeof B.format !== "string" || !B.format.startsWith("mechanism-playground/"))
      return `This file is not a playground bundle (format: ${JSON.stringify(B.format)}).`;
    if (B.format.split("/")[1].split(".")[0] !== "1")
      return `This bundle needs a newer playground (format ${B.format}; this player reads ${FORMAT}).`;
    if (!B.data || !Array.isArray(B.data.parts)) return "The bundle has no parts (data.parts).";
    if (typeof B.mech !== "string" || !B.mech.trim()) return "The bundle has no mechanism code (mech).";
    return null;
  }
  // run the bundle's mechanism.js source; it must `return { dofs, mass, forces, ... }`
  const NAMES = ["CORE", "SPRINGS", "PNEUMATICS", "LINKAGE2D", "CONTACT", "MAT4", "MASSTABLE", "BUNDLE"];
  function libs() {
    if (isNode) {
      const p = require("path"), d = __dirname, r = (f) => require(p.join(d, f));
      return [r("core.js"), r("modules/springs.js"), r("modules/pneumatics.js"), r("modules/linkage2d.js"), r("modules/contact_map.js"),
        r("mat4.js"), r("mass_table.js"), BUNDLE];
    }
    return NAMES.map((n) => root[n]);
  }
  function makeMech(B) {
    const f = new Function(...NAMES, "DATA", "CONFIG", "\"use strict\";\n" + B.mech);
    const M = f(...libs(), B.data, B.config || {});
    if (!M || !Array.isArray(M.dofs) || !M.dofs.length) throw new Error("mechanism.js must return an object with a dofs array");
    if (typeof M.mass !== "function" || typeof M.forces !== "function") throw new Error("mechanism.js must return mass() and forces() functions");
    return M;
  }
  const BUNDLE = { inflate, decodeMesh, decodeMap, check, makeMech, FORMAT };
  if (typeof module !== "undefined" && module.exports) module.exports = BUNDLE; else root.BUNDLE = BUNDLE;
})(typeof window !== "undefined" ? window : globalThis);

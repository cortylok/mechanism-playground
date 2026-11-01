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
  const BUNDLE = { inflate, decodeMesh, decodeMap };
  if (typeof module !== "undefined" && module.exports) module.exports = BUNDLE; else root.BUNDLE = BUNDLE;
})(typeof window !== "undefined" ? window : globalThis);

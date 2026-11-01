// Mechanism playground - 4x4 matrices for part poses (column-major, like three.js Matrix4.fromArray). No DOM.
(function (root) {
  const I = () => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
  function mul(a, b) {                                                 // a * b
    const o = new Array(16).fill(0);
    for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) { let s = 0; for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k]; o[c * 4 + r] = s; }
    return o;
  }
  const translate = (v) => { const m = I(); m[12] = v[0]; m[13] = v[1]; m[14] = v[2]; return m; };
  function rotate(axis, rad) {                                         // about an axis through the origin
    const l = Math.hypot(axis[0], axis[1], axis[2]), x = axis[0] / l, y = axis[1] / l, z = axis[2] / l;
    const c = Math.cos(rad), s = Math.sin(rad), t = 1 - c;
    return [t * x * x + c, t * x * y + s * z, t * x * z - s * y, 0,
      t * x * y - s * z, t * y * y + c, t * y * z + s * x, 0,
      t * x * z + s * y, t * y * z - s * x, t * z * z + c, 0, 0, 0, 0, 1];
  }
  // rotation by rad about the axis through point p
  const rotateAbout = (axis, p, rad) => mul(translate(p), mul(rotate(axis, rad), translate([-p[0], -p[1], -p[2]])));
  const apply = (m, v) => [m[0] * v[0] + m[4] * v[1] + m[8] * v[2] + m[12], m[1] * v[0] + m[5] * v[1] + m[9] * v[2] + m[13], m[2] * v[0] + m[6] * v[1] + m[10] * v[2] + m[14]];
  // planar pose from linkage2d (rotation ang about the plane normal + shift in the plane). plane: "yz" (rotate about +x),
  // "xz" (about -y, so + ang turns x toward z) or "xy" (about +z)
  function planar(ang, d1, d2, plane = "yz") {
    if (plane === "yz") return mul(translate([0, d1, d2]), rotate([1, 0, 0], ang));
    if (plane === "xz") return mul(translate([d1, 0, d2]), rotate([0, -1, 0], ang));
    return mul(translate([d1, d2, 0]), rotate([0, 0, 1], ang));
  }
  const MAT4 = { I, mul, translate, rotate, rotateAbout, apply, planar };
  if (typeof module !== "undefined" && module.exports) module.exports = MAT4; else root.MAT4 = MAT4;
})(typeof window !== "undefined" ? window : globalThis);

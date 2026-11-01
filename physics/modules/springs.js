// Mechanism playground - springs and gas struts (no DOM). Units: mm, N, N*mm, deg, mm/s.
(function (root) {
  // Linear spring between two points. x = current length (mm). Returns the force that pushes the ends APART (N):
  // + when compressed below `free`, - when stretched (0 when stretched and compressionOnly).
  function linear({ k, free, preload = 0, compressionOnly = false }) {
    return (x) => {
      const f = preload + k * (free - x);
      return compressionOnly && f < 0 ? 0 : f;
    };
  }
  // Torsion spring: k N*mm/deg, preloadDeg = wind-up at angle 0. Returns the restoring torque (N*mm).
  function torsion({ k, preloadDeg = 0 }) {
    return (deg) => -k * (deg + preloadDeg);
  }
  // Gas strut. ext = length fully extended, stroke, F1 = force at full extension (N), prog = F2/F1 (force rises
  // linearly to F1*prog at full compression), damp: extension damping coefficient F1/damp N per mm/s, applied only
  // while extending inside the last dampedFrac of the stroke (1 = whole stroke). Retraction is not damped.
  // force(len, v): push (N) along the strut, v = d(len)/dt (mm/s, + extending).
  function gasStrut({ ext, stroke, F1, prog = 1.3, damp = 0, dampedFrac = 1 }) {
    const minLen = ext - stroke;
    function force(len, v = 0) {
      const comp = Math.max(0, Math.min(1, (ext - len) / stroke));
      let f = F1 * (1 + (prog - 1) * comp);
      if (damp > 0 && v > 0 && len >= ext - dampedFrac * stroke) f -= (F1 / damp) * v;
      return f;
    }
    return { force, ext, stroke, minLen, F1, prog };
  }

  const SPRINGS = { linear, torsion, gasStrut };
  if (typeof module !== "undefined" && module.exports) module.exports = SPRINGS; else root.SPRINGS = SPRINGS;
})(typeof window !== "undefined" ? window : globalThis);

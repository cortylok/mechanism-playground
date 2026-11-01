// Mechanism playground - follower on a precomputed depth map (no DOM). From the S3 / ST-401 latch lab.
// The map covers a cam face on a grid (x = the follower's free sideways direction, z = the travel direction of the main
// DOF). Each cell holds the deepest the follower tip can sit there (mm), or a wall. A spring plunger follower has a
// depth d: it may move to any cell at least d - eps deep (it cannot be lifted out by a shallower cell - that is a wall
// for it), and it falls deeper under its spring. Walls swing the follower sideways inside the friction cone
// (min_wall = the shallowest wall angle, deg) or stop the main DOF.
// Map JSON: { x0, z0, res, nx, nz, scale, data (Uint8Array or base64 zlib string, decoded by the caller), min_wall }.
(function (root) {
  function create(map, opts = {}) {
    const eps = opts.eps != null ? opts.eps : 0.12, tanW = Math.tan((map.min_wall || 25) * Math.PI / 180);
    const tau = opts.tau != null ? opts.tau : 0.001;                 // contact velocity low-pass (s)
    function depthAt(x, z) {
      const j = Math.round((x - map.x0) / map.res), i = Math.round((z - map.z0) / map.res);
      if (i < 0 || j < 0 || i >= map.nz || j >= map.nx) return -1;
      const v = map.data[i * map.nx + j];
      return v === 255 ? -1 : v / map.scale;
    }
    const allowed = (x, z, d) => { const t = depthAt(x, z); return t >= 0 && t >= d - eps ? t : -1; };
    // Move the travel coordinate from z0 to z1 with the follower predicted at xPred (its own inertia).
    // Finds the nearest allowed sideways position inside the friction-cone reach. On success sets st.x and st.vx (the
    // wall push capped by the slope and low-passed - an uncapped grid projection flings parts at m/s) and returns
    // { moved: true, t } with t = the cell depth (the caller lets the plunger fall to it). Else { moved: false }.
    function follow(st, z0, z1, xPred, dt) {
      const dz = z1 - z0, reach = (Math.abs(dz) + map.res) / tanW + 1.5 * map.res + Math.abs(xPred - st.x);
      const step = map.res / 2;
      for (let off = 0; off <= reach + 1e-9; off += step) {
        for (const c of off === 0 ? [xPred, st.x] : [xPred + off, xPred - off]) {
          const t = allowed(c, z1, st.d);
          if (t < 0) continue;
          const vw = (c - xPred) / dt, cap = Math.abs(dz / dt) / tanW, kf = dt / (dt + tau);
          st.vx = st.vx + kf * Math.max(-cap, Math.min(cap, vw));
          st.x = c;
          return { moved: true, t };
        }
      }
      return { moved: false };
    }
    return { depthAt, allowed, follow, tanW, map };
  }
  // Spring plunger: fall toward depth t with acceleration acc (mm/s^2); a shallower t lifts it at once (the cam pushes
  // it in). Returns the drop (mm) when it lands after a fall, else 0 - use it for click events.
  function fall(st, t, dt, acc) {
    if (t <= st.d) { st.d = t; st.vd = 0; st.fallFrom = null; return 0; }
    if (st.fallFrom == null) st.fallFrom = st.d;
    st.vd += acc * dt; st.d += st.vd * dt;
    if (st.d >= t) { const drop = t - st.fallFrom; st.d = t; st.vd = 0; st.fallFrom = null; return drop; }
    return 0;
  }

  const CONTACT = { create, fall };
  if (typeof module !== "undefined" && module.exports) module.exports = CONTACT; else root.CONTACT = CONTACT;
})(typeof window !== "undefined" ? window : globalThis);

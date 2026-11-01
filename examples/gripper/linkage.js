// Gripper linkage (shared by mechanism.js and the sweep check). Plane (x, z); pins along y; mirror about z = 0.
// Each jaw is the coupler of a four-bar (jaw connector + big connector, both pivoted on the bracket); the slider drives
// the jaw connector through the small connector. Slider travel x (mm, + opens), 0 = the CAD pose (closed).
function gripperLinkage(L2) {
  const P = { S: [43, 30], K: [62.89, 32.09], G1: [79.65, 62.5], J1: [137.24, 54.61], G2: [96, 42.94], J2: [144.19, 29.63] };
  const m = (p) => [p[0], -p[1]];
  const bodies = {
    slider: { pins: { S: P.S, SL: m(P.S) } },
    smallU: { pins: { S: P.S, K: P.K } }, jcU: { pins: { K: P.K, G1: P.G1, J1: P.J1 } }, bigU: { pins: { G2: P.G2, J2: P.J2 } }, jawU: { pins: { J1: P.J1, J2: P.J2 } },
    smallL: { pins: { SL: m(P.S), KL: m(P.K) } }, jcL: { pins: { KL: m(P.K), G1L: m(P.G1), J1L: m(P.J1) } }, bigL: { pins: { G2L: m(P.G2), J2L: m(P.J2) } }, jawL: { pins: { J1L: m(P.J1), J2L: m(P.J2) } },
  };
  const ground = { G1: P.G1, G2: P.G2, G1L: m(P.G1), G2L: m(P.G2) };
  return { P, solver: L2.create({ bodies, ground, driver: { body: "slider", kind: "slide", dir: [1, 0] } }) };
}
if (typeof module !== "undefined" && module.exports) module.exports = gripperLinkage;

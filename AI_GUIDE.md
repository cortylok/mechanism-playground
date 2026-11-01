# Mechanism playground: guide for AI assistants

You are an AI assistant (Claude, ChatGPT, Gemini, Copilot, Cursor, ...) helping a person turn their mechanism into an
interactive, physics-based 3D page, or open / change an existing one. You have no earlier context. This guide is
everything you need. Read it fully before you act. It is also served at
<https://cortylok.github.io/mechanism-playground/ai-guide.md>; the code is at
<https://github.com/cortylok/mechanism-playground>.

---

## 1. What the playground is

A page in which a person grabs a part of a mechanism with the mouse or a finger and pushes or pulls it. The response is
physics, not animation: masses, springs, gas struts, air cylinders, motors, friction, stops and contacts answer the
hand. The person can rotate and zoom, cut a section, show / hide / see-through each part, tap a part for a spec card,
draw lines and paint areas on the model, change model values (spring force, pressure, motor torque, ...) in Settings,
and press control buttons (valve, motor, reset).

One project builds to three files:

| File | Use |
|---|---|
| `dist/<name>.html` | standalone page, one file: open it locally, email it, open it on a phone |
| `dist/<name>.artifact.html` | the same page without the document skeleton, for hosts that add one (claude.ai artifacts) |
| `dist/<name>.playground.json` | a bundle: everything the project needs, loadable in the player |

The **player** (`dist/player.html`, live at <https://cortylok.github.io/mechanism-playground/player.html>) opens any
bundle from a link, a local file, a local folder search, the project list, or a GitHub search (repos with the topic
`mechanism-playground`). Each project runs in a sandboxed iframe. Every page has an "Open model" button that leads there.

Examples in the repo (read them - they are the best reference):

| Example | Shows |
|---|---|
| `examples/starter` | one hinge DOF (deg), a gas strut, weight torque from a mass table, hinge friction |
| `examples/gripper` | a real downloaded SolidWorks assembly: export, materials, four-bar linkages, lead screw + motor with a torque-speed curve, a damped test object, a worm gear, `hand.auto` |
| `examples/pneumatic-slide` | a double-acting cylinder, 5/2 valve on a button, flow controls, cushions, chamber gauges |
| `examples/s3-side-table` | a 300-part real project with its own physics engine (`createSim`), a latch cam map, an inset drawing |

## 2. Opening an existing model

- A `.playground.json` bundle: open the player and load it by link, file or folder; or ask the person to do it.
- A built page (`.html`): open it in a browser. Nothing to install.
- A project folder (has `project.json`): build it - section 4 step 6.
- To understand a bundle: it is JSON. `format` must start with `mechanism-playground/1`. `mech` is the JavaScript
  plug-in source (section 5), `data.parts` the packed meshes and mass properties, `config` the page text and views.
  `ai.guide` points to this guide.

## 3. What to ask the person (before you build)

Ask only what you cannot read from their files. Typical list:

1. **Geometry:** one STL per part, in assembly position, mm, or a SolidWorks assembly open on their PC (the exporter
   writes the STLs and mass properties). Other CAD: export STLs per part in assembly coordinates.
2. **What moves and how:** which parts move, the joints (pins / hinges / slides / screws / gears), and the axis of
   each. Ask for one other pose (for example fully open) if the motion is not obvious; a video or screenshots help.
3. **What drives it and what resists:** hand only? springs (rate, free length), gas struts (F1, extended length,
   stroke, progression), cylinders (bore, rod, stroke, valve C and b, tube size, supply pressure), motors (stall torque,
   no-load speed), screws (lead, efficiency), friction, stops, loads.
4. **Materials** (or masses). CAD exports often have no material set (density 1.0 g/cm³): check, and ask.
5. **What they want to test or feel:** for example "does the lid stay shut", "grip force on a 50 mm part", "stroke
   time with this flow control", "does a short push latch".
6. **Gravity:** which way is up when the mechanism is in use (the page is z-up).
7. **Licence / sharing:** is the design theirs, may it be public? Credit the author of any downloaded model.

## 4. Procedure: from a CAD model to a page

Requirements: Python 3.11+ with `pip install -r requirements.txt` (numpy, trimesh, fast-simplification, scipy, pillow,
shapely, manifold3d, mapbox-earcut), Node.js 18+, Google Chrome (for the headless check). SolidWorks export: Windows,
SolidWorks running, `pip install pywin32`.

1. **Get the repo:** `git clone https://github.com/cortylok/mechanism-playground` and work inside it. Put the person's
   project in `projects/<name>/` (git-ignored: private by default) or `examples/<name>/` (public).
2. **Export the geometry.**
   - SolidWorks: open the assembly (from an extracted folder, never from inside a zip - SolidWorks then cannot find the
     parts), then `py tools/sw_export.py projects/<name>`. Writes `meshes/*.stl` and `parts.json` with mass, centre
     of mass and inertia per part, in assembly coordinates. Read-only: it never saves the assembly.
   - Other CAD: STL per part in assembly position + a `parts.json` you write (schema below).
3. **Check the export** before any physics: every part's centre of mass inside its mesh; total size sensible; masses
   sensible (density 1.0 g/cm³ everywhere = no materials: scale `mass` and `inertia` by the real density; see
   `examples/gripper/prepare.py`). Build a view-only page (a mechanism with one fixed DOF) and look at a screenshot.
4. **Find the joints from the geometry.** Pins are cylinders: their principal axis and centre give the joint. Which
   parts a pin joins = the parts with a hole at that place (`tools/holes.py part.stl` lists holes). A disc's axis is its
   SMALLEST principal direction (a gear's largest direction lies in its face). Gear teeth: count radius peaks. Screw
   lead: the spacing of thread crests along the axis.
5. **Write the plug-in** `mechanism.js` (section 5) plus `project.json` and `config.json`. Start from the example closest
   to the mechanism. Find the motion range from collisions: exact mesh overlap over a sweep (`examples/gripper/
   sweep_check.py`) - not from guesses.
6. **Test in node** (`test.js` next to it, section 7), then build and check the page:
   ```
   py build/build.py projects/<name>          # -> dist/<name>.html, .artifact.html, .playground.json
   node tests/run.js                          # every test in the repo (node + Python)
   py tools/headless.py dist/<name>.html --shot shot.png   # loads, no errors, not a blank picture
   ```
   Look at the screenshot yourself. Then ask the person to try it: report what you tested and what you did not (a real
   drag on a phone is not tested by any of the above).
7. **Iterate with the person.** They will say what looks or feels wrong. Measure before you fix (section 8 has the
   usual causes).
8. **Share** (section 9).

### parts.json

```json
{ "name": "my-gripper",
  "groups": [ { "key": "jaws", "label": "Jaws", "colour": "#c2a54a", "mode": "solid", "opacity": 0.3 } ],
  "parts": [
    { "id": "Jaw-1", "stl": "meshes/Jaw-1.stl", "group": "jaws", "label": "Jaw (upper)",
      "mass": 0.408, "com": [192.6, 0, 24.2], "inertia": [[...], [...], [...]],
      "info": { "kind": "Moving", "pn": "J-01", "rows": [["Material", "Aluminium 6061"]] } },
    { "id": "lid", "stl": "meshes/lid.stl", "group": "lid", "density": 2.7 }
  ],
  "geometry": { "anything": "extra keys pass to the plug-in as DATA.geometry" } }
```

`mass` kg, `com` mm in the CAD frame, `inertia` kg·mm² about the com in CAD axes. Or `density` (g/cm³) for a watertight
mesh and `build/pack.py` computes them. `mode`: solid / xray / off at start. `info.rows` fill the tap card.

### project.json and config.json

```json
{ "name": "my-gripper", "title": "My gripper", "mech": ["linkage.js", "mechanism.js"], "config": "config.json" }
```
`mech` is one file or a list joined in order. Optional `"data": "path/data.json"` uses prepacked data instead of
`parts.json`. Name and title must not contain `/`.

```json
{ "description": "One paragraph: what it is and what to try.",
  "notes": ["Model notes, assumptions, credits."],
  "views": { "side": { "label": "Side", "t": [0, 0, 100], "r": 900, "th": -1.57, "ph": 0.05, "modes": { "walls": "off" } } },
  "defaultView": "iso", "speed0": 1, "sectionCentre": [0, 0, 0], "hint": "short help line",
  "look": { "outline": false, "shadow": true, "env": true }, "playerUrl": "https://.../player.html" }
```
Views: target `t`, distance `r`, azimuth `th` and elevation `ph` (rad), z up; optional group display `modes`.

## 5. The plug-in: mechanism.js

`mechanism.js` is the body of a function. It receives these names and must `return` the mechanism object:
`CORE, SPRINGS, PNEUMATICS, LINKAGE2D, CONTACT, MAT4, MASSTABLE, BUNDLE, DATA, CONFIG`
(`DATA` = packed parts + the extra keys of `parts.json`; `CONFIG` = config.json). No DOM access in physics code: it
must also run in node for tests.

Units everywhere: mm, s, kg, N. A DOF has `unit: "mm"` (forces N, mass kg) or `"deg"` (torques N·mm, inertia kg·mm²
**per radian**: the core converts).

| Key | Required | Meaning |
|---|---|---|
| `dofs` | yes | `[{ key, label, unit, min, max, q0, hit: { e } }]` - the moving coordinates; `e` = restitution at the stops (0 = dead stop) |
| `mass(q, sim)` | yes | effective mass / inertia per DOF (array). Use `MASSTABLE` for linkages |
| `forces(q, v, t, sim)` | yes | all forces per DOF except the hand and friction (array). Positive = increasing q |
| `friction(q, v, sim)` | no | Coulomb friction magnitude per DOF (array): sticks when the push is smaller |
| `bounds(q, sim)` | no | `[{ lo, hi }]` moving stops; default dof `min` / `max` |
| `update(sim, dt)` | no | runs every substep before forces: valves, pneumatic chambers, latches |
| `grab` | no | `{ dof, k, c, max }` the hand: spring k (N/mm or N·mm/deg), damper c, force cap |
| `hand` | no | which parts the hand can grab: `{ groups: [...] }` or `{ parts: [...] }`, and how a drag maps to the DOF: `axis: [x,y,z]` (mm DOF), `axis` + `pivot` (deg DOF), or `auto: true` (through the part's own motion from `pose()` - any linkage, screw or gear ratio) |
| `pose(sim)` | yes, for motion | `{ partId: 4x4 matrix column-major }` for the parts that move (use `MAT4`) |
| `design` | no | design values; the page edits copies in `sim.P` |
| `settings` | no | `[[key, label, step, min]]` editable values in `sim.P` |
| `onSetting(sim, key, value)` | no | rebuild things after a setting changes |
| `resets` | no | `[{ label, where }]` buttons; `where` goes to `reset` |
| `reset(sim, where)` | no | put the state in a start pose |
| `buttons` | no | `[{ label, press(sim), active(sim), text(sim) }]` control buttons (valve, motor, mode) |
| `hud(sim)` | no | `{ big, state, chips: [{ label, on }] }` the box at the top left |
| `readouts(sim)` | no | `[[label, text]]` in the Info panel |
| `gauges(sim)` | no | `[{ label, value, max, unit }]` bars in the HUD |
| `eventText(e)` | no | flash text for `sim.event(kind, value)` events (the core logs `"stop"` hits) |
| `inset` | no | `{ title, draw(ctx, W, H, sim, css, dpr) }` a small canvas drawing (returns a status line) |
| `pageInit(sim)` | no | async, page only (may use the DOM): decode extra data, build images |
| `createSim()` | no | bring your own engine instead of `CORE` (see `examples/s3-side-table/adapter.js` for the interface) |
| `stopEventMin` | no | stop hits slower than this (unit/s) log no event (default 20) |

The `sim` object (from `CORE.create(mech)`): `q`, `v` (arrays), `t`, `P` (settings), `tscale`, `hand`, `fHand`,
`events`, `step(dt)`, `substep(dt)`, `grab()`, `drag(target, speed)`, `release()`, `scriptedPush(to, speed, hold)`,
`reset(where)`, `event(kind, value)`.

### Minimal example: a hinged lid on a gas strut

```js
const G = DATA.geometry, D2R = Math.PI / 180, AXIS = [-1, 0, 0];
const lidPose = (deg) => MAT4.rotateAbout(AXIS, G.hinge, deg * D2R);
const table = MASSTABLE.build({ parts: DATA.parts, pose: (q) => ({ lid: lidPose(q[0]) }), dof: 0, q0: [0],
  grid: Array.from({ length: 96 }, (_, i) => i), unit: "deg" });          // inertia + weight torque vs angle
const len = (deg) => { const b = MAT4.apply(lidPose(deg), G.B); return Math.hypot(b[0] - G.A[0], b[1] - G.A[1], b[2] - G.A[2]); };
const dLen = (deg) => (len(deg + 1e-3) - len(deg - 1e-3)) / 2e-3;        // mm per deg
return {
  dofs: [{ key: "lid", label: "Lid angle", unit: "deg", min: 0, max: 95, q0: 0 }],
  design: { F1: 27 },
  mass: (q) => [table.at(q[0]).M],
  forces: (q, v, t, sim) => { const strut = SPRINGS.gasStrut({ ext: 300, stroke: 130, F1: sim.P.F1, prog: 1.3 });
    return [table.at(q[0]).Q + strut.force(len(q[0]), dLen(q[0]) * v[0]) * dLen(q[0]) / D2R]; },  // N*mm per rad
  friction: () => [100],
  grab: { dof: 0, k: 400, c: 4, max: 60000 },
  hand: { groups: ["lid"], axis: AXIS, pivot: G.hinge },
  pose: (sim) => ({ lid: lidPose(sim.q[0]) }),
  settings: [["F1", "Strut force F1, N", 1, 0]],
};
```

## 6. Module reference

All modules are plain objects, no DOM. Source: `physics/`.

- **MAT4** - 4x4 column-major matrices: `I()`, `mul(a, b)`, `translate([x,y,z])`, `rotate(axis, rad)`,
  `rotateAbout(axis, point, rad)`, `apply(m, [x,y,z])`, `planar(ang, d1, d2, "xz" | "yz" | "xy")` (a pose from the
  linkage solver).
- **MASSTABLE.build({ parts, pose, dof, q0, grid, unit, g })** - effective mass `M(q)` and gravity force `Q(q)` (z up,
  g default 9.81; pass `g: 0` when the mounting is unknown) by virtual work from the parts' mass properties and your
  pose function. `.at(q) -> { M, Q }`. Includes rotation (a spinning screw adds its inertia × (2π/lead)²: fine-pitch
  screws feel heavy - that is real).
- **SPRINGS** - `linear({ k, free, preload, compressionOnly })(length) -> N` (push apart),
  `torsion({ k, preloadDeg })(deg) -> N·mm`, `gasStrut({ ext, stroke, F1, prog, damp, dampedFrac })
  .force(length, lengthRate)`. Generalised force on a DOF = force × d(length)/d(q) (per radian for a deg DOF).
- **PNEUMATICS.system(cfg)** - a cylinder through a valve: `{ supply (bar g), n (polytropic, 1.2), valve: { type: "5/2"
  | "3/2", C, b }, tubeA/tubeB: { id, len } mm, fcA/fcB: { mode: "out" | "in", C, b }, cyl: { bore, rod, stroke, deadA,
  deadB (mm³), cushion: { len, C, b }, friction: { static, dynamic } } }`. C in dm³/(s·bar), b critical pressure ratio
  (ISO 6358). Call `step(x, v, dt)` in `update`, add `force()` in `forces`, `friction(v)` in `friction`; `setValve(on)`;
  `gauges() -> { A, B (bar g), qA, qB (NL/min) }`. Lumped model: expect stroke times within ~10-20 % with datasheet
  values; tune C / friction to one measured stroke.
- **LINKAGE2D.create({ bodies, ground, driver, sliders })** - planar loop closure. `bodies: { name: { pins: { P: [u, v] } } }`;
  a pin name shared by two bodies (or a body and `ground`) is a revolute joint; `driver: { body, pivot, kind: "angle" }`
  (deg) or `{ body, kind: "slide", dir: [du, dv] }` (mm); `sliders: [{ body, pin, line: { p, dir } }]`.
  `.solve(u)` / `.table(us)` -> `{ ok, pins, bodies: { name: { ang, dy, dz } } }` with p = R(ang) p0 + (dy, dz).
  Check `ok` over the whole range. Tables beyond the travel by a little give clean derivatives at the stops.
- **CONTACT** - a follower on a precomputed depth map (cams, latches, guides). Make the map with
  `py build/contact_map.py cam.stl --x a b --z c d --res 0.05 --tip-r R -o map.json`; `CONTACT.create(map).follow(state,
  z0, z1, xPred, dt)` and `CONTACT.fall(state, depth, dt, acc)`. See `examples/s3-side-table/physics.js` for a full
  push-push latch.
- **CORE.create(mech)** - the integrator: substeps ≤ 0.1 ms and ≤ 0.01 unit of travel (count held steady), Coulomb
  friction, inelastic stops, the hand.
- **BUNDLE** - `check(bundle)` (null or a message), `makeMech(bundle)`, `decodeMesh(m)`, `decodeMap(map)`, `inflate(b64)`.

## 7. Tests (write them; they catch what screenshots cannot)

`test.js` next to `mechanism.js`, run by `node tests/run.js`:

```js
const fs = require("fs"), path = require("path"), ROOT = path.join(__dirname, "..", "..");
const BUNDLE = require(path.join(ROOT, "physics/bundle.js")), CORE = require(path.join(ROOT, "physics/core.js"));
const { check, done } = require(path.join(ROOT, "tests/_lib.js"));
const data = JSON.parse(fs.readFileSync(path.join(__dirname, "out/data.json"), "utf8"));   // made by build/pack.py
const mech = fs.readFileSync(path.join(__dirname, "mechanism.js"), "utf8");
const M = BUNDLE.makeMech({ data, mech, config: {} }), s = CORE.create(M); s.reset();
for (let i = 0; i < 500; i++) s.step(0.004);                                   // 2 s
check("it does what the person expects", s.q[0] < 0.5, `angle ${s.q[0].toFixed(2)}`);
done();
```

Good checks: a hand calculation of one mass-table value; static force balance (drive force = load × mechanical
advantage, within friction); stops reached; behaviour the person described ("a short push does not latch"); no
ringing (count velocity reversals after a contact).

## 8. Physics rules and known traps

- No motion sliders. Motion comes from the hand and the forces. Model values go to `settings`.
- **Contacts need damping** (a damping ratio on the contact's own stiffness and the moving mass; push only, never
  pull). **Motors need a torque-speed curve** (stall torque falling to zero at the no-load speed). A plain spring hit
  by a motor with no speed limit rings like rubber (the gripper had 83 reversals and a 26x force peak before this).
- Contact velocity from a map projection must be capped by the real slope and low-passed (~1 ms).
- Light spring plungers: small mass so drops take ~1 ms.
- Poses are full matrices: every part has `matrixAutoUpdate = false` in the page; send all moving parts from `pose()`.
- Headless Chrome runs almost no animation frames: test physics in node, or step the sim yourself in a page probe.
  `tools/headless.py` checks load, errors and the picture only. Its minimum width is ~500 px: test phone layouts in a
  390 px iframe.
- pywin32 + SolidWorks: no-argument methods come back as properties; call them through `_FlagAsMethod` (see `M()` in
  `tools/sw_export.py`).
- Windows PowerShell `Get-Content` / `Set-Content` double-encode UTF-8: edit files with an editor tool.
- Shell heredocs with apostrophes break in some Windows shells: write files with a file tool.
- A bundle on another site needs CORS (GitHub Pages and raw.githubusercontent.com allow it).
- Projects run in a sandboxed iframe in the player: no localStorage there (the page copes).
- Performance: physics is usually < 1 ms per frame; drawing dominates. The page keeps meshes indexed, redraws the
  shadow map only when something changes, picks through three-mesh-bvh trees (loaded from unpkg - jsdelivr serves it
  with a type the browser refuses), and lowers the resolution while moving only on a slow device (View > Performance:
  Res auto / full / low, Frame time readout). Measure with `__play.bench()` (ms per orbit frame) and `__play.pick()`
  (ms per pick) on the real clock - headless virtual time reads 0 ms. Mesh decimation is NOT automatic:
  `build/display_decimate.py` keeps a lighter copy only when its deviation check passes (fast-simplification is not
  repeatable on fine meshes).

## 9. Sharing a model

- Send `dist/<name>.html` (one file; works offline after first load of the 3D library, and on phones).
- Publish `dist/<name>.playground.json` in the model's own repo (commit it, or publish it on GitHub Pages with a
  `projects.json` listing it), add the GitHub topic `mechanism-playground`, and it appears in the player's GitHub
  search. Link directly: `https://cortylok.github.io/mechanism-playground/player.html?project=<bundle URL>`.
- To list it in the player's built-in list: a pull request to `projects.json` in this repo.
- Marker lines and paint save only when the page runs as a claude.ai artifact (`dist/<name>.artifact.html`).
- Respect the design's licence; credit authors of downloaded models in `config.notes`, the example README and here.

## 10. Repository map

| Path | Content |
|---|---|
| `physics/` | `core.js`, `mat4.js`, `mass_table.js`, `bundle.js`, `modules/` (springs, pneumatics, linkage2d, contact_map) |
| `template/` | `page.html` (the playground page), `player.html` (the loader / search shell) |
| `build/` | `pack.py` (STLs -> packed data), `build.py` (pages, bundles, player), `contact_map.py` |
| `tools/` | `sw_export.py`, `holes.py`, `headless.py` |
| `examples/` | starter, gripper, pneumatic-slide, s3-side-table |
| `tests/` | `node tests/run.js` runs every test (node and Python) |
| `.claude/skills/mechanism-playground/` | the same knowledge as a Claude Code skill |

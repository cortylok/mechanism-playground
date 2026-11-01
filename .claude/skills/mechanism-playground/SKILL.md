---
name: mechanism-playground
description: Turn a user's mechanism (CAD exports + joints, springs, struts, cylinders, latches) into a physics-based, interactive 3D browser page with this repo - parts.json + STLs + mechanism.js -> one HTML file, an artifact body and a .playground.json bundle for the player. Use when the user wants to "play with", "feel", test or demo a mechanism in the browser or on a phone, add a project to the playground, or change one of the examples.
---

# Mechanism playground: adapt it to a new mechanism

Read `README.md` first (layout, commands). The working examples are the best reference:
`examples/starter` (one hinge DOF, gas strut, mass table), `examples/pneumatic-slide` (cylinder, valve, flow controls,
cushions, page buttons and gauges), `examples/s3-side-table` (a full project with its own engine through `createSim`).

## What the user expects
- Physics, not animation: no sliders for the motion. Depth, speed and force come from the live drag. Model values
  (masses, spring forces, friction, pressures) go in `settings` with a "Design values" reset.
- Orientation as in the product (z up, parts move the way they really move).
- One HTML file that opens from an email on a phone; also the artifact body and the player bundle.
- Phone: one finger acts, two fingers rotate, pinch zooms. Desktop: left-drag acts, right-drag rotates, wheel zooms.

## Workflow
1. Ask for: STL per part in assembly position (SolidWorks: `py tools/sw_export.py projects/<name>` with the assembly
   open), the moving joints and axes, masses (or a density per part), spring / strut / cylinder datasheet values, and
   what behaviour they want to test. Ask one closed and one open pose if the motion is not obvious.
2. `cp -r examples/starter projects/<name>`; replace `make_parts.py` with the user's STLs; write `parts.json`
   (id, stl, group, label, density or mass/com/inertia, info rows for the cards; extra keys such as `geometry` pass to
   `DATA`), `project.json`, `config.json` (description, notes, views with optional display `modes`, speed0).
3. Write `mechanism.js` (contract below). Keep physics DOM-free.
4. Write `test.js` with the behaviour checks (node, no browser): use `BUNDLE.makeMech` + `CORE.create` as the
   examples do. Run `node tests/run.js`.
5. `py build/build.py projects/<name>` then `py tools/headless.py dist/<name>.html` (must PASS, then look at a
   `--shot` screenshot). Deliver `dist/<name>.html`; publish `dist/<name>.artifact.html` as an artifact if wanted;
   the `.playground.json` loads in `dist/player.html` from a URL or a local file.
6. Say plainly what was tested (node checks, headless load, screenshot) and what was not (a real phone, a real drag).

## mechanism.js contract
The file is a function body. It receives `CORE, SPRINGS, PNEUMATICS, LINKAGE2D, CONTACT, MAT4, MASSTABLE, BUNDLE,
DATA, CONFIG` and must `return` the mechanism:

| Key | Meaning |
|---|---|
| `dofs` | `[{ key, label, unit: "mm" or "deg", min, max, q0, hit: { e } }]` |
| `mass(q, sim)` | effective mass per DOF: kg (mm DOF) or kg*mm^2 (deg DOF, per radian) |
| `forces(q, v, t, sim)` | all forces per DOF except hand and friction: N or N*mm |
| `friction(q, v, sim)` | Coulomb magnitude per DOF (optional) |
| `bounds(q, sim)` | `[{ lo, hi }]` moving stops (optional; else dof min/max) |
| `update(sim, dt)` | per-substep state (valves, pneumatics, latches) (optional) |
| `grab` | `{ dof, k, c, max }` hand spring (N/mm or N*mm/deg), damper, cap |
| `hand` | `{ groups or parts, axis, pivot }`: which parts the hand grabs; drag direction (mm) or rotation axis + pivot (deg) |
| `pose(sim)` | `{ partId: 4x4 column-major }` for moving parts (use `MAT4`) |
| `design`, `settings` | design values; `[[key, label, step, min]]` editable in the page (`sim.P[key]`) |
| `resets`, `buttons` | `[{ label, where }]`; `[{ label, press(sim), active(sim), text(sim) }]` |
| `hud`, `readouts`, `gauges` | `{ big, state, chips }`; `[[label, text]]`; `[{ label, value, max, unit }]` |
| `eventText(e)`, `inset` | flash text for `sim.event` kinds; `{ title, draw(ctx, W, H, sim, css, dpr) }` canvas inset |
| `reset(sim, where)`, `onSetting(sim, k, v)`, `pageInit(sim)` | hooks (pageInit is async, runs in the page only) |
| `createSim()` | bring your own engine (see `examples/s3-side-table/adapter.js` for the sim interface the page needs) |

## Module recipes
- **Gravity + inertia of linkages:** `MASSTABLE.build({ parts: DATA.parts, pose: q => poseOf(q), dof, q0, grid, unit })`
  gives `M(q)` and `Q(q)` by virtual work from the packed mass properties. Check one value against a hand calculation.
- **Gas strut / springs:** `SPRINGS.gasStrut({ ext, stroke, F1, prog, damp, dampedFrac })`; generalised force =
  `F * dlen/dq` (per radian for a deg DOF). `SPRINGS.linear`, `SPRINGS.torsion`.
- **Pneumatics:** `PNEUMATICS.system({ supply, valve, tubeA/B, fcA/B, cyl })`; call `pn.step(x, v, dt)` in `update`,
  add `pn.force()` in `forces`, `pn.friction(v)` in `friction`; valve on a page button. Ask for valve C and b; the
  tube values are estimates. Tell the user to measure one stroke time and tune C/friction to it.
- **Linkages:** `LINKAGE2D.create({ bodies, ground, driver, sliders }).table(grid)` -> body `ang, dy, dz` per step;
  pose with `MAT4.planar(ang, dy, dz, "yz")`. Pins shared by name are revolute joints. Check closure (`ok`) on the
  whole range and say where it fails.
- **Cams, latches, guides:** `py build/contact_map.py cam.stl ...` -> map; `CONTACT.create(map).follow(...)` and
  `CONTACT.fall(...)` (see the S3 adapter + physics for a full latch).

## Physics rules that worked
- Substeps <= 0.1 ms and <= 0.01 unit of travel; the core holds the count steady (a count that follows the speed
  drains energy from undamped springs).
- Hand = spring + damper to the pointer target, force capped. Flicks keep momentum; a push into a stop builds force.
- Contact velocity from a map projection must be capped by the real slope and low-passed (~1 ms), or grid steps fling
  parts at m/s. Always keep the follower's own position as a candidate.
- Light spring plungers: small mass so drops take ~1 ms; fast pushes can skip a landing (a real effect).

## Traps (each cost real time)
- three.js poses: the page sets `matrixAutoUpdate = false` on every part; send full matrices from `pose()`.
- Headless Chrome runs few animation frames: test physics in node or step the sim yourself; `tools/headless.py`
  checks load, errors and the picture only. Headless has a ~500 px minimum width: test phones in a 390 px iframe.
- PowerShell `Get-Content`/`Set-Content` double-encode UTF-8 (x -> Ã—): edit files with the editor tools.
- A project name or title must not contain `/` (it becomes a file name).
- The standalone file has no artifact skeleton: keep the template's own `[hidden]` rule; overlays need
  `pointer-events: none`.
- The artifact iframe's console is not readable from the Chrome extension: use `tools/headless.py` stderr.
- The player runs projects in a sandboxed iframe (opaque origin): no localStorage there (the page handles it), and a
  bundle on another site needs CORS (GitHub Pages and raw.githubusercontent.com allow it).
- Never put a whole STEP/SolidWorks file in the repo of a public project unless the user wants the design public.

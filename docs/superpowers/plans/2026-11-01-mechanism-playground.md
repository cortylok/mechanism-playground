# Mechanism Playground Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publish `cortylok/mechanism-playground`: a public kit that turns STL exports of a mechanism into a
physics-based, interactive 3D browser page, with the S3 side table as the showcase example.

**Architecture:** One self-contained HTML page per project, built by `build/build.py` from the generic page template,
the physics core, the modules the project uses, the project's `mechanism.js` plug-in and its packed meshes. Physics
files have no DOM, so every mechanism runs in node for tests. The S3 example is a cleaned snapshot of the private S3
playground (approach B): its own physics and page source, built and tested in CI.

**Tech stack:** three.js r128 (cdnjs), plain ES2019 JavaScript, node >= 18 for tests (no npm packages), Python 3.11+
with numpy + trimesh + fast-simplification for packing, headless Chrome for page checks, GitHub Actions + Pages.

**Spec:** `docs/superpowers/specs/2026-11-01-mechanism-playground-design.md`.

**Execution note (corty 2026-11-01):** executed inline in one session. To save tokens, this plan holds each task's
files, interfaces, tests (as pass rules and test names) and commands; the implementation code is in the commits, not
copied here.

**Private sources (read, never copied whole):** `S` = the private S3 playground scripts folder (`scripts 24 (assembly playground)`).

---

## File map

| File | Responsibility |
|---|---|
| `physics/core.js` | Generic N-DOF integrator: hand, gravity via plug-in, Coulomb friction, stops with inelastic hits, substeps, event log, scripted push |
| `physics/mass_table.js` | Effective mass / inertia and gravity force per DOF from `pose()` + part mass properties (virtual work, numeric) |
| `physics/modules/springs.js` | Linear spring, torsion spring, gas strut |
| `physics/modules/pneumatics.js` | ISO 6358 flow, chambers, cylinder, valves, flow controls, cushions |
| `physics/modules/linkage2d.js` | Planar bodies + revolute/slider joints, Newton loop closure, pose tables |
| `physics/modules/contact_map.js` | Follower on a precomputed depth map |
| `build/pack.py` | `parts.json` + STLs -> `data.json` (Morton + delta + zlib + base64) |
| `build/contact_map.py` | STL cam surface -> depth map JSON for `contact_map.js` |
| `build/build.py` | Project folder -> `<name>.html` (standalone) + `<name>.artifact.html` |
| `template/page.html` | Generic page: viewer, input, section, Bodies, cards, marker, paint, speed, settings, readouts, buttons, phone drawer |
| `tests/run.js` | Runs every `tests/*.test.js` and every `examples/*/test.js` |
| `tools/sw_export.py` | SolidWorks assembly -> STLs + `parts.json` |
| `tools/holes.py` | Hole / counterbore / countersink finder |
| `tools/headless.py` | Headless Chrome: console errors + screenshot + black-frame check |
| `examples/starter/` | Hinged lid on a gas strut (generated shapes) |
| `examples/pneumatic-slide/` | Cylinder drives a sled on a rail into a stop, with valve and flow controls |
| `examples/s3-side-table/` | S3 snapshot: page source, physics, tests, packed data, CC BY-NC licence |
| `.claude/skills/mechanism-playground/SKILL.md` | Claude Code skill: adapt the kit to a new mechanism |
| `.github/workflows/ci.yml` | Node tests, example builds, headless checks, Pages deploy |

Spec deviations (recorded in the spec at the end): `build/phys_tables.py` becomes `physics/mass_table.js` (one pose
implementation, not a Python copy); a second small example `examples/pneumatic-slide/` shows the pneumatic UI.

---

### Task 1: Repo skeleton

**Files:** `README.md` (stub), `LICENSE` (MIT, "Copyright (c) 2026 cortylok"), `.gitignore` (`__pycache__/`,
`*.pyc`, `out/`, `dist/`, `*.artifact.html`), `requirements.txt` (`numpy`, `trimesh`, `fast-simplification`,
`scipy`), `tests/run.js`.

- [ ] `tests/run.js`: finds `tests/*.test.js` and `examples/*/test.js`, runs each with `node`, prints PASS/FAIL per
  file, exits 1 on any failure.
- [ ] Run `node tests/run.js` -> "0 test files" and exit 0.
- [ ] Commit "Repo skeleton".

### Task 2: Physics core

**Files:** `physics/core.js`, `tests/core.test.js`.

Interface (UMD: `module.exports` in node, `window.CORE` in the page):
```
CORE.create(mech) -> sim
  mech.dofs: [{ key, unit: "mm"|"deg", min, max, q0, hit: { e: 0 } }]
  mech.mass(q, sim) -> [m_i]            kg (mm DOF) or kg*mm^2 (deg DOF)
  mech.forces(q, v, t, sim) -> [F_i]    N (mm DOF) or N*mm (deg DOF), all forces except hand + friction
  mech.friction(q, v, sim) -> [f_i]     Coulomb magnitude per DOF (optional)
  mech.bounds(q, sim) -> [{lo, hi}]     optional; else dof min/max
  mech.grab: { dof, k: 60, c: 1.0, max: 400 }   hand spring N/mm (or N*mm/deg), damper, cap
  mech.update(sim, dt)                  optional per-substep state hook (valves, latches)
sim: { q, v, t, hand, target, vh, fHand, events, slow, P (design copy), step(frameDt), substep(dt),
       grab(), drag(target, vPointer), release(), scriptedPush(to, v, hold), reset(), event(kind, val) }
```
Rules: dt_sub <= 1e-4 s and travel <= 0.01 (unit) per substep; cap 6000 substeps, `sim.slow`; stops: position
clamped, velocity set to -e*v (e = 0 inelastic) and an event "stop" with speed; Coulomb friction sticks when
|v| <= f*dt/m and |F| <= f; units: mm, s, kg, N; acceleration in mm/s^2 = F/m * 1000; deg DOF: rad/s^2 = F/I*1e6
then converted to deg.

Tests (`tests/core.test.js`), each a PASS/FAIL line:
- free fall 0.2 s: drop = 0.5*9.81*0.2^2 m = 196.2 mm, within 0.5 %.
- spring-mass period: m 1 kg, k 1 N/mm -> T = 2*pi*sqrt(m/k_SI) = 0.19869 s, within 0.5 %.
- energy at zero damping over 10 periods: drift < 0.5 %.
- inelastic stop: hits the max stop, v = 0 after, event "stop" logged.
- Coulomb stick: F below friction -> no motion.
- hand: scriptedPush moves the DOF to the target and release stops the hand force.
- deg DOF: torsion pendulum period, within 0.5 %.

- [ ] Write the tests; run `node tests/core.test.js` -> FAIL (module missing).
- [ ] Write `physics/core.js` (semi-implicit Euler on each substep, the S3 hand and Coulomb rules).
- [ ] Run -> all PASS. Commit "Physics core".

### Task 3: Springs and gas struts

**Files:** `physics/modules/springs.js`, `tests/springs.test.js`.

Interface (`window.SPRINGS`):
- `linear({ k, free, preload })(x)` -> N, positive pushes apart.
- `torsion({ k, preloadDeg })(deg)` -> N*mm.
- `gasStrut({ ext, stroke, F1, prog, dampedFrac, damp })` -> `{ force(len, v), len0 }`: F = F1*(1+(prog-1)*comp),
  comp = (ext-len)/stroke clamped 0..1; extension damping `F1/damp*v` only inside the last `dampedFrac` of the
  extension stroke (dampedFrac 1 = whole stroke, as S3).

Tests: strut F at full extension = F1, at full compression = F1*prog, mid = F1*(1+prog)/2, all within 1 %; S3
values (F1 100, prog 1.3, ext 550, stroke 220) give `PHYS.strutForce` numbers within 1 %; linear spring Hooke; torsion.

- [ ] Tests first (FAIL), implement, PASS, commit "Springs and gas struts".

### Task 4: Pneumatics

**Files:** `physics/modules/pneumatics.js`, `tests/pneumatics.test.js`.

Model (SI inside the module, bar(g) / mm / N at the interface):
- ISO 6358 mass flow: `qm = C * p1 * rho0 * sqrt(T0/T1) * psi`, psi = 1 if pr = p2/p1 <= b, else
  `sqrt(1 - ((pr - b)/(1 - b))^2)`; reverse flow when p2 > p1. C in m^3/(s*Pa) (datasheet dm^3/(s*bar) / 1e8 * ...
  convert: `C_SI = C_dm3_s_bar * 1e-3 / 1e5`), rho0 = 1.185 kg/m^3, T0 = 293.15 K.
- Series elements -> one effective C, b: `1/C^3 = sum(1/C_i^3)` (ISO 6358-3 approximation),
  b = 1 - C^2 * sum((1 - b_i)/C_i^2) clamped 0..0.99.
- Tube estimate (override with datasheet values): effective area `S = A_bore / sqrt(1 + 0.02 * L/D)` mm^2,
  `C = S / 5` dm^3/(s*bar) (the S ~ 5C rule), b = 0.4.
- Chamber: state m (kg) and T held by polytropic n: `p = m*R*T/V`; `dp/dt = n/V * (R*T*qm_net - p*dV/dt)`,
  R = 287.1, integrated in the core substep through `update(sim, dt)`.
- Cylinder: bore, rod, stroke, dead volume each side (+ tube volume), cushion length + cushion C;
  force on the rod = pA*A_cap - pB*(A_cap - A_rod) - p_atm*A_rod (gauge-correct form), seal friction static/dynamic.
- Valves: `valve52({ C, b, solenoid: "single"|"double" })`, `valve32(...)`; state on/off; switch by `sim.event`,
  time, position or page button (`mech.buttons`).
- Flow control: meter-in or meter-out C setting with check-valve bypass (bypass C = valve C).
- Range guard: p < -0.01 bar(a) or p > supply + 1 % throws `PneumaticRangeError` with the chamber name.

Tests:
- choked flow (p1 6 bar(g), p2 0 bar(g), C 1 dm^3/(s*bar), b 0.3) = formula value within 1 %.
- subsonic flow (pr 0.7) = formula within 1 %.
- static force: cap 6 bar(g), rod side 0 bar(g), bore 32, rod 12 -> F = 0.6 MPa * pi*16^2 mm^2 = 482.5 N, minus
  friction, within 1 %.
- fill time of a fixed 0.1 L volume from 0 to 5 bar(g) through choked C: analytic isothermal time (n = 1) within 1 %.
- range guard throws on a forced over-pressure.

- [ ] Tests first (FAIL), implement, PASS, commit "Pneumatics module".

### Task 5: Planar linkage solver + S3 golden test

**Files:** `physics/modules/linkage2d.js`, `tests/linkage2d.test.js`, `tests/data/s3_golden_poses.json`.

Interface (`window.LINKAGE2D`):
```
LINKAGE2D.create({ bodies: { name: { pins: { P: [y, z] } } }, ground: { P: [y, z] }, joints: [["body.P", "body.P"|"ground.P"]],
                   driver: { body, pivot: "P", angleDeg } })
  .solve(angleDeg, guess) -> { ok, pins: { P: [y, z] }, bodies: { name: { ang, dy, dz } } }
  .table(anglesDeg) -> poses for each angle, continuation from the previous solution
```
Full coordinates (x, y, theta per body), Newton with a dense Gauss elimination, tolerance 1e-10 mm, 30 iterations.

Golden data: a one-off scratchpad script imports the private `linkage2d.kinematics.solve` and `s3_geom.design()`,
writes the pin positions at phi = 0 and the solved pins over the S3 phi grid (0 .. -84 deg, 0.25 step) to
`tests/data/s3_golden_poses.json`. The private solver is not shipped.

Tests: S3 golden: every pin within 0.01 mm at every phi step; simple four-bar: crank-rocker closes (Grashof) and
the coupler point matches the analytic position; singular pose returns ok false (no throw).

- [ ] Export golden JSON (scratchpad), tests first (FAIL), implement, PASS, commit "Planar linkage solver".

### Task 6: Contact maps

**Files:** `physics/modules/contact_map.js`, `build/contact_map.py`, `tests/contact_map.test.js`.

- `contact_map.py <stl> --axis y --res 0.05 --tip-r R --x a b --z c d -o map.json`: rays along the axis over the
  (x, z) grid give the surface depth; a disc min-filter of radius R gives where a ball/pin tip of radius R can sit;
  writes zlib + base64 uint8 (depth/scale, 255 = wall) with x0, z0, res, nx, nz, scale, min_wall (deg).
- `CONTACT.create(map)` -> `{ depthAt(x, z), follow(state, x1, z1, dt) }`: the S3 candidate search (own x first,
  friction-cone reach `|ds|/tan(minWall) + 2.5*res`), contact velocity capped by the slope and low-pass ~1 ms.

Tests (synthetic V-groove map built in the test): follower dropped above the groove settles at the bottom; a wall
blocks it; the projected velocity never exceeds the slope cap.

- [ ] Tests first (FAIL), implement JS, PASS; run `contact_map.py` on a generated V-groove STL and check its depth
  at 3 points against the analytic surface (within one cell). Commit "Contact maps".

### Task 7: Mesh packing

**Files:** `build/pack.py`, `tests/pack.test.js`, `tests/data/cube.stl` (generated).

`parts.json` schema:
```
{ "name": "...", "units": "mm", "up": "z",
  "parts": [ { "id": "lid", "stl": "meshes/lid.stl", "group": "lid", "label": "Lid", "colour": "#b98a55",
               "mass": 0.42, "com": [x, y, z], "inertia": [[...3x3 kg*mm^2 about com]], "info": { "rows": [["Material", "Ply"]] } } ],
  "groups": [ { "key": "lid", "label": "Lid", "mode": "solid" } ] }
```
`pack.py <project>` -> `<project>/out/data.json` with `enc()` from S `pack.py` (Morton order, delta coding) and the
mass properties; decimates parts above `MAX_TRIS` (default 20000); stops with a clear message when an STL is missing
or not watertight (warning only for not watertight; error for missing).

Test: node decodes `data.json` for a cube and gets the 8 corners within the quantisation step.

- [ ] Tests first (FAIL), implement, PASS, commit "Mesh packing".

### Task 8: Generic page template

**Files:** `template/page.html` (from S `play_template.html`).

Keep: viewer + 2D-free load cover, orbit/pan about the pointer point, wheel/pinch zoom to the pointer, view presets
(from `config.views`), section view with hatched caps, Bodies (groups from `config.groups`, per-part modes, opacity,
outline mode), tap pill + cards (rows from `info`), marker + paint (artifact db when `window.claude` exists, else
off with a note), speed panel, collapsible panels with saved open state, phone drawer, settings panel built from
`mech.design` with "Design values", readouts from `mech.readouts`, buttons from `mech.buttons`, gauges for
pneumatic chambers when present, event flash + click sound.
Remove: S3 pose tables, latch inset, find-a-pivot, J3, proposal colours, MECH preset names, S3 text.
Plug-in hooks the page calls: `MECH.pose(sim) -> { partId: THREE-free {m: [16 numbers column-major]} }`,
`MECH.handAxis` (world direction of the grabbed DOF, or "angle" with axis + pivot), `MECH.readouts`,
`MECH.buttons`, `MECH.design`, `MECH.settings`.
Placeholders replaced by `build.py`: `/*__DATA__*/null`, `/*__PHYSICS__*/`, `/*__MECH__*/`, `/*__CONFIG__*/null`,
`__TITLE__`, `__KEY__` (localStorage prefix).

- [ ] Write the template; built and checked in Task 10/11 (no unit test here). Commit "Generic page template".

### Task 9: Page builder

**Files:** `build/build.py`.

`py build/build.py examples/starter` reads `project.json` (`name`, `title`, `modules: [...]`, `mech: "mechanism.js"`,
`config: "config.json"`), runs pack when `out/data.json` is older than any STL, inlines core + modules + mech +
data + config into the template, asserts no `</script` in inlined text and that the page calls only defined
globals, writes `dist/<name>.html` (standalone, own doctype + `[hidden]` rule) and `dist/<name>.artifact.html`.
Title must not contain `/`.

- [ ] Implement; build the starter (Task 10) as its test. Commit "Page builder".

### Task 10: Starter example (lid on a gas strut)

**Files:** `examples/starter/make_parts.py` (writes box/cylinder STLs + `parts.json`), `project.json`,
`config.json`, `mechanism.js`, `test.js`.

Mechanism: box 400 x 300 x 200 mm, lid 6 kg hinged at the back edge (deg DOF 0 .. 95), gas strut between box side and
lid (F1 from `design`), stop at 95 deg, hand on the lid front edge.
Tests: closed lid with F1 too small stays shut; with the design F1 a lift past the balance angle opens to the stop;
held at 45 deg and let go it moves the way the torque sign says; mass table matches the analytic I = m*(L^2/3) within 1 %.
Page check: `tools/headless.py dist/starter.html` -> no console errors, screenshot not black.

- [ ] Tests first (FAIL), implement, PASS, build, headless check. Commit "Starter example".

### Task 11: Pneumatic slide example

**Files:** `examples/pneumatic-slide/{make_parts.py, project.json, config.json, mechanism.js, test.js}`.

Mechanism: 32 bore x 100 stroke cylinder, rod drives a 2 kg sled on a rail, 5/2 single-solenoid valve, 4 mm ID x
1 m tubes, meter-out flow controls both sides, 15 mm cushions, supply 6 bar(g); page buttons "Valve", gauges A/B,
dials for flow controls; the hand can push the sled.
Tests: extends and retracts on valve switch; extend time falls when the meter-out opens; impact speed with cushion <
without cushion; at 1 bar supply with a 300 N load the sled stalls.

- [ ] Tests first (FAIL), implement, PASS, build, headless check. Commit "Pneumatic slide example".

### Task 12: S3 side-table example (snapshot)

**Files:** `examples/s3-side-table/{page_template.html, physics.js, test.js, build.py, LICENSE, README.md,
data/data.json, data/phys.json, data/latch_hs2e.json}`.

- Copy S `play_template.html`, `physics.js`, `test_physics.js` (paths changed to `data/`), `out/phys.json`,
  `out/latch_hs2e.json`; `data.json` from S `out/data.json` through a scrub script: drop card rows whose key names a
  supplier, code, price, order, CAD or print file path; strip `C:\` paths, the email, claude.ai URLs.
- `build.py` = S `build_play.py` with relative paths -> `dist/s3-side-table.html`.
- LICENSE = CC BY-NC 4.0 notice text + link.
Tests: `node examples/s3-side-table/test.js` all pass (the 8 S3 groups); headless check of the built page.

- [ ] Copy + scrub, run tests, build, headless check. Commit "S3 side-table example".

### Task 13: Tools

**Files:** `tools/sw_export.py`, `tools/holes.py`, `tools/headless.py`.

- `sw_export.py`: attaches to a running SolidWorks (pywin32 `GetActiveObject("SldWorks.Application")`), walks the
  active assembly's visible components, saves each as STL in assembly coordinates (output in mm, binary,
  fine tolerance), reads mass properties (`GetMassProperties2`) into `parts.json`, and never saves the assembly.
- `holes.py`: S `holes.py` without S3 constants; `py tools/holes.py part.stl` lists holes.
- `headless.py <html> [--width 390]`: runs Chrome headless (`--headless=new --enable-logging=stderr --screenshot`),
  fails on console errors or a screenshot that is > 98 % one colour.

Tests: `headless.py` on each built example; `holes.py` on a generated plate with a D6 hole finds D6.00 ± 0.05;
`sw_export.py` run once against a small read-only SW assembly if SolidWorks is open (report if not run).

- [ ] Implement, run the checks, commit "Tools".

### Task 13a: Project loader (spec section 10a, added by corty 2026-11-01)

**Files:** `build/build.py` (also writes `dist/<name>.playground.json`), `template/page.html` (loader hooks),
`build/build_player.py` -> `dist/player.html`, `projects.json`, `tests/loader.test.js`.

- The template gets one boot path: `boot(bundle)`. Standalone pages call it with the inlined bundle; the player calls
  it after loading. Re-loading tears down the scene, the sim and the panels before the next boot.
- Player sources: `?project=<url>`, URL box, file picker, drag and drop, `projects.json` list, recent list
  (localStorage `mpg.recent`, 10 entries). Relative URLs resolve against the player's location.
- Trust: built-in = listed in `projects.json` with `"builtin": true`. Any other source -> a confirm panel (source
  text, warning) before `mech` runs; confirmed sources saved in `mpg.trusted`.
- `mech` runs through `new Function("CORE", "SPRINGS", "PNEUMATICS", "LINKAGE2D", "CONTACT", src)` and must return the
  mechanism object (the standalone page uses the same wrapper).
- Format check: `format` must start with `mechanism-playground/1`, else an error panel names the found value.

Tests (`tests/loader.test.js`, node): `loadBundle()` (pure function in `physics/bundle.js`) accepts each built example
bundle, rejects a wrong format with a clear message, rejects a bundle whose `mech` does not return `dofs`; each
example's mechanism from its bundle steps 1 s without errors. Page check: `tools/headless.py` on
`dist/player.html?project=starter.playground.json` served by `py -m http.server`.

- [ ] Tests first (FAIL), implement, PASS, headless check. Commit "Project loader".

### Task 14: Claude Code skill

**Files:** `.claude/skills/mechanism-playground/SKILL.md`.

Content: when to use; the workflow (spec section 6); the plug-in contract (Task 2 + Task 8 hooks); a recipe per
module; the datasheet checklist; the input/physics patterns and every trap listed in spec section 7; how to test
(node, `tools/headless.py`) and deliver (standalone + artifact).

- [ ] Write, commit "Claude Code skill".

### Task 15: README, Pages, CI

**Files:** `README.md`, `docs/index.html` (links to the demos), `.github/workflows/ci.yml`.

- CI (ubuntu-latest): node 20 `node tests/run.js`; Python 3.12 `pip install -r requirements.txt`; build the three
  examples; headless Chrome checks; on push to main upload `docs/` + `dist/*.html` to Pages
  (`actions/upload-pages-artifact@v3`, `actions/deploy-pages@v4`).
- README: what it is, live demo links, quick start with Claude Code, quick start by hand, modules, licence split.

- [ ] Write, run the whole suite locally, commit "README, Pages, CI".

### Task 16: Scan and publish

- [ ] Scan every tracked file for `C:\\Users`, `cortylok@`, `claude.ai/`, `$` prices, supplier code patterns; zero hits
  except the README's GitHub URL.
- [ ] `gh repo create cortylok/mechanism-playground --public --source . --push`.
- [ ] Enable Pages (GitHub Actions source); wait for CI; open the live demo URLs and confirm they load.
- [ ] Update the spec's deviations section, the memory file and report.

# Mechanism playground: public repo design

Date: 2026-11-01. Owner: corty (cortylok). Status: design approved section by section; spec awaiting review.

## 1. Purpose

A public GitHub repo that holds the reusable parts of the S3 side-table browser playground. A person with
Claude Code clones it, exports their CAD, and gets a physics-based, interactive 3D test page for their own
mechanism. The page is one HTML file that runs on a desktop and on a phone.

First known user: a friend of corty who designs a pneumatic mechanism in SolidWorks.

## 2. Decisions

| Item | Decision |
|---|---|
| Audience | Claude Code users. The repo ships a Claude Code skill. The code stays readable by hand. |
| Approach | B, cleaned snapshot. The public repo is a separate copy. corty's private `scripts 24` stays as it is and is not changed. |
| Demo | The S3 side-table assembly (state at playground v43, 2026-10-31) plus a new minimal starter example. |
| Licence | MIT for all code. CC BY-NC 4.0 for `examples/s3-side-table/` (meshes, data, spec text). |
| CAD input | One STL per part in assembly position + `parts.json`. A SolidWorks exporter script ships in `tools/`. |
| Modules in v1 | Springs and gas struts, cam and guide contact maps, pneumatic cylinder and valves, planar linkage solver. |
| Repo | `cortylok/mechanism-playground`, public from the first push (corty 2026-11-01). GitHub Pages serves the demos. |

## 3. Repo layout

| Path | Content | Source |
|---|---|---|
| `template/` | Page template: three.js viewer with 2D fallback, orbit and pan about the point under the pointer, wheel and pinch zoom, view presets, section view with hatched caps, Bodies panel (solid / see-through / off, opacity, outline mode), tap pill and spec cards, marker and paint (artifact db), speed panel, phone drawer (<= 720 px) | `play_template.html`, with S3-only code moved to the example where the split is easy |
| `physics/core.js` | Integrator, substeps, hand (spring + damper to the pointer), gravity, Coulomb friction, stops with inelastic hits, event log, test hooks. No DOM. | `physics.js`, cleaned |
| `physics/modules/springs.js` | Linear and torsion springs; gas strut | From S3 |
| `physics/modules/contact_map.js` | Follower depth-map contact | From S3 latch and knob guide |
| `physics/modules/pneumatics.js` | Cylinder, valves, flow controls, cushions | New |
| `physics/modules/linkage2d.js` | Planar loop-closure solver | New |
| `build/pack.py` | STL to compressed page data (Morton order, delta coding, zlib + base64) | `pack.py`, cleaned |
| `build/build.py` | Writes the standalone HTML and the artifact body for one project folder | `build_play.py`, cleaned |
| `build/phys_tables.py` | Mass and inertia tables over the DOF range | `phys_tables.py`, generalised |
| `build/contact_map.py` | Makes contact maps from STLs | From S3 latch lab |
| `tools/sw_export.py` | SolidWorks (pywin32): one STL per part in assembly position + `parts.json` with mass properties | Pattern of scripts 23 `export_s3.py` |
| `tools/holes.py` | Finds holes, counterbores and countersinks in meshes | `holes.py` |
| `tools/headless.py` | Headless Chrome check: console errors + screenshot | S3 test notes and scratchpad `inject.py` |
| `examples/starter/` | One hinged lid on a gas strut, made from simple shapes | New |
| `examples/s3-side-table/` | S3 meshes, poses, phys tables, S3 plug-in (lift, knob guide, latch, pogo pins), spec cards, own LICENSE | S3 v43 data |
| `.claude/skills/mechanism-playground/` | Claude Code project skill: adapt the kit to a new mechanism (loads on its own when Claude Code opens the repo) | `browser-playground` skill + S3 traps |
| `docs/` | GitHub Pages output (built demos) + this spec | New |
| root | README, LICENSE (MIT), `.github/workflows/ci.yml` | New |

### Not in the repo

- SolidWorks part, assembly and drawing files, DXFs, quote packs, print 3MF files.
- BOM supplier codes and prices. S3 cards keep part names and specs only.
- Marker and paint database contents.
- The S3 design-history scripts (CAD edits, checks, studies, about 50 files).
- Local paths, corty's email address, claude.ai artifact URLs.

## 4. Physics plug-in contract

Each mechanism supplies `mechanism.js`:

| Item | Meaning |
|---|---|
| `dofs` | Moving coordinates with units and ranges (for example lift mm, arm angle deg) |
| `pose(q)` | Part transforms for a coordinate set, from the linkage solver or from CAD pose tables |
| `mass(q)` | Effective mass or inertia per DOF, from precomputed tables |
| `forces(q, v, t, state)` | Sum of module forces plus gravity plus any mechanism-specific force |
| `bounds(q)` | Stops and guide edges; the core applies the hits and friction |
| `grab` | Which parts the hand can pull, and on which DOF |
| `readouts` | Values the page shows (name, unit, function) |
| `design` | Design values for the settings panel and its "Design values" reset |

Rules:
- Substep dt <= 1e-4 s and travel per substep <= 0.01 mm; cap 6000 substeps per frame and show "sim slower".
- Plug-ins and modules never touch the DOM. All physics runs in node.
- Contact velocity from projection is capped by the real slope and low-pass filtered (about 1 ms).

## 5. Modules

### 5.1 Springs and gas struts
- Linear spring: rate, free length, preload. Torsion spring: rate, preload angle.
- Gas strut: F1 at full extension, progression ratio, damped fraction of the stroke, end stops, optional
  switch off (path-driven mode, as S3 v37).
- Test: force over stroke against the datasheet curve within 1 %.

### 5.2 Contact maps
- Precomputed depth map of where a follower can sit (-1 = wall). Candidate search around the inertial
  prediction within the friction-cone reach; the follower's own position is always a candidate.
- Test: the S3 latch cycle gives pin vs cam overlap <= 0.05 mm3; a short push stays latched; a 3.4 mm push
  releases.

### 5.3 Pneumatics
- Two chambers (cap end, rod end), each with pressure state and a polytropic gas law (n settable, default 1.2).
- Mass flow through each path with the ISO 6358 model (sonic conductance C, critical pressure ratio b);
  series elements (valve, tube, flow control) combined into one effective C and b.
- Meter-in and meter-out flow controls; one-way bypass.
- Cushions: the flow path changes to a smaller C over the last `cushion length` of the stroke.
- Seal friction: static and dynamic values, with a breakaway force.
- Dead volume of ports and tubes from tube ID and length.
- Valve types in v1: 5/2 single and double solenoid, 3/2. The valve switches by time, by position, or by a
  page button.
- Page: a pressure gauge per chamber, a valve button, flow-control dials in the settings panel.
- Errors: a pressure below 0 or above supply + 1 % stops the run with an error message. No silent clamp.
- Tests: choked and subsonic flow against the ISO 6358 formula within 1 %; static force
  F = pA·A − pB·(A − a) − friction within 1 %; fill time of a fixed volume against the analytic gas law within 1 %.

### 5.4 Planar linkage solver
- Joint list (revolute, slider), link list, one driver DOF. Newton loop closure from the previous pose.
- Output: pose tables over the driver range and the Jacobian; effective mass by virtual work.
- Test: S3 linkage poses against golden poses from corty's private `linkage2d` solver (exported once into
  `examples/s3-side-table/golden_poses.json`; the private solver itself is not shipped), <= 0.01 mm at every
  lift step.

## 6. Workflow (user with Claude Code)

1. Clone the repo; open Claude Code in it; the project skill in `.claude/skills/` is available at once.
2. Export parts: `tools/sw_export.py` for SolidWorks, or STLs by hand + `parts.json` from the template.
3. Tell Claude the joints, springs, cylinders and what to test. Claude copies `examples/starter/` to
   `projects/<name>/` and writes `mechanism.js` and `config.json`.
4. `python build/build.py projects/<name>` writes `<name>.html` (standalone) and `<name>.artifact.html`.
5. Claude runs the node tests and `tools/headless.py`, then the user opens the page.

| Stage | Files | Made by |
|---|---|---|
| CAD export | `meshes/*.stl`, `parts.json` | SW exporter or user |
| Mechanism | `mechanism.js`, `config.json` (groups, views, cards, design values) | Claude, from the skill |
| Tables | `phys.json` (mass tables, contact maps, linkage poses) | `build/` tools |
| Page | `<name>.html` with mesh data inline | `build/build.py` |

## 7. Skill content

- The plug-in contract and one recipe per module.
- A datasheet checklist (strut F1 and progression, valve C and b, tube sizes, seal friction).
- Input and physics patterns from the `browser-playground` skill (phone touch code, hand model, substeps).
- Traps found on S3: `matrixAutoUpdate` must be false on posed meshes; headless rAF is too sparse, so drive
  the physics step directly; headless Chrome has a ~500 px minimum width (test phones in a 390 px iframe);
  PowerShell `Get-Content`/`Set-Content` double-encodes UTF-8; a build label must not contain `/`; the
  standalone file needs its own `[hidden]` rule and overlays need `pointer-events:none`; the artifact iframe
  console is not readable from the Chrome tool (use headless stderr).

## 8. Errors

- `build.py` stops with a clear message when a part in `parts.json` has no STL or a mesh is not manifold.
- The page falls back to the 2D renderer when WebGL or the CDN fails.
- "sim slower" shows when substeps reach the cap.
- Pneumatics range errors stop the run (5.3).

## 9. Tests and CI

| Area | Pass rule |
|---|---|
| Core: free fall, spring-mass period, energy at zero damping, inelastic stop | Within 0.5 % of analytic |
| Springs and struts | Section 5.1 |
| Contact maps | Section 5.2 |
| Pneumatics | Section 5.3 |
| Linkage solver | Section 5.4 |
| S3 demo | The current S3 `test_physics.js` suite all pass |
| Pages | Headless Chrome on each example: no console errors, screenshot not black |

GitHub Actions runs the node tests and the headless page check on every push.

## 10. Release

1. Build and test locally.
2. Scan for local paths (`C:\Users`), corty's email, claude.ai URLs, BOM prices and supplier codes. Zero hits.
3. Create `cortylok/mechanism-playground` as public and push (corty approved public from the first push).
4. Turn on GitHub Pages from `docs/`.

## 10a. Project loader (added by corty 2026-11-01)

The playground can load different projects. A project can be on the user's computer, in its own repo, or on any server.

- **Bundle:** `build.py` also writes `dist/<name>.playground.json`, one file with everything a project needs:
  `{ format: "mechanism-playground/1", name, title, config, data, mech (mechanism.js source), modules: [...] }`.
  Meshes stay packed inside `data` (as in `data.json`).
- **Player page:** `player.html` (on GitHub Pages, also works as a local file) holds the template, the core and
  every module. It loads a bundle from:
  - a URL: `player.html?project=<url>` or a URL box. Any server that allows CORS works: GitHub Pages,
    `raw.githubusercontent.com`, a release asset, a private server.
  - a local file: file picker or drag and drop of a `.playground.json`.
  - the project list: `projects.json` in the repo (the built-in examples plus community entries added by pull
    request).
  - the recent list: the last 10 loaded sources, kept in the browser's localStorage.
- **Trust:** a bundle carries JavaScript (`mech`). Before it runs a bundle from a source that is not built-in, the
  player shows the source and asks the user to confirm. Each confirmed source is remembered. The page holds no
  secrets. The warning tells users to load only projects they trust.
- **Version check:** the player refuses a bundle with an unknown `format` major version and names the problem.
- **Standalone pages stay:** `dist/<name>.html` is still built for email and phones (one file, no loading).
- **Marker and paint** use a per-project key (`project name`) in the artifact db and localStorage.

## 10b. Deviations found while building (2026-11-01)

- `build/phys_tables.py` became `physics/mass_table.js`: one pose implementation (the mechanism's `pose()`), no
  Python copy.
- Added `examples/pneumatic-slide/` to show the pneumatic UI (valve button, gauges, flow-control settings).
- Pneumatic range guard: real cushions and hand pushes raise a chamber above supply, so the guard stops only on
  non-physical results (absolute pressure <= 0, NaN, > 5 x supply), not at supply + 1 %.
- The player runs each project in a sandboxed iframe (`sandbox="allow-scripts"`, opaque origin) instead of a
  teardown/re-boot in one page: project code cannot read the player's storage, and each load is a fresh page.
- A mechanism may bring its own engine (`createSim()`): the S3 example keeps its original physics this way and runs
  on the generic page and in the player. Its "find a pivot" panel and J3 study (S3-only) are not in the generic page.
- Substep count is held steady (power of two with hysteresis): a count that follows the speed every frame drained
  ~0.4 %/s of energy from an undamped spring.
- `tools/sw_export.py` is written from the S3 export pattern but was not run (SolidWorks was not open).

## 11. Out of scope for v1

- STEP import.
- Spatial (3D) linkage solving.
- Free multi-body collision (rigid-body library).
- Part flex or FEA, CFD.
- Sync between the public repo and corty's private S3 scripts (approach B).

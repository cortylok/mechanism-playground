# Mechanism playground

Physics-based, interactive 3D test pages for mechanisms, built from CAD exports. Drag a part with the mouse or a
finger: real masses, springs, gas struts, air cylinders, friction and stops answer. Rotate, zoom, cut a section, tap a
part for its spec card, draw on the model. Each project builds to one HTML file that opens on a phone from an email.

**Live:** [player](https://cortylok.github.io/mechanism-playground/player.html) ·
[starter: lid on a gas strut](https://cortylok.github.io/mechanism-playground/starter.html) ·
[2-finger gripper](https://cortylok.github.io/mechanism-playground/gripper.html) ·
[pneumatic slide](https://cortylok.github.io/mechanism-playground/pneumatic-slide.html) ·
[S3 side table (showcase, 7 MB)](https://cortylok.github.io/mechanism-playground/s3-side-table.html)

## What it does

| Area | What you get |
|---|---|
| Physics | Hand = spring + damper to your pointer (no motion sliders). N-DOF core with substeps, Coulomb friction, stops. Modules: springs and gas struts, pneumatic cylinders (ISO 6358 flow, valves, flow controls, cushions), planar linkage solver, cam / latch contact maps, mass tables from part mass properties |
| Page | Orbit and zoom about the point under the pointer, view presets, section view with hatched faces, show / see-through / hide per group or part, tap cards, marker lines and surface paint (saved when published as a claude.ai artifact), speed control, model settings, phone layout |
| Player | Loads any project bundle from a link (its own repo, GitHub Pages, any CORS server), a local file (picker or drag and drop), the project list, or the recent list. Projects run in a sandbox |
| Tools | SolidWorks exporter (STL per part + mass properties), STL depth maps for cams, hole finder, headless page check |

## Quick start with Claude Code

```
git clone https://github.com/cortylok/mechanism-playground
cd mechanism-playground
pip install -r requirements.txt
claude
> Make a playground for my mechanism. The STLs are in C:\cad\gripper, the jaws pivot on ..., the cylinder is ...
```

The repo ships a project skill (`.claude/skills/mechanism-playground/`) with the plug-in contract, a recipe per module
and the traps found so far. Claude writes the mechanism plug-in and its tests, builds the page and checks it.

## With any AI assistant

Give your assistant this guide: <https://cortylok.github.io/mechanism-playground/ai-guide.md> (`AI_GUIDE.md` here). It explains the playground from zero, what to ask you, and the full procedure from CAD files to a tested page. The player has a ready-to-copy prompt ("Set up your own model with AI"). `CLAUDE.md` and `AGENTS.md` point coding agents to the guide when they open this repo.

## Quick start by hand

1. Copy `examples/starter` to `projects/<name>`.
2. Put one STL per part (assembly position, mm, z up) in `meshes/` and list them in `parts.json`
   (SolidWorks: `py tools/sw_export.py projects/<name>` with the assembly open).
3. Edit `mechanism.js`: degrees of freedom, masses, forces, the hand, the poses. See `examples/*/mechanism.js` and the
   contract table in the skill file.
4. `py build/build.py projects/<name>` -> `dist/<name>.html` (standalone), `dist/<name>.artifact.html`,
   `dist/<name>.playground.json` (for the player).
5. `node tests/run.js` and `py tools/headless.py dist/<name>.html`.

To share a project from its own repo: publish the `.playground.json` (for example on GitHub Pages) and send
`https://cortylok.github.io/mechanism-playground/player.html?project=<its URL>`. To list it in the player, open a pull
request that adds it to `projects.json`.

## Layout

| Path | Content |
|---|---|
| `physics/` | `core.js` (integrator, hand, friction, stops), `mat4.js`, `mass_table.js`, `bundle.js` (decoders, bundle checks, mechanism loader), `modules/` (springs, pneumatics, linkage2d, contact_map) - no DOM, all run in node |
| `template/` | `page.html` (the playground page), `player.html` (the loader shell) |
| `build/` | `pack.py` (STLs -> packed data), `build.py` (pages, bundles, player), `contact_map.py` |
| `tools/` | `sw_export.py`, `holes.py`, `headless.py` |
| `examples/` | `starter`, `gripper` (a real downloaded SolidWorks assembly, CAD by Hussein Syria), `pneumatic-slide`, `s3-side-table` |
| `tests/` | `node tests/run.js` runs every test (node and Python) |

## Limits

Rigid parts only (no flex or FEA). Air is a lumped model, not CFD: expect stroke times within about 10-20 % with
datasheet values. Linkages are planar. Free multi-body collisions are not modelled: contact is through stops, guides
and precomputed maps that the mechanism defines.

## Credits

Gripper CAD model: "2-finger robotic gripper mechanism (end effector)" by Hussein Syria (GrabCAD, September 11th, 2026).

## Licence

Framework: MIT (`LICENSE`). The S3 side-table example (`examples/s3-side-table/`) is CC BY-NC 4.0: free to look at,
share and learn from, not for commercial use.

# S3 side table (showcase example)

A real design project: a lift-up side table with a gas strut, a push-push latch, a door linkage driven by a knob in a
guide, and a pogo-pin power dock. It shows what a full project looks like in the playground: 300 parts, spec cards,
views with display presets, a custom physics engine and an inset drawing.

- `data/data.json`: packed meshes and tables (link poses from the CAD solver, latch cam map, physics tables).
  It was packed by the original project's scripts; this example ships the result only.
- `physics.js`: the S3 physics engine (lift DOF, knob-in-guide DOF with edge contact, latch arm and spring pin on the
  cam map, dock pins). It brings its own engine instead of `physics/core.js`.
- `adapter.js`: connects that engine to the generic page (`createSim`, poses, the latch inset, readouts, controls).
- `test.js`: the original physics test suite, run through the bundle loader.

Build: `py build/build.py examples/s3-side-table` -> `dist/s3-side-table.html` (about 7 MB).

Licence: CC BY-NC 4.0 (see `LICENSE` here). The framework itself is MIT.

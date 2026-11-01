# Agent instructions

This repo builds interactive, physics-based 3D pages for mechanisms from CAD exports. Before any work, read
`AI_GUIDE.md` (also at https://cortylok.github.io/mechanism-playground/ai-guide.md). It assumes you know nothing about
the project and covers: what to ask the person, the export -> plug-in -> test -> build -> share procedure, the
`mechanism.js` contract, the module APIs with units, and the traps found so far.

Checks: `node tests/run.js` (all tests), `py build/build.py <project>`, `py tools/headless.py dist/<name>.html`.

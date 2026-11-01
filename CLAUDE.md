# Mechanism playground

Read `AI_GUIDE.md` first: it explains the playground, the procedure from a CAD model to an interactive physics page,
the plug-in contract, every module's API, testing, sharing and the known traps. The project skill
`.claude/skills/mechanism-playground/` holds the same knowledge in short form.

Rules for this repo:
- Physics files (`physics/`, every `mechanism.js`) have no DOM: they must run in node for tests.
- Run `node tests/run.js` before you say anything works; build pages with `py build/build.py <project>` and check them
  with `py tools/headless.py dist/<name>.html`. Say plainly what you did not test (a real drag, a phone).
- A person's own model goes in `projects/<name>/` (git-ignored) unless they want it public. Credit authors of
  downloaded models.

"""Build a project into playground pages.

  py build/build.py examples/starter            -> dist/starter.html (standalone, one file: email / phone)
                                                   dist/starter.artifact.html (body for a claude.ai artifact)
                                                   dist/starter.playground.json (bundle for the player)
  py build/build.py --player                    -> dist/player.html (loads bundles from a URL or a local file)

project.json: { "name": "starter", "title": "Lid on a gas strut", "mech": "mechanism.js", "config": "config.json",
                "data": "out/data.json" (optional: default = pack parts.json) }
"""
import glob
import json
import os
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DIST = os.path.join(ROOT, "dist")
FORMAT = "mechanism-playground/1"
GUIDE = "https://cortylok.github.io/mechanism-playground/ai-guide.md"         # AI_GUIDE.md, served by GitHub Pages
PHYSICS = ["physics/core.js", "physics/mat4.js", "physics/mass_table.js", "physics/bundle.js", "physics/modules/springs.js",
           "physics/modules/pneumatics.js", "physics/modules/linkage2d.js", "physics/modules/contact_map.js"]


def fail(msg):
    sys.exit(f"build.py: {msg}")


def read(path):
    return open(path, encoding="utf-8").read()


def physics_js():
    src = "\n".join(f"// ---- {p}\n" + read(os.path.join(ROOT, p)) for p in PHYSICS)
    if "</script" in src.lower():
        fail("a physics file contains '</script' - it would end the page's script tag")
    return src


def safe_json(obj):
    return json.dumps(obj, separators=(",", ":")).replace("</", "<\\/")


def stale(project, data_path):
    if not os.path.exists(data_path):
        return True
    t = os.path.getmtime(data_path)
    srcs = [os.path.join(project, "parts.json")] + glob.glob(os.path.join(project, "**", "*.stl"), recursive=True)
    return any(os.path.getmtime(s) > t for s in srcs if os.path.exists(s))


def bundle(project):
    pj = os.path.join(project, "project.json")
    if not os.path.exists(pj):
        fail(f"{pj} not found")
    P = json.load(open(pj, encoding="utf-8"))
    name, title = P["name"], P.get("title", P["name"])
    if "/" in name or "/" in title or "\\" in name:
        fail("name and title must not contain / or \\ (they become file names)")
    data_path = os.path.join(project, P.get("data", "out/data.json"))
    if "data" not in P and stale(project, data_path):
        r = subprocess.run([sys.executable, os.path.join(ROOT, "build", "pack.py"), project])
        if r.returncode:
            fail("packing failed")
    if not os.path.exists(data_path):
        fail(f"{data_path} not found")
    cfg_path = os.path.join(project, P.get("config", "config.json"))
    config = json.load(open(cfg_path, encoding="utf-8")) if os.path.exists(cfg_path) else {}
    files = P.get("mech", "mechanism.js")                           # one file, or a list joined in order
    mech = "\n".join(read(os.path.join(project, f)) for f in ([files] if isinstance(files, str) else files))
    data = json.load(open(data_path, encoding="utf-8"))
    for k, v in (P.get("extra") or {}).items():                      # extra data files merged into data (e.g. maps)
        data[k] = json.load(open(os.path.join(project, v), encoding="utf-8"))
    ai = dict(guide=GUIDE, note="Built with the mechanism playground. AI assistants: read the guide before changing or "
              "rebuilding this model; 'mech' is the physics plug-in (JavaScript), 'data' the packed parts, 'config' the page text.")
    return dict(format=FORMAT, name=name, title=title, ai=ai, config=config, data=data, mech=mech)


def page(title, bundle_json):
    tpl = read(os.path.join(ROOT, "template", "page.html"))
    for k in ("/*__PHYSICS__*/", "/*__BUNDLE__*/null", "__TITLE__"):
        if k not in tpl:
            fail(f"template is missing the placeholder {k}")
    return tpl.replace("/*__PHYSICS__*/", physics_js()).replace("/*__BUNDLE__*/null", bundle_json).replace("__TITLE__", title)


def standalone(body):
    return ('<!doctype html>\n<html lang="en"><head><meta charset="utf-8">'
            '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"></head><body>\n'
            + body + "\n</body></html>\n")


def build_project(project):
    B = bundle(project)
    os.makedirs(DIST, exist_ok=True)
    bj = safe_json(B)
    body = page(B["title"], bj)
    out = {k: os.path.join(DIST, f"{B['name']}{k}") for k in (".html", ".artifact.html", ".playground.json")}
    open(out[".html"], "w", encoding="utf-8").write(standalone(body))
    open(out[".artifact.html"], "w", encoding="utf-8").write(body)
    open(out[".playground.json"], "w", encoding="utf-8").write(bj)
    print(f"{B['name']}: page {len(body) / 1e6:.2f} MB -> {os.path.relpath(out['.html'], ROOT)}, bundle {os.path.relpath(out['.playground.json'], ROOT)}")
    return out


def build_player():
    """The player: a loader shell around a sandboxed iframe. The iframe runs the page template with no bundle; the shell
    posts the chosen bundle into it. sandbox="allow-scripts" (no allow-same-origin) gives the project code an opaque
    origin: it cannot read the player's storage or its trusted-source list."""
    inner = standalone(page("Mechanism playground", "null"))
    shell = read(os.path.join(ROOT, "template", "player.html"))
    for k in ("/*__PAGE__*/null", "/*__BUNDLEJS__*/"):
        if k not in shell:
            fail(f"template/player.html is missing {k}")
    html = (shell.replace("/*__BUNDLEJS__*/", read(os.path.join(ROOT, "physics", "bundle.js")))
            .replace("/*__PAGE__*/null", json.dumps(inner).replace("</", "<\\/")))
    os.makedirs(DIST, exist_ok=True)
    out = os.path.join(DIST, "player.html")
    open(out, "w", encoding="utf-8").write(html)
    lst = os.path.join(ROOT, "projects.json")
    if os.path.exists(lst):
        open(os.path.join(DIST, "projects.json"), "w", encoding="utf-8").write(read(lst))
    print(f"player: {len(html) / 1e6:.2f} MB -> {os.path.relpath(out, ROOT)}")
    return out


if __name__ == "__main__":
    args = sys.argv[1:]
    if not args:
        fail("usage: py build/build.py <project folder> [...] | --player")
    for a in args:
        build_player() if a == "--player" else build_project(a)

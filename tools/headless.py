"""Check a built playground page in headless Chrome: it loads, shows no error, and draws a picture.

  py tools/headless.py dist/starter.html [--width 1280 --height 800] [--shot out.png] [--wait 10000]
  py tools/headless.py http://127.0.0.1:8765/dist/player.html?project=starter.playground.json

Two Chrome runs: --dump-dom (the page's own state after it ran: the loading cover hidden, the error box hidden) and
--screenshot (not one flat colour). WebGL runs on SwiftShader. Console lines go to stderr; uncaught errors fail the
check. Headless Chrome has a ~500 px minimum window width: test phone layouts in a 390 px iframe instead.
Exit 0 = pass.
"""
import argparse
import os
import pathlib
import re
import shutil
import subprocess
import sys
import tempfile

CANDIDATES = [
    os.environ.get("CHROME", ""),
    r"C:\Program Files\Google\Chrome\Application\chrome.exe",
    r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    shutil.which("google-chrome") or "", shutil.which("google-chrome-stable") or "", shutil.which("chromium") or "",
    shutil.which("chromium-browser") or "",
]


def chrome():
    for c in CANDIDATES:
        if c and os.path.exists(c):
            return c
    sys.exit("headless.py: Chrome not found (set CHROME=path)")


def run(url, extra, wait, w, h, user_dir):
    cmd = [chrome(), "--headless=new", "--no-sandbox", "--hide-scrollbars", "--use-angle=swiftshader", "--enable-unsafe-swiftshader",
           "--enable-logging=stderr", "--v=0", f"--window-size={w},{h}", f"--virtual-time-budget={wait}",
           f"--user-data-dir={user_dir}", "--allow-file-access-from-files", *extra, url]
    return subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=180)


def flat(png):
    try:
        from PIL import Image
    except ImportError:
        return None
    im = Image.open(png).convert("RGB").resize((160, 100))
    px = list(im.get_flattened_data()) if hasattr(im, "get_flattened_data") else list(im.getdata())
    top = max(px.count(c) for c in set(px))
    return top / len(px)


def main():
    p = argparse.ArgumentParser()
    p.add_argument("page")
    p.add_argument("--width", type=int, default=1280)
    p.add_argument("--height", type=int, default=800)
    p.add_argument("--wait", type=int, default=12000, help="virtual time budget, ms")
    p.add_argument("--shot", help="keep the screenshot here")
    a = p.parse_args()
    url = a.page if re.match(r"^[a-z]+://", a.page) else pathlib.Path(a.page).resolve().as_uri()
    fails = []
    with tempfile.TemporaryDirectory() as td:
        r = run(url, ["--dump-dom"], a.wait, a.width, a.height, os.path.join(td, "u1"))
        dom = r.stdout
        console = [ln for ln in r.stderr.splitlines() if "CONSOLE" in ln]
        bad = [ln for ln in console if re.search(r"Uncaught|TypeError|ReferenceError|SyntaxError", ln)]
        err = re.search(r'<div class="err" id="err"( hidden="")?>(.*?)</div>', dom, re.S)
        loading = re.search(r'<div class="loading" id="loading"( hidden="")?>', dom)
        if not dom.strip():
            fails.append("no DOM came back")
        elif err and not err.group(1):
            fails.append("the page shows an error: " + re.sub(r"<[^>]+>", "", err.group(2)).strip()[:300])
        elif loading and not loading.group(1) and "player-shell" not in dom:
            fails.append("the loading cover is still up")
        fails += ["console: " + b[-300:] for b in bad]
        shot = a.shot or os.path.join(td, "shot.png")
        run(url, [f"--screenshot={shot}"], a.wait, a.width, a.height, os.path.join(td, "u2"))
        if not os.path.exists(shot):
            fails.append("no screenshot")
        else:
            f = flat(shot)
            if f is not None and f > 0.98:
                fails.append(f"screenshot is {f * 100:.1f} % one colour")
    for c in console[:20]:
        print("  " + c[-220:])
    print(("FAIL  " + a.page + "\n  " + "\n  ".join(fails)) if fails else f"PASS  {a.page}")
    sys.exit(1 if fails else 0)


if __name__ == "__main__":
    main()

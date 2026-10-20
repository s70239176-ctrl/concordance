"""Render a few still frames of the film for review: python video/preview.py 3 12 20 28 40 46 56 70 80 88"""
import sys, pathlib
from playwright.sync_api import sync_playwright

HERE = pathlib.Path(__file__).parent
CHROME = r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe"
times = [float(x) for x in sys.argv[1:]] or [3, 12, 20, 28, 40, 46, 56, 70, 80, 88]
out = HERE / "frames"
out.mkdir(exist_ok=True)
with sync_playwright() as p:
    b = p.chromium.launch(executable_path=CHROME, headless=True)
    pg = b.new_page(viewport={"width": 1280, "height": 720})
    errs = []
    pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.on("console", lambda m: errs.append(m.text) if m.type == "error" else None)
    pg.goto((HERE / "film.html").resolve().as_uri())
    pg.wait_for_function("window.READY === true", timeout=30000)
    for t in times:
        pg.evaluate("t => window.render(t)", t)
        pg.screenshot(path=str(out / f"f_{int(t * 10):04d}.png"))
        print("frame", t)
    print("errors:", errs[:5])
    b.close()

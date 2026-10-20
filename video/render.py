"""Render the film deterministically: for each frame, set t, screenshot, pipe JPEGs to ffmpeg together with audio.wav.
   python video/render.py                 -> video/concordance-demo.mp4   (1920x1080, 30 fps, 90 s)
   python video/render.py --test 60       -> a 60-frame timing test (no audio)"""
import argparse, pathlib, subprocess, sys, time
from playwright.sync_api import sync_playwright
import imageio_ffmpeg

HERE = pathlib.Path(__file__).parent
CHROME = r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe"
ap = argparse.ArgumentParser()
ap.add_argument("--scale", type=float, default=1.5)
ap.add_argument("--fps", type=int, default=30)
ap.add_argument("--test", type=int, default=0)
ap.add_argument("--out", default=str(HERE / "concordance-demo.mp4"))
a = ap.parse_args()

FF = imageio_ffmpeg.get_ffmpeg_exe()
DUR = 90.0
total = a.test or int(DUR * a.fps)
cmd = [FF, "-y", "-loglevel", "error", "-f", "image2pipe", "-framerate", str(a.fps), "-i", "-"]
if not a.test:
    cmd += ["-i", str(HERE / "audio.wav")]
cmd += ["-vf", "scale=in_range=pc:out_range=tv,format=yuv420p", "-c:v", "libx264", "-preset", "medium", "-crf", "17", "-color_range", "tv", "-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709", "-r", str(a.fps)]
if not a.test:
    cmd += ["-c:a", "aac", "-b:a", "192k", "-t", str(DUR)]
cmd += ["-movflags", "+faststart", a.out if not a.test else str(HERE / "_test.mp4")]
proc = subprocess.Popen(cmd, stdin=subprocess.PIPE)

t0 = time.time()
with sync_playwright() as p:
    b = p.chromium.launch(executable_path=CHROME, headless=True, args=["--force-color-profile=srgb"])
    ctx = b.new_context(viewport={"width": 1280, "height": 720}, device_scale_factor=a.scale)
    pg = ctx.new_page()
    pg.goto((HERE / "film.html").resolve().as_uri())
    pg.wait_for_function("window.READY === true", timeout=30000)
    for i in range(total):
        pg.evaluate("t => window.render(t)", i / a.fps)
        proc.stdin.write(pg.screenshot(type="jpeg", quality=92))
        if i % 90 == 0:
            el = time.time() - t0
            print(f"frame {i}/{total}  {el:5.0f}s elapsed  eta {el / (i + 1) * (total - i - 1):5.0f}s", flush=True)
    b.close()
proc.stdin.close()
proc.wait()
print("done in", round(time.time() - t0), "s ->", a.out if not a.test else "_test.mp4", flush=True)

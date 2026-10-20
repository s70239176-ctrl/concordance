# The 90-second film

`concordance-demo.mp4` (1920x1080, 30 fps, AAC audio) with burned-in captions and callouts, plus `concordance-demo.srt` /
`.vtt` caption files.

## What makes it different
- **The film is computed, not hand-animated.** `film.html` renders each frame as a pure function of time. Every number
  on screen comes from the product's own `web/derive.js` (the same code the contract is parity-tested against) applied
  to the scenario, or from the recorded GenLayer Studio transactions (`web/real.js`, `web/rulings.js`): the ambiguity
  index, the divergences, the fragility bars, the gate's 43% and 100%, the ruling's transaction hash.
- **You can hear the disagreement.** The soundtrack is driven by the same ambiguity timeline as the on-screen needle
  (`window.AMB` in `film.js`). While the index is high, the pad's voices detune into beating roughness, a minor second
  and a tritone clash, and a nervous tremolo runs. As it falls, they pull into a clean A-major chord. When the ruling
  lands at 45 s the harmony opens up and a resolved triad rings. `audio.py` synthesizes it with numpy (no samples, no
  stock music). Measured check: energy at the clashing minor-second falls 0.70 -> 0.37 -> 0.02 -> 0.00 across the film.
- **It tells you what failed.** Scene 7 shows 0/8 (the first design on real validators) before 6/6, and the open
  limitation, not just the wins.

## Regenerate
```bash
pip install playwright imageio-ffmpeg numpy scipy
python video/audio.py        # -> audio.wav
python video/render.py       # -> concordance-demo.mp4  (about 11 minutes; uses the system Chrome)
python video/preview.py 21 46.5 73   # still frames for review
```
Edit `film.js` to change scenes, captions (`CAPS`) or callouts (`CO`). Everything is deterministic: same inputs, same video.

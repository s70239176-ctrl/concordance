"""Drive the real app.html (burner key) against GenLayer Studio v5: ratify in the UI, lock escrow, execute, and the
committed-text path. Inquiry rat-mvjogca9 already has: prop 3 convened/ratified, and rulings on the SUBSTITUTED and the
real CLAUSE text for prop 1 (made by scripts/ratify-test.mjs).
  python scripts/ui-test.py"""
import json, pathlib, re, sys, time
from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).parent.parent
URL = (ROOT / "web" / "app.html").resolve().as_uri() + "?inquiry=rat-mvjogca9"
CLAUSE = "Clause 14.2 (Force majeure). 'Port closure' means a formal order of the harbour master or port authority suspending berthing or cargo operations. A vessel waiting in an anchorage queue without such an order is not subject to a port closure."
OTHER = "Clause 14.2 (Force majeure). A port closure includes any anchorage wait."
BEN = "0x" + "ab" * 20
out = []


def say(*a):
    print(*a, flush=True)
    out.append(" ".join(str(x) for x in a))


def banner(pg):
    return pg.inner_text("#status") if pg.is_visible("#status") else ""


def wait_done(pg, label, timeout=240):
    t0 = time.time()
    while time.time() - t0 < timeout:
        b = banner(pg)
        if re.search(r"done \(|rejected|did not reach|timed out|Could not", b) and "waiting for validators" not in b:
            say(f"  [{label}] {b.strip()[:140]}")
            return b
        time.sleep(2)
    say(f"  [{label}] TIMEOUT", banner(pg)[:100])
    return ""


with sync_playwright() as pw:
    br = pw.chromium.launch(executable_path=r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe")
    pg = br.new_page(viewport={"width": 1280, "height": 1000})
    errs = []
    pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.goto(URL)
    pg.wait_for_selector("#btnBurner")
    pg.click("#btnBurner")
    pg.click("#btnFund")
    wait_done(pg, "faucet", 90)
    pg.wait_for_selector("#ratBody [data-ratify]", timeout=60000)
    say("payable outcomes panel:", pg.inner_text("#ratBody").replace("\n", " | ")[:300])

    # 1. ratify prop 3 from the UI
    pg.click('#ratBody [data-ratify="2"]')
    wait_done(pg, "ratify prop 3 (UI)")
    pg.wait_for_timeout(3000)
    say("after ratify:", [x for x in pg.inner_text("#ratBody").split("\n") if "3." in x or "ratified" in x.lower()][:4])

    def lock(prop_index, want, text, label):
        pg.evaluate("document.querySelectorAll('#reqs select').forEach(s => s.value = '')")
        pg.select_option(f'#reqs select[data-i="{prop_index}"]', want)
        pg.fill("#eBen", BEN)
        pg.fill("#eVal", "0.001")
        pg.fill("#eSrc", text)
        pg.dispatch_event("#reqs", "change")
        before = len(pg.query_selector_all("#acts .act"))
        pg.click("#btnOpenAct")
        wait_done(pg, label)
        for _ in range(30):
            pg.wait_for_timeout(2000)
            if len(pg.query_selector_all("#acts .act")) > before:
                break
        acts = pg.query_selector_all("#acts .act")
        return acts[-1] if acts else None

    def execute(el, label):
        txt0 = el.inner_text().replace("\n", " ")
        say(f"  {label} card before:", txt0[:170])
        el.query_selector('button[data-x="execute_action"]').click()
        b = wait_done(pg, label + " execute")
        pg.wait_for_timeout(3000)
        acts = pg.query_selector_all("#acts .act")
        for a in acts:
            if a.inner_text().split("\n")[0] == el.inner_text().split("\n")[0] or True:
                pass
        return b

    # 2. escrow on the ratified proposition, no committed text
    say("A) escrow on prop 3 (ratified, TRUE), no committed text")
    el = lock(2, "TRUE", "", "lock A")
    say("  card:", el.inner_text().replace("\n", " ")[:170] if el else None)
    if el:
        execute(el, "A")
    say("  after:", pg.inner_text("#acts").replace("\n", " ")[:250])

    # 3. escrow on prop 1 committed to the real clause: a ruling on that exact text already exists
    say("B) escrow on prop 1 (must be FALSE), committed to the real clause")
    el = lock(0, "FALSE", CLAUSE, "lock B")
    say("  card:", el.inner_text().replace("\n", " ")[:170] if el else None)

    # 4. escrow on prop 1 committed to OTHER text: the existing rulings do not apply
    say("C) escrow on prop 1 (must be FALSE), committed to DIFFERENT text")
    el = lock(0, "FALSE", OTHER, "lock C")
    say("  card:", el.inner_text().replace("\n", " ")[:170] if el else None)
    if el:
        b = execute(el, "C")
    say("final acts panel:", pg.inner_text("#acts").replace("\n", " ")[:600])
    say("page errors:", errs[:5])
    pg.screenshot(path=str(ROOT / "scripts" / "ui-test.png"), full_page=True)
    br.close()
(ROOT / "scripts" / "ui-test.log").write_text("\n".join(out), encoding="utf-8")

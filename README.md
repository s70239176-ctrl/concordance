# Concordance

**An inter-subjective oracle on GenLayer.** Every oracle collapses disagreement into one answer. Concordance
keeps it: the network agrees on a structured record of *what is settled, what is contested, how contested, and
why*, and downstream contracts move money in proportion to how settled the facts really are.

Open `web/index.html` (or `cd web && python -m http.server 8791`) for the interactive demo. Press **Watch the
75-second tour** for a guided walk-through of the scripted story, fragility, a ruling and the gate, the greybox
attack, and the real Studio validators (Pause / Stop / Esc work; a full run measured 73 s).

## Film and article
- **90-second demo film** with captions and callouts: `video/concordance-demo.mp4` (captions also as `.srt` / `.vtt`).
  It is computed from the product's own derivation code and recorded Studio results, and its soundtrack is
  *sonified ambiguity*: the harmony clashes while the index is high and resolves when a ruling lands. See `video/README.md`.
- **Article** (Medium-style, with figures): `docs/ARTICLE.md`.

## What v4 adds
| Feature | What it does | Measured on Studio |
|---|---|---|
| **Rulings** | When a dispute is about *meaning*, `request_ruling` asks validators one narrow question against the governing text (`HOLDS` / `DOES_NOT_HOLD` / `UNDETERMINED`). A ruling can move money only for an escrow or gate policy that committed to the exact governing text when it was funded (`docs/PAYOUT.md`) | 10 of 10 rulings accepted in a single consensus round, with the intended verdicts (`docs/RULING.md`) |
| **Fragility map** | Removes each party in turn and re-derives: which single voice holds the verdict up. Computed from the stored record, no model call | parity-tested on all 24 real model records |
| **ConcordanceGate** | A *separate* contract that reads the oracle across contracts and pays by it (`docs/GATE.md`) | cross-contract read inside a write works; paid 100% off a ruling made in the other contract, refused a second claim and an unruled one |

**Deployed on GenLayer Studio (v5, current):** Concordance `0x34A00eC1275dE6A4FCE9050f82c787B9fC90Fff4`, ConcordanceGate
`0xBd223ab2018b71d85aD8299bF97192C9b5f930B6`. v5 is the steward-review fix: money moves only on outcomes validators explicitly ratify and on
rulings made against a text committed at funding (`docs/PAYOUT.md`). The earlier v4 (`0x1e7d9A797860faCF5e993AFF715DD2C5d4B1f237`, gate `0x620ec49c91469A2fa7Fa0d08bD009d99CCBd6287`) and v3
(`0x58E8b84B0b55e9d4d33e5E973CF41D475919ECc7`) are kept for the recorded history the demo replays. The live app defaults to v5.

**Biggest known gap in rulings:** the requester supplies the governing text and a final ruling cannot be redone. The
text is stored and shown next to the ruling, but binding it when the inquiry is opened is still to do. Read
`docs/RULING.md` before relying on it.

## Live app (public, any user)
`web/app.html` is the real product; `index.html` is the showcase. It talks straight to the v3 contract on
GenLayer Studio: anyone can browse every inquiry on-chain, **open their own**, add an account, convene validators,
read the agreement record and lock ambiguity-priced escrow. Sign with **MetaMask** (genlayer-js wallet provider,
switches to Studio) or a **burner key** generated and kept in the browser. `?contract=0x...` points it at another
deployment; `?inquiry=<id>` deep-links an inquiry. Loads `genlayer-js` from esm.sh.
Tested in-browser with the burner key: opened an inquiry, submitted an account, convened (`MAJORITY_AGREE`,
20 s) and locked an escrow. The MetaMask path was tested against a mock wallet and fixed (see `docs/WALLET.md`); it has **not** been run in real MetaMask.
Everything submitted is public and permanent on-chain.

## Design
One shared stylesheet, `web/concordance.css`, for both pages. The identity is a *ledger of testimony*: warm ink and
paper, brass as the single accent, verdigris for "affirms" and vermilion for "denies" (a proofreader's two inks),
Fraunces for voice, JetBrains Mono for data, hairline rules instead of boxes, no gradients. Signature elements are the
engraved "plate" for the agreement map, validators set as instrument channel strips, and the ambiguity readout drawn
as a tuning scale from concord to discord. Fonts load from Google Fonts (system serif/mono fallbacks apply offline).

## The idea in one scenario
A reefer container of wafers arrives late and maybe warm. The carrier, the shipper and the port each tell a
different story; later a surveyor joins. A majority-vote oracle returns seven confident answers and an escrow that
pays 100% or 0%. Concordance returns:

- 3 propositions **agreed**, 4 **contested** (round 2), with a divergence % for each
- *why* each dispute exists (different facts / meaning / clock / boundary) and the exact crux sentence
- triage: *more evidence can settle this* vs *needs a ruling, appeal it*
- an escrow that released **32%** after round 1 and **79%** after the surveyor's evidence, never clawing back

## How it works
| Step | Who | What |
|---|---|---|
| `open_inquiry` | anyone | A question and 2-8 weighted propositions |
| `submit_account` | each party | Free-text account + up to 3 https evidence URLs (replace until convened) |
| `convene` | anyone | Validators fetch evidence, scan it for injection, read stance + evidence strength per party per proposition. Code derives the record; consensus is the equivalence rule in `docs/EQUIVALENCE.md`. Re-callable after new accounts, max 4 rounds |
| `open_action` / `execute_action` | funder / anyone | Escrow released as `clarity` of the required propositions (weighted); ratchets up only |
| `close_action` | funder | Reclaims what is still reserved, only once the inquiry can no longer improve |
| `get_signal(inquiry, i)` | other contracts | `status`, `lean`, `clarity`, `divergence`, `cause`; never a bare yes/no |

Design rule: the LLM only *reads*. Everything that moves money (`divergence`, `status`, `ambiguity`, release %) is
deterministic code, so validators agree on small snapped numbers instead of prose.

## Layout
- `contracts/concordance.py` the Intelligent Contract (GenVM v0.2.16 header, same conventions as CarbonCourt)
- `contracts/concordance_gate.py` a consumer contract that pays by the oracle's signals
- `web/` zero-dependency demo with a **Scripted narrative / Real Studio validators** toggle. `derive.js` mirrors the
  contract's derivation; `real.js` (generated by `scripts/build-real.mjs`) holds recorded Studio transactions
- `tests/` 60 tests: derivation, equivalence, normalization, contract flow, escrow conservation, rulings,
  fragility, the gate contract (cross-contract, stubbed), JS-vs-Python **parity** (demo scenario, 300 random inputs and
  all real model records), equivalence **robustness**
- `docs/EQUIVALENCE.md` the real-validator measurement: why the first rule failed and what replaced it
- `docs/RULING.md`, `docs/GATE.md` the v4 features, with their measurements and limits

```bash
python -m pytest tests -q
```

## Honest status
- **Deployed and measured on GenLayer Studio** (v3 `0x58E8b84B0b55e9d4d33e5E973CF41D475919ECc7`): 4 of 4
  convenes reached `MAJORITY_AGREE` first try. v1/v2 (a per-proposition equivalence rule) got 0 of 8 and were
  redesigned from that data. Full account, including the failure, in `docs/EQUIVALENCE.md`.
- The cost of that redesign: consensus now ratifies the ambiguity index and coarse classes, not the
  per-proposition map (leader annotation). Not yet on Bradbury; URL evidence fetching is not exercised.
- **Escrow exercised on Studio** (`docs/ONCHAIN.md`): release matched `derive.js` exactly, every guard
  reverted correctly, funds conserved. 6 of 6 convenes on v3 reached majority agreement.
- The demo replays hand-written readings; real models produced different, noisier numbers (index 60-82, no
  clean drop after round 2). All derived numbers are computed live by `derive.js`.
- Not audited. Releases ratchet up only (no clawback if a later round is *more* ambiguous); a design choice, not a law.

## Deploy (Studio)
```bash
genlayer network studionet
genlayer deploy --contract contracts/concordance.py
```
Or use the scripts (throwaway key generated locally): `npm install && node scripts/deploy.mjs &&
node scripts/measure.mjs 2 && node scripts/extract-records.mjs`.

## Deploy the frontend (Vercel)
The UI is static files in `web/`, no build step. Two equivalent setups, both configured in the repo: import the repo as is
(the root `vercel.json` points Vercel at `web/`), or set **Root Directory** to `web` with Framework Preset "Other"
(then `web/vercel.json` is the one Vercel reads). Pages: `/` is the showcase demo, `/app` is the live app.

## Prior art (checked October 2026)
Single-verdict escrow and court projects, precedent registries and charter gates exist on GenLayer. I did not find
a contract that records partial agreement and quantified dissent as the consensus output. Absence of evidence in
a shallow search, not proof; check the Agent Tank / Bradbury entry lists before claiming novelty.

## License
MIT. See `LICENSE`.

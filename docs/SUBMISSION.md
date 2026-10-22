# Concordance — submission

## Project name

Concordance

## Track / tags

Primary tag: Dispute Resolution. Topics: evidence-based resolution, oracles (pick the nearest precise topics offered).

## One-liner (≤180 chars)

An inter-subjective oracle: validators agree on what is settled, what is contested and why, and contracts pay in proportion to how settled the facts are.

*(about 146 characters)*

## Description (≤1000 chars)

Most oracles collapse disagreement into one word: true or false. Concordance keeps it. Anyone opens an inquiry (a question, weighted propositions, one account plus evidence per party). Validators running different models read every account and agree on a structured record: which propositions are agreed, contested, deadlocked or unsupported, how far apart the parties are, and one ambiguity index from concord to discord. The model only reads. Divergence, status, release percentages and the injection-scan weight cap are plain deterministic code.

Meaning disputes can be settled with a narrow ruling (HOLDS / DOES_NOT_HOLD / UNDETERMINED). A fragility map shows whether the verdict hangs on one party. A second contract, ConcordanceGate, reads the oracle across contracts and releases escrow in proportion to clarity. Measured on real Studio validators: the first design reached agreement in 0 of 8 convenes, the redesign in 6 of 6. Rulings were accepted in one round in 10 of 10 tests. Limits are documented in the repo.

*(about 900 characters)*

## Live demo URL

- Showcase with a guided tour: https://concordance-web.vercel.app/
- Public app (open your own inquiry): https://concordance-web.vercel.app/app.html

## GitHub repository

https://github.com/s70239176-ctrl/concordance

## Demo video

90-second film with captions (the soundtrack is driven by the ambiguity number):
https://github.com/s70239176-ctrl/concordance/releases/tag/v4-film
**[TO FILL]** a YouTube or X link, if the form needs one of those.

## Contracts

- Network: GenLayer Studio
- Concordance (oracle): [`0x34A00eC1275dE6A4FCE9050f82c787B9fC90Fff4`](https://explorer-studionet.genlayer.com/address/0x34A00eC1275dE6A4FCE9050f82c787B9fC90Fff4)
- ConcordanceGate (consumer): [`0xBd223ab2018b71d85aD8299bF97192C9b5f930B6`](https://explorer-studionet.genlayer.com/address/0xBd223ab2018b71d85aD8299bF97192C9b5f930B6)

## Real transactions

| | |
|---|---|
| Ruling on prop 6 (anchorage hold is not a "port closure") → DOES_NOT_HOLD, one consensus round | [`0xe47d6742960f05c39799f85aa6ba3d80725b645d14226003fad8948d82a087d5`](https://explorer-studionet.genlayer.com/tx/0xe47d6742960f05c39799f85aa6ba3d80725b645d14226003fad8948d82a087d5) |
| Gate claim after rulings: cross-contract read, paid 100% of the policy | [`0x48103ac4a6cd005672013bd8e7d59c1119f485e4d42811723b89c0611d87678d`](https://explorer-studionet.genlayer.com/tx/0x48103ac4a6cd005672013bd8e7d59c1119f485e4d42811723b89c0611d87678d) |

Full measurements and the remaining transactions are in `docs/` and `scripts/*.json`.

## How to try it (numbered steps)

1. Open https://concordance-web.vercel.app/app.html and click Connect (a wallet, or the built-in test account), then use the faucet.
2. Click New inquiry. Enter a question and 2 to 7 propositions, and mark at least one as required.
3. Add each party's account and optional evidence text.
4. Click Convene and wait for consensus. Read the agreement map and the ambiguity index.
5. Open the Fragility card to see which party the verdict depends on.
6. On a contested meaning proposition, request a ruling and watch the index fall.
7. Open a Gate policy, claim, and check the payout matches the clarity.
8. Or watch the 75-second tour at https://concordance-web.vercel.app/ (it can replay both a scripted story and real recorded Studio readings).

## Expected verification outcome — private judge notes (≤500 chars)

After Convene, each proposition is AGREED, CONTESTED, DEADLOCKED or UNSUPPORTED with a divergence figure, plus an ambiguity index of 0 to 100. Fragility lists the parties whose removal flips results. A ruling returns exactly HOLDS, DOES_NOT_HOLD or UNDETERMINED and the effective index is recomputed, stored record unchanged. A Gate claim pays the weighted clarity percentage, a repeat claim is refused, and a refund after closing returns the unreleased reserve. A convene can fail without consensus: nothing is written, run it again.

*(about 470 characters)*

## Why GenLayer

A contract cannot read a surveyor's report or judge whether two accounts describe the same event. GenLayer validators can, and the equivalence principle lets them differ in wording while agreeing on meaning under a rule the contract defines. Here validators ratify the ambiguity index (within a tolerance), the rough class of each proposition and the absence of outright contradiction. Everything that moves money is deterministic code.

## Differentiation

- **Keeps the disagreement** instead of collapsing it to one answer.
- **Triage**: fact disputes are re-convened with more evidence, meaning disputes go to a one-word ruling.
- **Fragility map**: leave-one-out from the stored record, no model call.
- **A real consumer**: ConcordanceGate reads the oracle across contracts and pays in proportion to clarity.
- **Honest measurement**: the first consensus rule failed on real validators (0 of 8) and the redesign is documented in `docs/EQUIVALENCE.md`.
- **Evidence is untrusted**: a deterministic scan caps the weight of instruction-like text before anything is derived.

## Current limitations

- The requester supplies the governing text for a ruling, and a ruling cannot be redone. Do not use rulings adversarially yet.
- Measured on Studio, not Bradbury, on essentially one scenario.
- The wallet path was tested against a mock wallet, not real MetaMask.
- Fetching evidence from URLs is implemented but unmeasured.
- The per-proposition map is the leader's annotation, ratified only at coarse granularity. Rely on the index and the no-contradiction check, not the cell-by-cell map as network-verified fact.
- Not audited. Studio balances are test accounting.

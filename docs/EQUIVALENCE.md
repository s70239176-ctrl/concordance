# Equivalence: what real validators actually agree on

This document records a measurement, including the part where the first design failed.

## Setup
Contract deployed to GenLayer **Studio** (studionet) with a throwaway testnet key. Demo scenario ("The Halden
Delay": 7 propositions, 3 parties, round 2 adds a 4th). Each `convene` runs up to 4 consensus rounds; each
round rotates the leader, so one transaction yields up to four **leader records from four different models**
on identical inputs (observed: gpt-5.4, gemini, grok, mistral, glm, qwen, minimax, gemma, sonnet). Records are
saved in `tests/fixtures/real_records.json` (16 records, 4 txs) and replayed by `RealModelRecordsTests`.
Reproduce: `node scripts/deploy.mjs && node scripts/measure.mjs 2 && node scripts/extract-records.mjs`.

## Result 1: the original rule failed on real validators
Original rule: for **every** proposition, same status and divergence within 30 (plus lean and index checks).
It was tuned against synthetic wobble (97.5% pass at 8% noise), which did not predict reality:

| | Synthetic noise (what I tuned on) | Real multi-model records |
|---|---|---|
| Pairs of records the rule accepts | 97.5% | **1 of 24 (4%)** |
| On-chain outcome | n/a | every convene `UNDETERMINED / MAJORITY_DISAGREE` after 4 rounds (4 of 4 txs, v1 and v2) |

Giving the parties inline evidence excerpts and an anchored strength rubric (v2) did not fix it. Models
disagree cell by cell: e.g. one proposition was read `UNSUPPORTED` by one model, `AGREED_TRUE` by another and
`CONTESTED` by a third; the lean on "cold chain intact" flipped between TRUE, FALSE and NONE across models.

## Result 2: what they *do* agree on
Over the 24 same-input model pairs: ambiguity index within +/-15 for 79%, within +/-20 for 92%, within +/-30 for
100%. Models agree on how contested the whole situation is much more than on which cell says what.
(Propositions that are genuinely definitional, e.g. "force majeure applies", were read as deadlocked by nearly
every model.)

## The rule now (v3), and what it costs
Consensus ratifies only: ambiguity index within **20**; at least **3/7** of propositions in the same coarse class
(agreed / contested / unsupported); and **no contradiction** (one validator agreed-TRUE where another says
agreed-FALSE). The per-proposition map, `cause` and `crux` are the leader's annotation, ratified only at this
granularity.

| | Result |
|---|---|
| Real model pairs accepted (calibration set, 24 pairs) | 21-22 of 24 (~88%) |
| Synthetic: 50% of stances flipped, rejected | 73% |
| Synthetic: 25% of stances flipped, rejected | 43% |

The honest trade: **liveness bought with a weaker guarantee.** A validator that misreads a quarter of the
stances can still pass; one that contradicts an agreed fact, or misjudges overall ambiguity by more than 20, cannot.
Do not sell the per-proposition map as network-verified fact; sell the index and the no-contradiction check.

## Held-out check and on-chain result (v3)
- **Held-out records:** 8 records from 2 later txs, never used to pick thresholds (`heldout_records.json`):
  v3 accepts **10 of 12** same-input pairs (83%); the old strict rule accepted 1 of 12.
- **On-chain:** redeployed as v3 (`0x58E8b84B0b55e9d4d33e5E973CF41D475919ECc7`, studionet). Two inquiries x two
  rounds = 4 convenes: **4 of 4 `ACCEPTED / MAJORITY_AGREE`, each on the first consensus round** (26-53 s),
  versus 0 of 8 for v1/v2, each of which exhausted all 4 leader rotations (80-280 s) and ended `UNDETERMINED`.
- **Real ambiguity is not the scripted demo's.** The demo replays hand-written readings (68 -> 38 after the
  surveyor joins). Real models returned index 74 -> 71 and 60 -> 82 on the same inputs: they did not reproduce
  the clean narrative. The mechanism works; the demo's numbers are an illustration, not a measurement.

## Known limits
- Calibrated on one scenario. Held-out is the same scenario with fresh model draws, not a new scenario.
- Every receipt shows 1-2 of 4 validators `idle`; v3 reached majority among the voters present (never a
  `disagree`), so liveness depends on how many validators actually vote.
- No web evidence was fetched in these runs (inline excerpts only); URL fetching is unmeasured.

# Payouts: only what validators ratify

Steward review of v4 found two ways escrow could pay from something validators had not agreed to. v5 closes both.

## 1. The leader's annotation could pay

**Problem.** `convene` ratifies the record only coarsely (ambiguity index within 20, 3/7 propositions in the same class, no
agreed-TRUE vs agreed-FALSE). A contested proposition's lean and clarity were the leader's, yet `execute_action` and the gate
paid from them. A validator that computed the opposite lean still voted to accept the record.

**Fix.** The map from `convene` never moves money. A separate `ratify_payout(inquiry, prop)` asks validators to re-read
the accounts independently:

- the leader proposes `{lean, clarity}` for one proposition, with clarity rounded **down** to a multiple of `PAY_STEP` (20);
- a validator accepts only if its **own** derivation has the same lean and a clarity at or above that floor
  (`surface_ratified` in `contracts/concordance.py`);
- the stored value is the leader's floor, never the validators' higher clarity and never the leader's raw number;
- it is valid for the current round only: a new `convene` invalidates it;
- an unratified proposition reads as lean `NONE`, clarity 0, so it pays nothing.

`execute_action` and the gate read `get_signal`, which returns only ratified values (or a committed-text ruling). The gate also
refuses any signal whose status is not `RATIFIED` or `RULED`.

## 2. A ruling on uncommitted text could pay

**Problem.** Anyone could call `request_ruling` with any text, after funding, and the final verdict then moved money. A
bad-faith ruling on substituted text was also final, so it blocked the real one.

**Fix.**

- `open_action` and `open_policy` take `req_sources`: per required proposition, the governing text a ruling may use, or `""`
  for "no ruling can ever move this money". The text is hashed (sha256) and fixed at funding.
- Rulings are stored under `inquiry:prop:hash(text)`. A ruling moves money only if its hash equals the one the action or
  policy committed to. A ruling on any other text, made before or after funding, is ignored for that payout.
- Because rulings are keyed by text, a substituted ruling no longer blocks the real one.
- A ruling that also fetches a URL cannot be bound (the page can change) and never moves money.
- The crux the leader wrote is no longer fed into the ruling prompt.

## Tests (76 passing)

New tests in `tests/test_concordance.py` and `tests/test_gate.py` use a stub where each validator has its **own** model reply
and a strict majority must accept, so leader and validator records genuinely differ:

- the leader's contested lean alone never pays;
- validators who read the opposite lean (all 5, or 3 of 5) cannot ratify, and nothing is paid;
- a convene accepted despite a lean flip still cannot pay;
- validators less clear than the floor cannot ratify, and clearer validators ratify only the floor;
- ratification expires with the round; a ratified TRUE does not pay a "must be FALSE" requirement;
- **substituted text**: a ruling on text other than the committed text releases nothing (oracle escrow and gate), even by
  one character, even made before funding; a url-fetching ruling releases nothing; an action funded with no committed text
  ignores every ruling; the real committed text still works afterwards.

## Measured on Studio (v5)

Concordance `0x34A00eC1275dE6A4FCE9050f82c787B9fC90Fff4`, gate `0xBd223ab2018b71d85aD8299bF97192C9b5f930B6`
(`scripts/ratify-test.mjs`, data in `scripts/ratify-result.json`, log `scripts/ratify-test.log`). The first run of a script
hit a transient Studio RPC error before any transaction; the run reported here is the next one.

| Step | Result |
|---|---|
| claim before any ratification | refused, paid 0 |
| `ratify_payout` on an agreed proposition | accepted in one round; signal `RATIFIED / TRUE / 100` |
| claim after ratification | paid 1,000,000 wei (100%) |
| ruling on **substituted** text (verdict HOLDS), then claim | refused, paid 0 |
| ruling on the **committed** text, then claim | paid 1,000,000 wei |

One scenario, one run. It shows the mechanism works end to end on Studio (including `hashlib` inside the contract), not how
often real validators will ratify.

### Repeated measurement (4 inquiries, 9 leaning propositions)
`scripts/ratify-rate.mjs`; data in `scripts/ratify-rate.json`, log in `scripts/ratify-rate.log`. Four fresh inquiries with
asymmetric accounts, `convene`, then `ratify_payout` on every proposition whose convene record had a lean.

| Leader class at convene | Propositions | Ratified with a lean | Ratified as nothing (NONE, 0) | No consensus |
|---|---|---|---|---|
| AGREED | 7 | 6 | 1 | 0 |
| CONTESTED (leaned TRUE, clarity 20) | 2 | 0 | 2 | 0 |

- All 9 transactions were `ACCEPTED / MAJORITY_AGREE` in one round; none needed a retry.
- The mechanism fails safe in a way I did not predict. `ratify_payout` makes a fresh leader read, and in 3 of 9 cases that read
  produced no lean, so what was stored is lean NONE, clarity 0: ratified, but it pays nothing. Both contested propositions
  ended this way. So the failure shows up as "ratified as nothing", not as a failed transaction.
- Net: **6 of 9 leaning propositions became payable (6 of 7 agreed, 0 of 2 contested).** Contested leans did not become
  payable here, which is the steward's intent, but it means graded release on a contested proposition now needs a ruling.
- Small sample (one scenario family, 9 propositions). The earlier 32% figure came from comparing recorded model pairs; this
  is the real transaction path and looks better for agreed propositions, but it is not a precise rate.

## Real consensus, not simulated: validators refusing a leader that differs from their own reading

The unit tests simulate validators with a stub. This section is the same property on **real GenLayer Studio consensus**, with
real validators running different models.

**Probe contract** `0x22F0DFB2e1e76F39e6FB06f8F86BD46dc11fa3e1` ([explorer](https://explorer-studionet.genlayer.com/address/0x22F0DFB2e1e76F39e6FB06f8F86BD46dc11fa3e1)):
`contracts/test_only/concordance_probe.py` is the v5 contract plus one test-only method, `ratify_forced`, whose **leader is
malicious**: it proposes a lean and clarity we dictate instead of its own reading. The validator logic is the real, unchanged
`ratify_payout` validator. It is not used by the app and is not part of the shipped contract. Script: `scripts/real-consensus-probe.mjs`,
log `scripts/real-consensus-probe.log`, data `scripts/real-consensus-probe.json`. The inquiry was convened by real validators
(`ACCEPTED / MAJORITY_AGREE`) and an escrow was funded that requires proposition 1 and proposition 3 to be TRUE.

| # | Leader proposes | Validators' own reading | Real consensus result | Stored signal | Escrow |
|---|---|---|---|---|---|
| 1 | prop 1 **FALSE**, clarity 100 | AGREED TRUE | `UNDETERMINED / MAJORITY_DISAGREE`, **all 4 leader rotations** (gemini, qwen, sonnet, kimi) refused | `UNRATIFIED`, lean NONE | |
| 2 | prop 3 **TRUE**, clarity 100 | UNSUPPORTED, no lean | `UNDETERMINED / MAJORITY_DISAGREE`, **all 4 leader rotations** (gpt-5.4, gpt-5.4, gemini, minimax) refused | `UNRATIFIED`, lean NONE | `execute_action` rejected, **paid 0** |
| 3 (control) | prop 1 **TRUE**, clarity 100 | AGREED TRUE | `ACCEPTED / MAJORITY_AGREE`, round 1 | `RATIFIED / TRUE / 100` | `execute_action` paid **500,000 of 1,000,000 wei** (proposition 1 only; proposition 3 still unratified) |

Observations, stated plainly:
- In every rejected round a majority of the validators that voted voted `disagree`, and **none voted agree**. Several validators
  recorded `idle` (they did not vote that round); those are visible in the log and I have not tried to explain them.
- So a leader whose proposal differs from what validators independently derive cannot get a lean or clarity stored, and a
  funded escrow that depends on it releases nothing. When the leader is honest, the same code path pays.
- Limits: one scenario, one run, and the probe forces a *blatant* lie (opposite lean, invented support). It shows validators
  enforce the check; it does not measure how subtle leader disagreements, such as a one-step clarity difference, are handled.

### Trying to provoke a failed ratification on Studio
`scripts/ratify-stress.mjs` (log `scripts/ratify-stress.log`, data `scripts/ratify-stress.json`): three deliberately subjective
inquiries (contractor quality, a used car, a tenancy), then `ratify_payout` on every proposition with a lean, retrying up to twice.
Two of the three inquiries had no leaning proposition at all (all deadlocked, ambiguity 100); the third had three contested leans.

- 4 `ratify_payout` transactions, **all `ACCEPTED / MAJORITY_AGREE` in one round. I did not observe a transaction fail to reach
  consensus.** The failed-consensus path was then verified on real consensus with the malicious-leader probe in the section above.
- Of the 3 contested leans, 3 were eventually ratified with a lean at clarity floor 20 (two on the first try, one after a
  retry whose first attempt stored "NONE, 0"). Contested leans can become payable, but only at a low clarity floor here, so
  they pay a small share (20%). This corrects the "0 of 2 contested" reading above: with more samples the contested count is
  3 of 5 ratified with a lean (all at floor 20).
- Retrying can change the outcome, because each call is a fresh independent read.
- One run hit a transient Studio RPC error (`<!DOCTYPE` instead of JSON) during gas estimation; the transaction still went through.

### The app, driven end to end against Studio (burner key)
`scripts/ui-test.py` drives `web/app.html` in a real browser against v5 on inquiry `rat-mvjogca9` (log `scripts/ui-test.log`,
screenshot `scripts/ui-test.png`, no page errors):

| UI step | Result |
|---|---|
| Payable outcomes panel | shows each proposition as ratified or "not ratified · pays nothing" |
| Click **Ratify** on proposition 3 | accepted in one round (32 s); panel updates |
| Lock escrow on proposition 3 (no committed text) | card shows "justified now 100%" |
| **Execute release** | accepted; card shows paid 0.001 GEN |
| Lock escrow on prop 1 committed to the real clause | card shows 100% (a ruling on exactly that text exists) |
| Lock escrow on prop 1 committed to different text | card shows **0%**; Execute is rejected by the contract |

Not covered: the browser-wallet (MetaMask) path was not exercised for these new calls, only the burner key. I did not click
Execute on the second escrow, only observed its 100% preview.

## The honest cost: ratification can fail

On the real multi-model records in `tests/fixtures`, a single proposition's lean and clarity floor matched between two
models in only about 30% of leader/validator pairs (74 of 231 directed proposition pairs; contested propositions about 29%,
agreed ones about 36%). A ratification that validators cannot agree on stores nothing, so nothing pays. That is the safe
failure and it is what the steward asked for, but it means contested leans will often fail to ratify on real validators.
Practical consequences: a retry can succeed, a clearly agreed proposition ratifies far more readily than a contested one,
and money that cannot be ratified can only be released by a ruling on committed text or refunded by the funder.

## Not changed

Rulings still rely on the requester's text being honest *at funding time*: the funder chooses the text, which is the point of
the commitment. Evidence fetched from URLs during convene is still unmeasured.

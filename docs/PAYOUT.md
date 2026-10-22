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

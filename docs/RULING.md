# Rulings and the fragility map

Two features added in v4. Both came out of the same observation: Concordance already *classifies* disputes, so it
should do something about each class.

| The dispute is about | What the triage says | What v4 does |
|---|---|---|
| Facts, a clock or a boundary | more evidence can settle it | reconvene (as before) |
| **Meaning** (what a clause says) | no evidence will settle it | **`request_ruling`**: one narrow question to validators |
| Who holds the verdict up | (new) | **fragility map**: leave-one-out robustness |

## Rulings

`request_ruling(inquiry_id, prop_index, source_text, source_url)` asks validators exactly one question about a
**contested** proposition: *does it hold as a matter of what the governing text says?*

- The output space is three words: `HOLDS`, `DOES_NOT_HOLD`, `UNDETERMINED`. Consensus ratifies only that verdict
  (the one-sentence reason is annotation). This is deliberate: the measurement in `EQUIVALENCE.md` showed validators
  cannot agree on rich per-cell output but can agree on a small, bounded answer.
- If the answer depends on facts the text does not settle, the right answer is `UNDETERMINED` and nothing changes.
  One retry is allowed after an `UNDETERMINED`; a `HOLDS` / `DOES_NOT_HOLD` ruling is final for that proposition.
- A ruling never edits the stored record. `get_effective_record` applies it on read: the proposition becomes
  `RULED_TRUE` / `RULED_FALSE`, clarity 100, divergence 0, and the ambiguity index is recomputed. `get_signal`,
  `execute_action` and the gate contract all read the *effective* record, so a ruling moves money.
- The governing text is screened for instruction-like content (same greybox scan as evidence) and rejected up front.

> **v5 note.** Rulings are stored per hash of the governing text, and only move money for an action or policy that committed to that same text at funding. See `docs/PAYOUT.md`. The measurements below are from v4.

### Measured on GenLayer Studio (v4 `0x1e7d9A797860faCF5e993AFF715DD2C5d4B1f237`)
Two purpose-built inquiries whose propositions each turn on a clause. 10 rulings, all `ACCEPTED / MAJORITY_AGREE`,
**every one in a single consensus round** (16-29 s). Raw data: `scripts/rulings-easy.json`, `scripts/rulings-hard.json`.

| Batch | Rulings | Intended verdict | Notes |
|---|---|---|---|
| Easy (clear text) | 5 | 5 of 5 | includes the fact-dependent liability question, correctly `UNDETERMINED` |
| Harder (vague or borderline wording) | 5 | 5 of 5 (one case had two acceptable answers) | includes "within a reasonable time", correctly `UNDETERMINED`; "30 business days vs 30 calendar days" |
| Effect on the record | | ambiguity 100 -> 20 and 83 -> 17 | the one `UNDETERMINED` proposition stays contested, as it should |

**How much to trust that:** the cases were written by me, the intended verdicts are my reading of the text, and n = 10.
It shows the mechanism reaches consensus and behaves sensibly; it is not a benchmark of interpretive accuracy.

### Limitation that matters most: who supplies the governing text
The requester supplies the text the question is judged against, and a final ruling cannot be redone. A bad-faith
party could therefore quote a clause selectively. What is in place: the exact text is stored on-chain next to the
ruling and shown in the UI, so the choice is auditable; `source_url` lets validators fetch the text themselves
(unmeasured). What is **not** in place, and is the obvious next step: pin the governing text (or its hash) when the
inquiry is opened, so no later party can pick it. Do not use rulings for anything adversarial until that exists.

A concrete instance, found while testing the UI: the retry of the fact-dependent liability question was answered
`DOES_NOT_HOLD` after I added *"the reefer telemetry for this voyage shows supply air within the band"* to the governing
text. The ruling is only as honest as the text submitted: facts typed into that box are treated as part of it. The
prompt asks for what the text says, but it cannot tell a clause from an assertion pasted next to one.

## Fragility map

`get_fragility(inquiry_id)` (and `Concordance.fragility()` in `web/derive.js`) removes each party in turn, re-derives
the record, and reports which propositions change class or lean, plus the shift in the ambiguity index. A party whose
removal flips at least one proposition is `pivotal`.

- It is computed from the stored record's cells alone: no model call, nothing new for validators to agree on, and it
  works on every record already on-chain.
- Python and JavaScript implementations are parity-tested on all 24 real model records and the scripted rounds.
- On the demo's round 2, Halden is pivotal: remove them and 3 of 7 propositions change, ambiguity 38 -> 6. On the
  deliberately adversarial clause inquiry both parties are pivotal on everything (fragility 100): an honest
  "this verdict hinges on two people who flatly contradict each other".
- It measures dependence on a party, not correctness. A record can be fragile and right, or robust and wrong.

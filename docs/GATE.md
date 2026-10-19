# ConcordanceGate: a second contract that reads the oracle

`contracts/concordance_gate.py` is a separate Intelligent Contract that pays out by Concordance's signals. It exists
to show the claim "Concordance is an oracle other contracts can build on" with a working consumer, not just a
sentence.

- `open_policy(policy_id, inquiry_id, beneficiary, req_props, req_wants, min_clarity)` (payable): locks funds.
  It calls Concordance's `get_status` to confirm the inquiry exists and is open.
- `claim(policy_id)`: anyone may trigger it. The gate calls `get_signal` for each required proposition **across
  contracts**, computes the clarity-weighted release, and pays only the increment (releases ratchet up).
- `refund(policy_id)`: the funder reclaims the remainder once the inquiry can no longer gather evidence.
- Nothing in the gate is specific to one inquiry or one proposition. Signals carry `weight`, `clarity`, `lean`,
  `status`, and `ruled`, so the gate pays differently for a settled fact, a contested fact, and a ruled meaning.

Cross-contract reads (`gl.get_contract_at(addr).view().method(...)`) are synchronous and deterministic, so they need
no extra consensus. The docs did not say whether a view call is allowed inside a write method; it is (verified below).

## Measured on Studio
Gate `0x620ec49c91469A2fa7Fa0d08bD009d99CCBd6287` reading Concordance v4 `0x1e7d9A797860faCF5e993AFF715DD2C5d4B1f237`
(`scripts/gate-test.mjs`, results in `scripts/gate-result.json`):

| Step | Expected | Observed |
|---|---|---|
| `open_policy` (cross-contract `get_status` inside a write) | accepted | `ACCEPTED / MAJORITY_AGREE`, policy stored |
| `claim` on a proposition settled by a **ruling** | pays 100% = 1,000,000 wei | paid 1,000,000; beneficiary balance +1,000,000; history records `ruled: [0]` |
| second `claim` | refused | `exec=ERROR`, nothing paid |
| `claim` on an **unruled, deadlocked** proposition | refused (0% justified) | `exec=ERROR` |
| `refund` by a non-funder | refused | `exec=ERROR` |
| `refund` by the funder after the inquiry was closed | remainder returned | policy `CLOSED`; funder received 1,000,000 wei (credited after finalization, a few minutes) |
| Conservation | contract balance = sum of open reserves | gate balance 1,000,000 = the one open, unpaid policy |

The claim row was run on two independent inquiries (a ruling on proposition 0 of the easy inquiry, on proposition 4 of
the hard one) with the same outcome.

The ruling row is the point: a ruling made in one contract changed what a different contract paid, with
no trusted intermediary and no change to the gate.

## Not covered
- The gate trusts whichever Concordance address it was constructed with; it does not verify that contract's code.
- Studio credits transfers after finalization, so balance checks made seconds after a payout can read zero.
- No audit.

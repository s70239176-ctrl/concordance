# On-chain escrow test (GenLayer Studio, v3 `0x58E8b84B0b55e9d4d33e5E973CF41D475919ECc7`)

`node scripts/escrow.mjs <inquiry_id>` (set `FUNDER=<index>` for a fresh zero-balance funder). Throwaway keys,
1,000,000 wei escrow, required propositions and wants from the demo scenario. The expected release is computed by
`web/derive.js` from the record **read back from the chain**, then compared with what actually moved.

| Step | Expected | Observed (clean run, inquiry `halden-mvf4dd20`, ambiguity 79) |
|---|---|---|
| `open_action` with 1,000,000 | stored, status OPEN | OPEN, escrow 1,000,000, paid 0 |
| `execute_action` by a stranger | release 18% = 180,000 | paid 180,000; beneficiary balance +180,000 |
| `execute_action` again, same record | refused, no second payout | `exec=ERROR`, paid unchanged |
| `close_action` while inquiry open | refused | `exec=ERROR` |
| `close_inquiry` by non-opener | refused | `exec=ERROR` |
| `close_inquiry` by opener | allowed | `exec=SUCCESS` |
| `close_action` by non-funder | refused | `exec=ERROR` |
| `close_action` by funder | refund remainder 820,000 | CLOSED; funder balance +820,000 |

Conservation: 180,000 + 820,000 = 1,000,000; contract balance 0 afterwards.

Three runs in total. Run 1 (release 12% = 120,000, refund 880,000) matched, with the refund visible only after a
delay of several minutes. Run 3 above matched with the refund arriving within the script's wait window.
Run 2's funder delta read 0: that funder account already held 880,000 from run 1, below the 1,000,000 deposit.
My reading is that Studio debits the sender with a clamp at zero, which accounts for the numbers (contract balance
0, beneficiary +120,000, funder 880,000), but I did not prove it; treat run 2's funder delta as uninformative.

## Not covered
- Release after a *second* round improving clarity (ratchet upward): real rounds did not reproduce the scripted
  improvement, so only a single release per action was exercised on-chain.
- Real value on a production network; Studio balances are test accounting.

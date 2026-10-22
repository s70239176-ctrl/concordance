// Steward-review checks on Studio (v5 contracts): money moves only on what validators ratify, and a ruling binds a
// payout only on the exact text committed at funding.
//   node scripts/ratify-test.mjs
// Needs state keys v5 (Concordance) and gate5 (ConcordanceGate) from `node scripts/deploy.mjs`.
import { writeFileSync } from 'fs'
import { join } from 'path'
import { createAccount, generatePrivateKey } from 'genlayer-js'
import { accounts, client, loadState, send, read, ROOT } from './common.mjs'

const { v5: oracle, gate5: gate } = loadState()
const accs = accounts(8)
const [opener, carrier, shipper, funder, claimer] = [0, 1, 2, 5, 6].map((i) => client(accs[i]))
const id = 'rat-' + Date.now().toString(36)
const CLAUSE = "Clause 14.2 (Force majeure). 'Port closure' means a formal order of the harbour master or port authority suspending berthing or cargo operations. A vessel waiting in an anchorage queue without such an order is not subject to a port closure."
const SUBSTITUTED = "Clause 14.2 (Force majeure). 'Port closure' includes any vessel waiting in an anchorage queue, with or without an order."
const PROPS = ["An anchorage hold counts as a 'port closure' under clause 14.2.",
  'Clause 14.2 requires a formal order from the harbour master or port authority for a port closure.',
  'The vessel waited at anchor for more than forty hours.']
const V = 1_000_000n
const j = JSON.parse
const log = []
const say = (...a) => { console.log(...a); log.push(a.join(' ')) }
const st = (r) => `${r.tx?.statusName}/${r.tx?.result_name} exec=${r.tx?.consensus_data?.leader_receipt?.[0]?.execution_result} rounds=${Number(r.tx?.num_of_rounds)}`
const ben = createAccount(generatePrivateKey()).address
const out = { inquiry: id, oracle, gate, steps: [] }
const step = (name, r, extra = {}) => { out.steps.push({ name, result: st(r), hash: r.hash, ...extra }); say(name, '->', st(r)) }
const paid = async (pid) => BigInt(j(await read(opener, gate, 'get_policy', [pid])).paid)

say('inquiry', id, '| oracle', oracle, '| gate', gate)
await send(opener, oracle, 'open_inquiry', [id, 'Does the carrier owe the shipper anything under the contract clauses?', PROPS, [5, 5, 5]])
await send(carrier, oracle, 'submit_account', [id, 'Carrier', 'Every clause favours us. The anchorage hold was a port closure, so force majeure applies, and no formal order was needed. We waited 42 hours.', 'Vessel at anchor 14:02 on the 5th to 17:15 on the 7th.', []])
await send(shipper, oracle, 'submit_account', [id, 'Shipper', 'No clause helps the carrier. An anchorage queue is not a port closure, a formal order is required and none was issued. The wait was about 44 hours, and I accept the vessel sat at anchor for more than forty hours.', 'The harbour master issued no order; port log shows no closure notice and anchor times 14:02 on the 5th to 17:15 on the 7th.', []])
const cv = await send(opener, oracle, 'convene', [id])
step('convene', cv)
const rec = j(await read(opener, oracle, 'get_record', [id]))
say('leader record:', rec.props.map((p) => `${p.index + 1}:${p.status}/${p.lean}/${p.clarity}`).join(' '), 'ambiguity', rec.ambiguity)
out.record = rec.props.map((p) => ({ status: p.status, lean: p.lean, clarity: p.clarity }))

// 1. nothing ratified yet: the leader's annotated lean must not pay
const target = rec.props.findIndex((p) => p.lean !== 'NONE' && p.status !== 'UNSUPPORTED')
if (target < 0) { say('no leaning proposition to test with'); process.exit(1) }
const want = rec.props[target].lean
const p1 = 'pol-a-' + Date.now().toString(36)
step('open_policy (no committed text)', await send(funder, gate, 'open_policy', [p1, id, ben, [target], [want], 0, ['']], V))
let r = await send(claimer, gate, 'claim', [p1])
step('claim BEFORE ratification (must be refused)', r, { paid: String(await paid(p1)) })

// 2. ratification by validators; may legitimately fail to reach consensus
r = await send(claimer, oracle, 'ratify_payout', [id, target])
step(`ratify_payout prop ${target + 1}`, r)
const sig = j((await read(opener, oracle, 'get_signal', [id, target, ''])) || 'null')
say('signal after ratify attempt:', JSON.stringify(sig))
out.signalAfterRatify = sig
r = await send(claimer, gate, 'claim', [p1])
step('claim AFTER ratification', r, { paid: String(await paid(p1)), signal: sig })

// 3. substituted post-funding text. Policy commits to CLAUSE; a stranger rules on SUBSTITUTED.
const p2 = 'pol-b-' + Date.now().toString(36)
step('open_policy (committed to the real clause)', await send(funder, gate, 'open_policy', [p2, id, ben, [0], ['FALSE'], 0, [CLAUSE]], V))
r = await send(claimer, oracle, 'request_ruling', [id, 0, SUBSTITUTED, ''])
const sub = (j((await read(opener, oracle, 'get_rulings', [id])) || '[]')[0] || {}).verdict
step('ruling on SUBSTITUTED text', r, { verdict: sub })
r = await send(claimer, gate, 'claim', [p2])
step('claim after substituted ruling (must be refused unless ratified separately)', r, { paid: String(await paid(p2)) })
const p2paid = await paid(p2)
r = await send(claimer, oracle, 'request_ruling', [id, 0, CLAUSE, ''])
step('ruling on the COMMITTED text', r)
r = await send(claimer, gate, 'claim', [p2])
step('claim after the committed-text ruling', r, { paid: String(await paid(p2)), paidBeforeCommittedRuling: String(p2paid) })
const sg = j((await read(opener, oracle, 'get_signal', [id, 0, ''])) || 'null')
out.log = log
writeFileSync(join(ROOT, 'scripts', 'ratify-result.json'), JSON.stringify(out, null, 2))
say('done')

// Measure the ruling layer on Studio: a clause-based inquiry, convene, then request_ruling on each contested
// proposition and score the verdict against what the clause text plainly says.
//   node scripts/ruling-test.mjs
import { writeFileSync } from 'fs'
import { join } from 'path'
import { accounts, client, loadState, send, read, ROOT } from './common.mjs'

const { v4: address } = loadState()
const accs = accounts(8)
const [opener, carrier, shipper] = [client(accs[0]), client(accs[1]), client(accs[2])]
const id = 'clause-' + (process.argv[2] || 'easy') + '-' + Date.now().toString(36)
const CL14 = "Clause 14.2 (Force majeure). 'Port closure' means a formal order of the harbour master or port authority suspending berthing or cargo operations. A vessel waiting in an anchorage queue without such an order is not subject to a port closure. Force majeure events are: port closure, a labour strike affecting the port, act of God, war."
const CL5 = "Clause 5 (Delivery). The carrier shall deliver the cargo within a reasonable time."
const SETS = {
  easy: [
  { prop: "An anchorage hold counts as a 'port closure' under clause 14.2.", clause: CL14, expect: 'DOES_NOT_HOLD' },
  { prop: 'Clause 14.2 requires a formal order from the harbour master or port authority for a port closure.', clause: CL14, expect: 'HOLDS' },
  { prop: 'Force majeure under clause 14.2 covers a labour strike affecting the port.', clause: CL14, expect: 'HOLDS' },
  { prop: 'Under clause 3, delay is measured from the original ETA rather than from the end of the departure window.',
    clause: 'Clause 3 (Delay). Delay is measured in hours from the end of the contractual departure window to the actual departure. No estimated time of arrival is used to measure delay.', expect: 'DOES_NOT_HOLD' },
  { prop: 'Under clause 9, the carrier is liable for the cargo spoilage in this case.',
    clause: 'Clause 9 (Liability). The carrier is liable for cargo spoilage caused by a failure of the reefer unit. The carrier is not liable where reefer telemetry shows supply air within the contract band throughout the voyage.', expect: 'UNDETERMINED' },
],
  hard: [
    { prop: "A delay of 70 hours is a breach of the carrier's duty to deliver 'within a reasonable time' under clause 5.", clause: CL5, expect: ['UNDETERMINED'] },
    { prop: 'Under clause 7 the carrier may use an affiliate company to perform the voyage.',
      clause: "Clause 7 (Assignment). The carrier shall not assign this contract to any third party without the shipper's written consent. Performance of the voyage by the carrier's own affiliates is permitted.", expect: ['HOLDS'] },
    { prop: 'The notice period in clause 12 is thirty calendar days.',
      clause: 'Clause 12 (Notice). A claim must be notified within thirty (30) business days of delivery.', expect: ['DOES_NOT_HOLD'] },
    { prop: "Cargo that reaches 4.6 C for 40 minutes was not kept 'in good order' under clause 8.",
      clause: "Clause 8 (Condition). The carrier shall keep the cargo in good order and within the contract temperature band of 2-4 C.", expect: ['HOLDS', 'UNDETERMINED'] },
    { prop: "The shipper's right to terminate under clause 15 applies to a 61-hour delay.",
      clause: 'Clause 15 (Termination). The shipper may terminate if delay exceeds seventy-two (72) hours, measured as set out in clause 3.', expect: ['DOES_NOT_HOLD'] },
    { prop: "Clause 11 excludes the carrier's liability for loss caused by the shipper's own packaging.",
      clause: "Clause 11 (Exclusions). The carrier is not liable for loss or damage caused by inherent vice of the goods, insufficient packing by the shipper, or the shipper's failure to disclose special handling needs.", expect: ['HOLDS'] },
  ],
}
const SET = process.argv[2] || 'easy'
const CASES = SETS[SET].map((c) => ({ ...c, expect: Array.isArray(c.expect) ? c.expect : [c.expect] }))
const log = []
const say = (...a) => { console.log(...a); log.push(a.join(' ')) }
const j = (v) => JSON.parse(v)
const dec = (x) => { const b = typeof x === 'string' ? x : x?.raw; if (!b) return null; const s = Buffer.from(b, 'base64').toString('utf8'); try { return JSON.parse(s.slice(s.indexOf('{'))) } catch { return null } }

say('inquiry', id)
await send(opener, address, 'open_inquiry', [id, 'Does the carrier owe the shipper anything under the contract clauses?', CASES.map((c) => c.prop), CASES.map(() => 5)])
await send(carrier, address, 'submit_account', [id, 'Carrier', SET === 'easy' ? "Every clause favours us. The anchorage hold was a port closure, so force majeure applies, no formal order was needed, a strike would also be covered, delay counts from the departure window not the ETA, and we are not liable for the spoilage." : "Every point of the contract favours us: the delay was not unreasonable, we may use affiliates, the notice period is thirty calendar days, the cargo stayed in good order, no termination right arises from this delay, and the shipper's packaging caused any damage.", 'Vessel at anchor 14:02 on the 5th to 17:15 on the 7th. Reefer supply-air telemetry 2.1-2.9 C against a 2-4 C band all voyage.', []])
await send(shipper, address, 'submit_account', [id, 'Shipper', SET === 'easy' ? "No clause helps the carrier. An anchorage queue is not a port closure, a formal order is required and none was issued to this vessel, strikes are not relevant here, delay is counted from the original ETA, and the carrier is liable for the spoilage." : "The contract favours us on every point: 70 hours is clearly unreasonable, affiliates were not allowed, the claim window is calendar days, the cargo left the band and was not in good order, we can terminate, and our packaging was fine.", 'Receiving dock core probe read 7.8 C against the 2-4 C band. Original ETA was the 9th 08:00; arrival was the 12th 02:00.', []])
const cv = await send(opener, address, 'convene', [id])
say('convene', cv.tx?.statusName, cv.tx?.result_name, 'rounds', cv.tx?.num_of_rounds)
const raw = j(await read(opener, address, 'get_record', [id]))
say('record statuses:', raw.props.map((p) => `${p.index + 1}:${p.status[0]}${p.divergence}`).join(' '), 'ambiguity', raw.ambiguity)
const fr = j(await read(opener, address, 'get_fragility', [id]))
say('fragility:', JSON.stringify({ fragility: fr.fragility, pivotal: fr.pivotal, fragile: fr.fragile_props }))

const results = []
for (let i = 0; i < CASES.length; i++) {
  const p = raw.props[i]
  if (p.status !== 'CONTESTED') { say(`prop ${i + 1}: ${p.status} (not contested, no ruling requested)`); results.push({ prop: i, skipped: p.status }); continue }
  const t0 = Date.now()
  const r = await send(opener, address, 'request_ruling', [id, i, CASES[i].clause, ''])
  const exec = r.tx?.consensus_data?.leader_receipt?.[0]?.execution_result
  const hist = (r.tx?.consensus_history?.consensus_results ?? []).map((cr) => { const lr = Array.isArray(cr.leader_result) ? cr.leader_result[0] : cr.leader_result; return { model: String(lr?.node_config?.primary_model?.model ?? '').replace('policy:prd-', ''), votes: (cr.validator_results ?? []).map((v) => v.vote) } })
  const stored = j((await read(opener, address, 'get_rulings', [id])) || '[]').find((x) => x.prop === i)
  const row = { prop: i, expect: CASES[i].expect, verdict: stored?.verdict ?? null, reason: stored?.reason, status: r.tx?.statusName, result: r.tx?.result_name, exec, rounds: Number(r.tx?.num_of_rounds), secs: Math.round((Date.now() - t0) / 1000), hist }
  results.push(row)
  say(`prop ${i + 1}: expect ${row.expect.join('|').padEnd(21)} got ${String(row.verdict).padEnd(13)} ${row.expect.includes(row.verdict) ? 'OK ' : 'MISS'} ${row.status}/${row.result} exec=${exec} rounds=${row.rounds} ${row.secs}s | ${stored?.reason ?? ''}`)
}
const eff = j(await read(opener, address, 'get_effective_record', [id]))
say('effective:', eff.props.map((p) => `${p.index + 1}:${p.status.replace('AGREED_', 'A').replace('RULED_', 'R')[0]}${p.divergence}`).join(' '), 'ambiguity', raw.ambiguity, '->', eff.ambiguity, 'ruled', eff.ruled)
writeFileSync(join(ROOT, 'scripts', 'rulings-' + SET + '.json'), JSON.stringify({ inquiry: id, address, raw: { ambiguity: raw.ambiguity }, effective: { ambiguity: eff.ambiguity, ruled: eff.ruled }, fragility: fr, results }, null, 2))

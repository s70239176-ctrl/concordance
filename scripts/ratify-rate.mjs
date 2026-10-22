// How often do real Studio validators ratify a payout surface? Several inquiries, then ratify_payout on every
// proposition whose leader record has a lean. Each failed attempt is retried once.
//   node scripts/ratify-rate.mjs
import { writeFileSync } from 'fs'
import { join } from 'path'
import { accounts, client, loadState, send, read, ROOT } from './common.mjs'

const { v5: oracle } = loadState()
const accs = accounts(8)
const [opener, carrier, shipper, caller] = [0, 1, 2, 6].map((i) => client(accs[i]))
const j = JSON.parse
const log = []
const say = (...a) => { console.log(...a); log.push(a.join(' ')) }
const st = (r) => `${r.tx?.statusName}/${r.tx?.result_name} exec=${r.tx?.consensus_data?.leader_receipt?.[0]?.execution_result} rounds=${Number(r.tx?.num_of_rounds)}`

const SCEN = [
  { q: 'Was the refrigerated cargo kept within its contract temperature band?',
    props: ['The reefer supply air stayed between 2 and 4 C for the whole voyage.', 'The cargo core temperature reached 7.8 C at the receiving dock.', 'The reefer unit failed during the voyage.', 'The cargo was loaded at the contract temperature.'],
    a: ['The reefer unit never failed. Supply-air telemetry stayed 2.1-2.9 C all voyage and the cargo was loaded at 3.0 C.', 'Telemetry export, 30 minute samples, 2.1-2.9 C; loading probe 3.0 C at 09:10 on the 1st.'],
    b: ['The cargo arrived warm. Our dock probe read 7.8 C in the core of three pallets, so the temperature band was not kept.', 'Dock probe log: 7.8 C, 7.6 C, 7.9 C at 14:20 on the 12th. We do not dispute the loading temperature.'] },
  { q: 'Did the port delay the vessel, and did it breach the notice rules?',
    props: ['The vessel waited at anchor for more than forty hours.', 'The port authority issued a formal closure order.', 'The carrier notified the shipper of the delay within 24 hours.', 'The delay was caused by berth congestion.'],
    a: ['We waited 42 hours at anchor because the berth was congested. We emailed the shipper 6 hours after arriving at the anchorage.', 'Anchor log 14:02 on the 5th to 17:15 on the 7th. Email sent 20:05 on the 5th.'],
    b: ['The vessel waited about 44 hours. There was no closure order from the port, only berth congestion. The carrier told us two days late.', 'Port log shows no order. Our inbox shows the carrier email at 18:30 on the 7th.'] },
  { q: 'Is the landlord responsible for the water damage to the tenant\'s stock?',
    props: ['The roof leak started before the tenant moved the stock in.', 'The landlord was told about the leak in writing before the damage.', 'The tenant stored the stock off the floor as the lease requires.', 'The landlord repaired the roof within a reasonable time.'],
    a: ['I was never told about a leak in writing, and the roof was repaired within a week of my learning of it. The tenant kept stock on the floor.', 'Repair invoice dated the 14th; no written notice in my records.'],
    b: ['The roof leaked long before we moved in. I emailed the landlord about the leak on the 2nd and the damage happened on the 20th. Our stock was on pallets.', 'Email of the 2nd with photo of the stain; photo of the pallets.'] },
  { q: 'Did the software vendor deliver what the contract required by the deadline?',
    props: ['The vendor delivered the working release by the contract deadline.', 'The release passed the agreed acceptance tests.', 'The customer approved the design before development started.', 'The customer requested changes after the deadline.'],
    a: ['We delivered build 4.2 on the 30th, the deadline. It passed all 118 acceptance tests. The customer approved the design in writing and then asked for new features after the deadline.', 'Delivery receipt 30th 16:40; test report 118/118; signed design approval; change request dated the 3rd.'],
    b: ['The release arrived on the 31st, a day late, and failed 9 acceptance tests. We approved the design but the vendor then departed from it.', 'Our download log shows the build on the 31st at 08:12; our test run shows 9 failures; the design approval email.'] },
]
const out = { oracle, attempts: [], scenarios: [] }
let total = 0, first = 0, eventual = 0
const byStatus = {}
for (const [n, sc] of SCEN.entries()) {
  const id = `rate${n}-` + Date.now().toString(36)
  say('scenario', n, id)
  await send(opener, oracle, 'open_inquiry', [id, sc.q, sc.props, sc.props.map(() => 5)])
  await send(carrier, oracle, 'submit_account', [id, 'Party A', sc.a[0], sc.a[1], []])
  await send(shipper, oracle, 'submit_account', [id, 'Party B', sc.b[0], sc.b[1], []])
  const cv = await send(opener, oracle, 'convene', [id])
  say(' convene', st(cv))
  const rec = j((await read(opener, oracle, 'get_record', [id])) || 'null')
  if (!rec) { say(' no record'); continue }
  say(' leader record:', rec.props.map((p) => `${p.index + 1}:${p.status}/${p.lean}/${p.clarity}`).join(' '), 'ambiguity', rec.ambiguity)
  out.scenarios.push({ id, record: rec.props.map((p) => ({ status: p.status, lean: p.lean, clarity: p.clarity })) })
  for (const p of rec.props) {
    if (p.lean === 'NONE' || p.status === 'UNSUPPORTED') continue
    total++
    const key = p.status.startsWith('AGREED') ? 'AGREED' : 'CONTESTED'
    byStatus[key] ??= { n: 0, first: 0, eventual: 0 }
    byStatus[key].n++
    let done = false
    for (let t = 1; t <= 2 && !done; t++) {
      const r = await send(caller, oracle, 'ratify_payout', [id, p.index])
      const sig = j((await read(opener, oracle, 'get_signal', [id, p.index, ''])) || 'null')
      const ok = sig?.status === 'RATIFIED' && sig.lean !== 'NONE' // a stored NONE/0 is 'ratified as nothing': it pays nothing
      say(`  prop ${p.index + 1} ${p.status}/${p.lean}/${p.clarity} try ${t}: ${st(r)} -> ${ok ? `RATIFIED ${sig.lean} ${sig.clarity}` : 'not ratified'}`)
      out.attempts.push({ id, prop: p.index, leader: { status: p.status, lean: p.lean, clarity: p.clarity }, try: t, result: st(r), hash: r.hash, ratified: ok, stored: ok ? { lean: sig.lean, clarity: sig.clarity } : null })
      if (ok) { done = true; if (t === 1) { first++; byStatus[key].first++ } eventual++; byStatus[key].eventual++ }
    }
  }
}
out.summary = { propositions: total, ratifiedFirstTry: first, ratifiedWithOneRetry: eventual, byLeaderClass: byStatus }
out.log = log
writeFileSync(join(ROOT, 'scripts', 'ratify-rate.json'), JSON.stringify(out, null, 2))
say('SUMMARY', JSON.stringify(out.summary))

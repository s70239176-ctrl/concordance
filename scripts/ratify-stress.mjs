// How often do real Studio validators ratify a payout surface? Deliberately subjective inquiries (to provoke validator disagreement), then ratify_payout on every
// proposition whose leader record has a lean. Each failed attempt is retried up to twice.
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
  { q: 'Was the contractor work acceptable?',
    props: ['The finish quality was acceptable.', 'The contractor responded to complaints in a reasonable time.', 'The price charged was fair for the work done.', 'The delay to completion was reasonable.'],
    a: ['The finish was fine apart from small marks, we answered complaints within a few days, the price matched the quote, and a short delay is normal on jobs like this.', 'Quote of 4,200 and invoice of 4,200; two replies sent within three days.'],
    b: ['The finish had visible marks in several rooms, replies took most of a week, the price was high for what we got, and the delay was longer than anyone told us.', 'Photos of marks in three rooms; replies dated 4 to 6 days after our emails.'] },
  { q: 'Did the seller describe the car honestly?',
    props: ['The car was in good condition when sold.', 'The mileage was described accurately.', 'The seller disclosed all known faults.', 'The price reflected the true condition.'],
    a: ['The car ran well, the odometer was correct, I mentioned the old rattle I knew about, and the price was fair for its age.', 'Service record shows the last service 3 months before sale.'],
    b: ['The gearbox failed after two weeks, the odometer looked wrong to our mechanic, the seller never mentioned any faults, and we overpaid.', 'Mechanic note about the gearbox and odometer; no mention of faults in the advert.'] },
  { q: 'Was the tenant notice to leave valid and reasonable?',
    props: ['The tenant gave sufficient notice.', 'The property was left in reasonable condition.', 'The deposit deduction was justified.', 'The landlord acted reasonably after the notice.'],
    a: ['Notice was given late by a few days, the flat needed extra cleaning, a deduction for cleaning was justified, and we acted reasonably.', 'Cleaning invoice; email of notice dated 5 days short.'],
    b: ['We gave notice in good time by email, left the flat clean apart from normal wear, the deduction was not justified, and the landlord was slow and unreasonable.', 'Email notice with date; move-out photos.'] },
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
    for (let t = 1; t <= 3 && !done; t++) {
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
writeFileSync(join(ROOT, 'scripts', 'ratify-stress.json'), JSON.stringify(out, null, 2))
say('SUMMARY', JSON.stringify(out.summary))

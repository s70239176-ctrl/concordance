// Exercise ConcordanceGate on Studio: it reads Concordance's signals ACROSS CONTRACTS and pays by them.
//   node scripts/gate-test.mjs <inquiry_id>        (an inquiry on the v4 Concordance with at least one ruled proposition)
//   node scripts/gate-test.mjs <inquiry_id> refund  (after the inquiry has been closed)
import { writeFileSync, existsSync, readFileSync } from 'fs'
import { join } from 'path'
import { createAccount, generatePrivateKey } from 'genlayer-js'
import { accounts, client, loadState, send, read, ROOT } from './common.mjs'

const { v4, gate } = loadState()
const inquiry = process.argv[2]
const mode = process.argv[3] || 'claim'
const accs = accounts(8)
const funder = client(accs[5]), claimer = client(accs[6]), reader = client(accs[0])
const OUT = join(ROOT, 'scripts', 'gate-result.json')
const out = existsSync(OUT) ? JSON.parse(readFileSync(OUT, 'utf8')) : { runs: [] }
const bal = async (a) => BigInt((await (await fetch('https://studio.genlayer.com/api', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_getBalance', params: [a, 'latest'] }) })).json()).result)
const st = (r) => `${r.tx?.statusName}/${r.tx?.result_name} exec=${r.tx?.consensus_data?.leader_receipt?.[0]?.execution_result}`
const j = JSON.parse
const log = []
const say = (...a) => { console.log(...a); log.push(a.join(' ')) }
const V = 1_000_000n

say('gate', gate, 'reads concordance', await read(reader, gate, 'get_concordance'))
const rulings = j(await read(reader, v4, 'get_rulings', [inquiry]) || '[]')
const effective = j(await read(reader, v4, 'get_effective_record', [inquiry]))
say('rulings on chain:', rulings.map((r) => `${r.prop}:${r.verdict}`).join(' '), '| effective statuses:', effective.props.map((p) => `${p.index}:${p.status}`).join(' '))

if (mode === 'claim') {
  const ruled = rulings.find((r) => r.verdict === 'DOES_NOT_HOLD'), want = 'FALSE'
  const contested = effective.props.find((p) => p.status === 'CONTESTED')
  const ben = createAccount(generatePrivateKey()).address
  const pid = 'pol-' + Date.now().toString(36)
  const b0 = await bal(ben)
  let r = await send(funder, gate, 'open_policy', [pid, inquiry, ben, [ruled.prop], [want], 0], V)
  say('open_policy (needs a cross-contract read of get_status):', st(r))
  const p0 = j(await read(reader, gate, 'get_policy', [pid]) || 'null')
  say('policy stored:', p0 && JSON.stringify({ escrow: p0.escrow, paid: p0.paid, status: p0.status }))
  r = await send(claimer, gate, 'claim', [pid])
  const claimTx = r.hash
  say('claim by a stranger (cross-contract get_signal):', st(r))
  const p1 = j(await read(reader, gate, 'get_policy', [pid]))
  say('paid:', p1.paid, 'history:', JSON.stringify(p1.history))
  r = await send(claimer, gate, 'claim', [pid])
  say('second claim (must be refused):', st(r))
  let neg = null
  if (contested) {
    const pid2 = 'pol-' + Date.now().toString(36) + 'b'
    await send(funder, gate, 'open_policy', [pid2, inquiry, ben, [contested.index], ['TRUE'], 0], V)
    r = await send(claimer, gate, 'claim', [pid2])
    neg = st(r)
    say('claim on an UNRULED deadlocked proposition (must be refused):', neg)
    out.unruled = { policy: pid2, prop: contested.index, result: neg }
  }
  await new Promise((res) => setTimeout(res, 20000))
  const gained = (await bal(ben)) - b0
  say('beneficiary gained', String(gained), '| expected', String(V))
  out.runs.push({ at: new Date().toISOString(), gate, concordance: v4, inquiry, policy: pid, ruledProp: ruled.prop, want, claimTx, paid: String(p1.paid), release_pct: p1.history?.[0]?.release_pct, gained: String(gained), log })
} else {
  const pols = j(await read(reader, gate, 'list_policies', [0, 50]))
  const open = pols.filter((p) => p.inquiry_id === inquiry && p.status === 'OPEN')
  for (const p of open) {
    let r = await send(client(accs[3]), gate, 'refund', [p.policy_id]); say('refund by a non-funder (must be refused):', p.policy_id, st(r))
    const b = await bal(accs[5].address)
    r = await send(funder, gate, 'refund', [p.policy_id]); say('refund by funder:', p.policy_id, st(r))
    await new Promise((res) => setTimeout(res, 15000))
    say('funder balance change', String((await bal(accs[5].address)) - b), '| policy now', j(await read(reader, gate, 'get_policy', [p.policy_id])).status)
  }
  out.refund = { at: new Date().toISOString(), log }
}
writeFileSync(OUT, JSON.stringify(out, null, 2))

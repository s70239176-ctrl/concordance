// Exercise open_action / execute_action / close_action on the deployed contract against a convened inquiry,
// and check every balance change against what derive.js says the on-chain record justifies.
//   node scripts/escrow.mjs <inquiry_id>
import { createRequire } from 'module'
import { join } from 'path'
import { writeFileSync } from 'fs'
import { createAccount, generatePrivateKey } from 'genlayer-js'
import { accounts, client, loadState, send, read, ROOT } from './common.mjs'

const require = createRequire(import.meta.url)
const S = require(join(ROOT, 'web', 'scenarios.js'))
const D = require(join(ROOT, 'web', 'derive.js'))
const { address } = loadState()
const inquiry = process.argv[2]
const FI = parseInt(process.env.FUNDER || '5', 10)
const accs = accounts(Math.max(6, FI + 1)) // [0] opener, [FI] funder
const opener = client(accs[0]), funderC = client(accs[FI]), stranger = client(accs[2])
const beneficiary = createAccount(generatePrivateKey()).address
const V = 1_000_000n
const aid = 'esc-' + Date.now().toString(36)
const log = []
const note = (k, v) => { log.push({ k, v }); console.log(k.padEnd(34), typeof v === 'object' ? JSON.stringify(v) : v) }

const bal = async (a) => BigInt((await (await fetch('https://studio.genlayer.com/api', {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_getBalance', params: [a, 'latest'] }) })).json()).result)
const st = (r) => `${r.tx?.statusName}/${r.tx?.result_name} exec=${r.tx?.consensus_data?.leader_receipt?.[0]?.execution_result ?? '?'}`

const rec = JSON.parse(await read(opener, address, 'get_record', [inquiry]))
const A = S.action
const expectPct = D.releaseFraction(rec.props, A.reqProps, A.reqWants, A.minClarity)
note('on-chain ambiguity', rec.ambiguity)
note('expected release pct (derive.js)', expectPct)
note('expected first payout', String(V * BigInt(expectPct) / 100n))
const b0 = { ben: await bal(beneficiary), fun: await bal(accs[FI].address) }
note('balances before', { beneficiary: String(b0.ben), funder: String(b0.fun) })

// 1. open_action with escrow
let r = await send(funderC, address, 'open_action', [aid, inquiry, beneficiary, A.reqProps, A.reqWants, A.minClarity], V)
note('open_action', st(r))
let act = JSON.parse((await read(opener, address, 'get_action', [aid])) || 'null')
note('action stored', act && { escrow: act.escrow, paid: act.paid, status: act.status })

// 2. execute_action (anyone): should pay V*pct/100 to beneficiary
r = await send(stranger, address, 'execute_action', [aid])
note('execute_action #1 (stranger)', st(r))
act = JSON.parse(await read(opener, address, 'get_action', [aid]))
note('paid after #1', act.paid)
// 3. execute again: nothing further, must not pay twice
r = await send(stranger, address, 'execute_action', [aid])
note('execute_action #2 (no new clarity)', st(r))
const act2 = JSON.parse(await read(opener, address, 'get_action', [aid]))
note('paid after #2 (must be unchanged)', act2.paid)
// 4. close_action while inquiry open: must be refused
r = await send(funderC, address, 'close_action', [aid])
note('close_action while open (refuse)', st(r))
// 5. non-opener cannot close inquiry; opener can
r = await send(stranger, address, 'close_inquiry', [inquiry])
note('close_inquiry by stranger (refuse)', st(r))
r = await send(opener, address, 'close_inquiry', [inquiry])
note('close_inquiry by opener', st(r))
// 6. non-funder cannot close action; funder can and gets the remainder
r = await send(stranger, address, 'close_action', [aid])
note('close_action by stranger (refuse)', st(r))
r = await send(funderC, address, 'close_action', [aid])
note('close_action by funder', st(r))
const fin = JSON.parse(await read(opener, address, 'get_action', [aid]))
note('final action', { status: fin.status, escrow: fin.escrow, paid: fin.paid })

let b1
for (let i = 0; i < 40; i++) {
  await new Promise((res) => setTimeout(res, 15000))
  b1 = { ben: await bal(beneficiary), fun: await bal(accs[FI].address) }
  if (b1.fun - b0.fun === V - V * BigInt(expectPct) / 100n) break
}
note('beneficiary gained', String(b1.ben - b0.ben))
note('funder balance change', String(b1.fun - b0.fun))
note('expected: beneficiary', String(V * BigInt(expectPct) / 100n))
note('expected: refund', String(V - (V * BigInt(expectPct) / 100n)))
writeFileSync(join(ROOT, 'scripts', 'escrow-result.json'), JSON.stringify({ aid, inquiry, address, log }, null, 2))

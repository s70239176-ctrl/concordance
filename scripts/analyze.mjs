// Decode every validator's own record from a convene tx and show where they disagree.
//   node scripts/analyze.mjs <txhash> [<txhash> ...]     (default: all hashes in results.json)
import { readFileSync, existsSync } from 'fs'
import { join } from 'path'
import { accounts, client, ROOT } from './common.mjs'

const c = client(accounts()[0])
let hashes = process.argv.slice(2)
const RES = join(ROOT, 'scripts', 'results.json')
if (!hashes.length && existsSync(RES)) hashes = JSON.parse(readFileSync(RES, 'utf8')).map((r) => r.hash)

function decode(x) {
  const b64 = typeof x === "string" ? x : x?.raw
  if (!b64) return null
  const s = Buffer.from(b64, 'base64').toString('utf8')
  const i = s.indexOf('{')
  if (i < 0) return { raw: s.slice(0, 200) }
  try { return JSON.parse(s.slice(i)) } catch { return { raw: s.slice(i, i + 200) } }
}
const short = (rec) => rec?.props ? rec.props.map((p) => `${p.status[0]}${p.divergence}${p.lean[0]}`).join(' ') : JSON.stringify(rec).slice(0, 120)

for (const h of hashes) {
  const tx = await c.getTransaction({ hash: h })
  const cd = tx.consensus_data ?? {}
  console.log(`\n=== ${h.slice(0, 12)} status=${tx.statusName} result=${tx.result_name} rounds=${tx.num_of_rounds}`)
  const rows = []
  for (const lr of cd.leader_receipt ?? []) rows.push({ role: 'leader', model: lr.node_config?.primary_model?.model, rec: decode(lr.result) })
  for (const v of cd.validators ?? []) rows.push({ role: `val:${v.vote}`, model: v.node_config?.primary_model?.model, rec: decode(v.result) })
  for (const r of rows) console.log(`${r.role.padEnd(14)} ${String(r.model).padEnd(34)} amb=${r.rec?.ambiguity ?? '-'}  ${short(r.rec)}`)
}

// Save every leader record (one per consensus round, i.e. per model) from convene txs to scripts/records.json
import { readFileSync, writeFileSync, existsSync } from 'fs'
import { join } from 'path'
import { accounts, client, ROOT } from './common.mjs'
const c = client(accounts()[0])
const hashes = process.argv.length > 2 ? process.argv.slice(2) : JSON.parse(readFileSync(join(ROOT, 'scripts', 'results.json'), 'utf8')).map((r) => r.hash)
const dec = (x) => { const b = typeof x === 'string' ? x : x?.raw; if (!b) return null; const s = Buffer.from(b, 'base64').toString('utf8'); try { return JSON.parse(s.slice(s.indexOf('{'))) } catch { return null } }
const OUT = join(ROOT, 'scripts', 'records.json')
const all = existsSync(OUT) ? JSON.parse(readFileSync(OUT, 'utf8')) : []
for (const h of hashes) {
  const tx = await c.getTransaction({ hash: h })
  tx.consensus_history.consensus_results.forEach((cr, i) => {
    const lr = Array.isArray(cr.leader_result) ? cr.leader_result[0] : cr.leader_result
    const rec = dec(lr?.result)
    if (rec?.props) all.push({ tx: h, round: i + 1, model: lr.node_config?.primary_model?.model, votes: (cr.validator_results ?? []).map((v) => v.vote), rec })
  })
}
const seen = new Set(); const uniq = all.filter((r) => { const k = r.tx + r.round; if (seen.has(k)) return false; seen.add(k); return true })
writeFileSync(OUT, JSON.stringify(uniq, null, 1)); console.log('records:', uniq.length)

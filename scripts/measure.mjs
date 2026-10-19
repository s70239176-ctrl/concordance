// Run the demo scenario on studionet: N inquiries x 2 rounds. Records, per convene, the transaction status,
// how many consensus rounds it took, validator votes, and the derived record, to scripts/results.json.
//   node scripts/measure.mjs 3
import { createRequire } from 'module'
import { writeFileSync, existsSync, readFileSync } from 'fs'
import { join } from 'path'
import { accounts, client, loadState, send, read, ROOT } from './common.mjs'

const S = createRequire(import.meta.url)(join(ROOT, 'web', 'scenarios.js'))
const N = parseInt(process.argv[2] || '1', 10)
const { address } = loadState()
const accs = accounts(5) // [0] opener, [1..4] = Kestrel, Halden, Meridian, Corvane
const cl = accs.map(client)
const OUT = join(ROOT, 'scripts', 'results.json')
const results = existsSync(OUT) ? JSON.parse(readFileSync(OUT, 'utf8')) : []
const j = (v) => JSON.stringify(v, (k, x) => (typeof x === 'bigint' ? String(x) : x))

function votes(tx) {
  const cd = tx.consensus_data ?? {}
  const vs = cd.validators ?? []
  const names = vs.map((v) => v?.vote ?? v?.result?.vote ?? '?')
  return { leaderVote: cd.leader_receipt?.[0]?.vote ?? null, validatorVotes: names, n: vs.length }
}

async function convene(id, label) {
  const t0 = Date.now()
  const { hash, tx } = await send(cl[0], address, 'convene', [id])
  const out = { inquiry: id, label, hash, status: tx?.statusName, result: tx?.result_name, rounds: tx?.num_of_rounds, ms: Date.now() - t0, ...votes(tx ?? {}) }
  try { out.ambiguity = JSON.parse(await read(cl[0], address, 'get_record', [id]) || 'null')?.ambiguity } catch {}
  console.log(j(out))
  return { out, tx }
}

for (let run = 0; run < N; run++) {
  const id = `halden-${Date.now().toString(36)}`
  console.log('--- inquiry', id)
  await send(cl[0], address, 'open_inquiry', [id, S.question, S.props.map((p) => p.text), S.props.map((p) => p.weight)])
  for (let p = 0; p < 3; p++) {
    const pt = S.parties[p]
    await send(cl[p + 1], address, 'submit_account', [id, pt.name, pt.account, pt.excerpt, []])
  }
  const r1 = await convene(id, 'round1')
  results.push(r1.out)
  if (run === 0) writeFileSync(join(ROOT, 'scripts', 'sample-consensus.json'), j(r1.tx.consensus_data ?? {}).slice(0, 60000))
  const pt = S.parties[3]
  await send(cl[4], address, 'submit_account', [id, pt.name, pt.account, pt.excerpt, []])
  const r2 = await convene(id, 'round2')
  results.push(r2.out)
  writeFileSync(OUT, JSON.stringify(results, null, 2))
}

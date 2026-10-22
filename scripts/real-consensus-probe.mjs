// Real validators, real disagreement. contracts/test_only/concordance_probe.py is the v5 contract plus ONE test method,
// ratify_forced, whose LEADER is malicious (it proposes a lean/clarity we dictate instead of its own reading). The
// validators run the real, unchanged validator logic on their own genuine LLM readings. This shows what real consensus
// does when a leader's proposal differs from what validators independently derive, and that nothing can be paid then.
//   node scripts/deploy.mjs test_only/concordance_probe.py probe ; node scripts/real-consensus-probe.mjs
import { writeFileSync } from 'fs'
import { join } from 'path'
import { createAccount, generatePrivateKey } from 'genlayer-js'
import { accounts, client, loadState, send, read, ROOT } from './common.mjs'

const { probe: oracle } = loadState()
const accs = accounts(8)
const [opener, a, b, funder, caller] = [0, 1, 2, 5, 6].map((i) => client(accs[i]))
const j = JSON.parse
const log = []
const say = (...x) => { console.log(...x); log.push(x.join(' ')) }
const id = 'probe-' + Date.now().toString(36)
const ben = createAccount(generatePrivateKey()).address
const V = 1_000_000n
const PROPS = ['The reefer supply air stayed between 2 and 4 C for the whole voyage.', 'The cargo was loaded at the contract temperature.', 'The vessel sailed on a Tuesday.', 'The reefer unit never failed during the voyage.']

// what the validators actually did, from the transaction's consensus record
function consensus(r) {
  const t = r.tx
  const rounds = (t?.consensus_history?.consensus_results ?? []).map((cr, k) => {
    const lr = Array.isArray(cr.leader_result) ? cr.leader_result[0] : cr.leader_result
    return {
      round: k + 1,
      leader: String(lr?.node_config?.primary_model?.model ?? lr?.node_config?.model ?? '').replace('policy:prd-', ''),
      votes: (cr.validator_results ?? []).map((v) => ({ model: String(v?.node_config?.primary_model?.model ?? v?.node_config?.model ?? '').replace('policy:prd-', ''), vote: v.vote })),
    }
  })
  return { status: t?.statusName, result: t?.result_name, num_rounds: Number(t?.num_of_rounds), rounds }
}
const show = (name, r) => { const c = consensus(r); say(name, '->', c.status, c.result, 'rounds=' + c.num_rounds); c.rounds.forEach((x) => say(`   round ${x.round} leader ${x.leader || '?'} | votes: ${x.votes.map((v) => `${v.vote}`).join(' ')}`)); return c }
const sig = async (i) => j((await read(opener, oracle, 'get_signal', [id, i, ''])) || 'null')
const out = { oracle, inquiry: id, steps: [] }

say('probe contract', oracle, 'inquiry', id)
await send(opener, oracle, 'open_inquiry', [id, 'Was the refrigerated cargo kept within its contract temperature band?', PROPS, [5, 5, 5, 5]])
await send(a, oracle, 'submit_account', [id, 'Carrier', 'The reefer unit never failed. Supply-air telemetry stayed 2.1-2.9 C all voyage and the cargo was loaded at 3.0 C at the contract temperature.', 'Telemetry export 2.1-2.9 C; loading probe 3.0 C at 09:10 on the 1st.', []])
await send(b, oracle, 'submit_account', [id, 'Shipper', 'We do not dispute the telemetry: the supply air stayed in the band, the unit did not fail and loading was at the contract temperature.', 'We reviewed the same telemetry export, 2.1-2.9 C, and the loading probe at 3.0 C.', []])
const cv = await send(opener, oracle, 'convene', [id])
show('convene (real consensus)', cv)
const rec = j(await read(opener, oracle, 'get_record', [id]))
say('leader record:', rec.props.map((p) => `${p.index + 1}:${p.status}/${p.lean}/${p.clarity}`).join(' '), 'ambiguity', rec.ambiguity)
out.record = rec.props.map((p) => ({ status: p.status, lean: p.lean, clarity: p.clarity }))
const agreed = rec.props.find((p) => p.status === 'AGREED_TRUE')
const unsup = rec.props.find((p) => p.status === 'UNSUPPORTED') || rec.props.find((p) => p.lean === 'NONE')
if (!agreed || !unsup) { say('scenario did not produce an agreed and an unsupported proposition; rerun'); process.exit(1) }
const AI = agreed.index, UI = unsup.index
say(`agreed TRUE proposition: ${AI + 1}; unsupported/no-lean proposition: ${UI + 1}`)

// fund an escrow that needs both to be TRUE
await send(funder, oracle, 'open_action', ['act-' + id, id, ben, [AI, UI], ['TRUE', 'TRUE'], 0, ['', '']], V)
const execStatus = async (label) => {
  const r = await send(caller, oracle, 'execute_action', ['act-' + id])
  const act = j(await read(opener, oracle, 'get_action', ['act-' + id]))
  const exec = r.tx?.consensus_data?.leader_receipt?.[0]?.execution_result
  say(`   execute_action ${label}: exec=${exec} paid=${act.paid}`)
  return { exec, paid: String(act.paid) }
}
const step = (name, c, extra = {}) => out.steps.push({ name, ...c, ...extra })

// 1. malicious leader claims the OPPOSITE lean on the agreed proposition
let r = await send(caller, oracle, 'ratify_forced', [id, AI, 'FALSE', 100])
let c = show(`1. lying leader: proposition ${AI + 1} is FALSE at clarity 100 (validators read TRUE)`, r)
let s = await sig(AI); say('   signal:', JSON.stringify(s))
step('opposite lean', c, { signal: s.status })

// 2. malicious leader invents support for the proposition validators cannot support
r = await send(caller, oracle, 'ratify_forced', [id, UI, 'TRUE', 100])
c = show(`2. lying leader: proposition ${UI + 1} is TRUE at clarity 100 (validators see no support)`, r)
s = await sig(UI); say('   signal:', JSON.stringify(s))
step('invented support', c, { signal: s.status })
const e1 = await execStatus('after the two lies')
out.executeAfterLies = e1

// 3. control: an honest leader proposal that matches what validators derive
r = await send(caller, oracle, 'ratify_forced', [id, AI, 'TRUE', 100])
c = show(`3. control, honest leader: proposition ${AI + 1} is TRUE at clarity 100`, r)
s = await sig(AI); say('   signal:', JSON.stringify(s))
step('honest control', c, { signal: s.status })
const e2 = await execStatus('after the honest ratification')
out.executeAfterHonest = e2

out.log = log
writeFileSync(join(ROOT, 'scripts', 'real-consensus-probe.json'), JSON.stringify(out, null, 2))
say('done')

// node scripts/deploy.mjs                                  -> contracts/concordance.py, saved as state.address
// node scripts/deploy.mjs concordance_gate.py gate <addr>  -> a contract with constructor args, saved as state.gate
import { readFileSync } from 'fs'
import { join } from 'path'
import { accounts, client, ROOT, saveState, waitTx } from './common.mjs'

const [file = 'concordance.py', key = 'address', ...args] = process.argv.slice(2)
const [deployer] = accounts()
const c = client(deployer)
console.log('throwaway deployer:', deployer.address, '| contract:', file)
const code = readFileSync(join(ROOT, 'contracts', file), 'utf8')
const hash = await c.deployContract({ code, args, leaderOnly: false })
console.log('deploy tx:', hash)
const tx = await waitTx(c, hash)
console.log('status:', tx?.statusName, tx?.result_name ?? '')
const address = tx?.recipient ?? tx?.to ?? tx?.contract_address ?? tx?.contractAddress
if (tx?.statusName !== 'FINALIZED' && tx?.statusName !== 'ACCEPTED') {
  console.log(JSON.stringify(tx, (k, v) => (typeof v === 'bigint' ? String(v) : v), 2).slice(0, 3000))
  process.exit(1)
}
console.log('CONTRACT:', address)
saveState({ [key]: address, [key + 'DeployTx']: hash })

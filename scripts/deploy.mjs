import { readFileSync } from 'fs'
import { join } from 'path'
import { accounts, client, ROOT, saveState, waitTx } from './common.mjs'

const [deployer] = accounts()
const c = client(deployer)
console.log('throwaway deployer:', deployer.address)
const code = readFileSync(join(ROOT, 'contracts', 'concordance.py'), 'utf8')
const hash = await c.deployContract({ code, args: [], leaderOnly: false })
console.log('deploy tx:', hash)
const tx = await waitTx(c, hash)
console.log('status:', tx?.statusName)
const address = tx?.recipient ?? tx?.to ?? tx?.contract_address ?? tx?.contractAddress
console.log('keys:', Object.keys(tx ?? {}).join(','))
if (tx?.statusName !== 'FINALIZED' && tx?.statusName !== 'ACCEPTED') {
  console.log(JSON.stringify(tx, (k, v) => (typeof v === 'bigint' ? String(v) : v), 2).slice(0, 4000))
  process.exit(1)
}
console.log('CONTRACT:', address)
saveState({ address, deployTx: hash })

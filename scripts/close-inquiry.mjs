import { accounts, client, loadState, send } from './common.mjs'
const { v4 } = loadState(); const r = await send(client(accounts()[0]), v4, 'close_inquiry', [process.argv[2]])
console.log('close_inquiry', process.argv[2], r.tx?.statusName, r.tx?.consensus_data?.leader_receipt?.[0]?.execution_result)

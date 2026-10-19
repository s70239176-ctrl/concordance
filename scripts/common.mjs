// Shared helpers. Accounts are THROWAWAY testnet keys generated locally (never a personal wallet), kept in
// scripts/.accounts.json (gitignored) so a run can be resumed. Studionet holds no real value.
import { createClient, createAccount, generatePrivateKey } from 'genlayer-js'
import { studionet } from 'genlayer-js/chains'
import { readFileSync, writeFileSync, existsSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const here = dirname(fileURLToPath(import.meta.url))
export const ROOT = join(here, '..')
const ACCOUNTS = join(here, '.accounts.json')
const STATE = join(here, '.state.json')

export function accounts(n = 5) {
  let keys = existsSync(ACCOUNTS) ? JSON.parse(readFileSync(ACCOUNTS, 'utf8')) : []
  while (keys.length < n) keys.push(generatePrivateKey())
  writeFileSync(ACCOUNTS, JSON.stringify(keys))
  return keys.map((k) => createAccount(k))
}
export const client = (account) => createClient({ chain: studionet, account })
export const loadState = () => (existsSync(STATE) ? JSON.parse(readFileSync(STATE, 'utf8')) : {})
export const saveState = (s) => writeFileSync(STATE, JSON.stringify({ ...loadState(), ...s }, null, 2))
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const DONE = ['FINALIZED', 'ACCEPTED', 'UNDETERMINED', 'CANCELED', 'LEADER_TIMEOUT', 'VALIDATORS_TIMEOUT']
export async function waitTx(c, hash, tries = 200) {
  let tx
  for (let i = 0; i < tries; i++) {
    await sleep(3000)
    try { tx = await c.getTransaction({ hash }) } catch { continue }
    if (DONE.includes(tx?.statusName)) return tx
  }
  return tx
}
export async function send(c, address, fn, args = [], value = 0n) {
  let hash, err
  for (let a = 0; a < 5 && !hash; a++) {
    try { hash = await c.writeContract({ address, functionName: fn, args, value }) } catch (e) { err = e; await sleep(5000 * (a + 1)) }
  }
  if (!hash) throw err
  const tx = await waitTx(c, hash)
  return { hash, tx }
}
export async function read(c, address, fn, args = []) {
  for (let a = 0; a < 5; a++) {
    try { return await c.readContract({ address, functionName: fn, args }) } catch (e) { if (a === 4) throw e; await sleep(4000 * (a + 1)) }
  }
}

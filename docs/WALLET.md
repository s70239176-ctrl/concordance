# Wallet path: what was tested, what was fixed, how to test it with real MetaMask

## What I could and could not test
I cannot operate a real MetaMask from this environment. I tested the app's wallet path against a **mock EIP-1193
wallet** (injected as `window.ethereum`) that signs legacy transactions with a local key and sends them to Studio
exactly as MetaMask would (`eth_sendTransaction` -> sign -> `eth_sendRawTransaction`). It also refuses to send unless
it is on chain 61999, and starts on Ethereum mainnet to force the network-switch logic.

| Check | Result |
|---|---|
| Connect: `eth_requestAccounts`, wrong chain detected, `wallet_switchEthereumChain` refused with 4902, `wallet_addEthereumChain` with Studio params, switch again, verify | works |
| Write through the wallet (open inquiry, submit account) tracked to `ACCEPTED / MAJORITY_AGREE` | works (9 s each) |
| Wallet moved to another chain mid-session: app switches it back before sending; nothing sent on the wrong chain | works |
| User rejects the signature (code 4001): friendly message, UI recovers | works (after fixing noisy error text) |
| Real MetaMask UI, popups, snap prompts, hardware wallets, mobile wallets | **not tested** |

## Bugs found by reading the SDK source, and fixed
1. **`client.connect("studionet")` requires the GenLayer MetaMask Snap** (`wallet_getSnaps` / `wallet_requestSnaps`)
   and throws without it. The app used it, so connecting would have failed for any wallet without the snap.
   Fixed: the app does its own add/switch of the Studio chain; the snap is not needed to send transactions.
2. **The SDK skips its wrong-chain check on Studio** (`if (chainConfig.isStudio) return`), so a wallet sitting on
   another network would have sent the transaction there. Fixed: the app verifies `eth_chainId` and switches
   before every write.
3. **`fundAccount` is localnet-only in the SDK**, but Studio's RPC does expose `sim_fundAccount`. Added a
   "Get test GEN" button that calls it (needed for escrow value, not for gas: Studio's `eth_gasPrice` is 0).
4. Wallet events: `accountsChanged` and `chainChanged` are handled; rejection and insufficient-funds errors
   get plain-language messages.

## Manual checklist with real MetaMask (about 5 minutes)
1. Serve the app (`cd web && python -m http.server 8791`) and open `http://localhost:8791/app.html`.
2. Click **Connect wallet**. Expect: connect popup, then "Add network" (GenLayer Studio, chain 61999, RPC
   `https://studio.genlayer.com/api`, symbol GEN), then a switch-network popup. No snap popup.
3. Click **+ New inquiry**, fill it in, **Open inquiry**. Expect a signature popup, then the banner
   "Open inquiry done (ACCEPTED ...)" within ~10 s and the inquiry page opening.
4. **Submit account**, then from a second wallet account (or another browser profile) submit a second account.
5. **Convene validators** (30-120 s). Expect the agreement record to appear.
6. Optional: **Get test GEN**, then **Lock escrow** with a small amount.
7. Switch MetaMask to another network and click any action: the app should pull you back to Studio first.
8. Reject a signature popup: you should see "You rejected the request in your wallet. Nothing was sent."

## Things to watch for in real MetaMask (unverified)
- MetaMask may warn that chain 61999 / the RPC is not a known network. Expected for a custom test network.
- A zero-balance account may still be blocked by the wallet UI when sending a non-zero `value` (escrow);
  use "Get test GEN" first.
- If a popup says the contract call "will probably fail", read the banner after sending: contract-level
  rejections show as "the contract rejected this call".

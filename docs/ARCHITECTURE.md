# ARCHITECTURE.md — wdrop

How wdrop is put together, what lives where, and where trust sits. Diagrams are exported
images (light + dark, source HTML in `diagrams/`) so they render on GitHub in either theme.

## 1. System overview

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="diagrams/system-overview-dark.png">
  <img alt="wdrop system overview: browser app and wallet, a same-origin RPC proxy, Arc RPC upstreams, and the WDrop escrow holding USDC on Arc mainnet" src="diagrams/system-overview.png">
</picture>

Key property: **there is no application backend** — no database, no accounts, no server-side
state. The Next.js app is static UI plus one stateless `/api/rpc` relay that keeps the paid RPC
token server-side. Secrets and memos never leave the browser (the secret travels in the URL
fragment `#k=`, which browsers never send anywhere). The contract is the only shared state.

## 2. Drop lifecycle (contract state machine)

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="diagrams/drop-lifecycle-dark.png">
  <img alt="Drop lifecycle: Locked moves to exactly one of Claimed, Reclaimed, or Swept — every exit is one-way" src="diagrams/drop-lifecycle.png">
</picture>

Every transition emits an event (`Created / Claimed / Reclaimed / Swept / Resolved`) and each
`id` is single-use — once it leaves `Locked` it can never move again (replay-safe by construction).

## 3. Happy path: lock → share → claim

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="diagrams/claim-sequence-dark.png">
  <img alt="Claim flow: sender locks USDC and shares a link, receiver opens it, reads the amount onchain, and claims it in one signature — USDC arrives in under a second" src="diagrams/claim-sequence.png">
</picture>

Notes:
- The claim page displays the amount from chain **before** connect — a mismatched
  ("$100, actually $1") link is visible without spending gas. Deterministic anti-scam.
- `simulateContract` runs before every write so failures surface as friendly copy
  (wrong secret, expired, already closed, no gas) instead of raw reverts.
- Claiming is an onchain action: the receiver needs ~$0.10 USDC on Arc for gas.
  The UI states this up front (see `app/claim/[id]/page.tsx`).

## 4. Undo + expiry paths

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="diagrams/undo-expiry-dark.png">
  <img alt="Two alternative paths for returning a locked drop to its sender: sender reclaim before claim, or anyone sweeping after expiry" src="diagrams/undo-expiry.png">
</picture>

## 5. Trust boundaries

| Zone | Holds | Trust assumption |
|---|---|---|
| WDrop contract (Arc) | Locked USDC, claim hashes, expiries | Code only. Owner can't move funds (only ≤1% fee on claim). No upgradeability, no selfdestruct |
| Sender browser (localStorage) | Claim secret backup, private memo | Same-origin. Lost browser = link still works if URL was shared; unshared + lost = funds locked until expiry, then sweepable |
| Claim link URL | `id` + secret in `#k=` fragment | Bearer model: anyone holding the full link can claim. Fragments never hit servers or logs |
| `/api/rpc` relay (Vercel) | Paid RPC token (server-side env) | Stateless forwarder: JSON-RPC in, JSON-RPC out, 16 KB body cap. Token never reaches the browser bundle |
| Wallet (MetaMask / WC) | Keys, signing | Standard EOA trust. Exact-amount approvals only, never unlimited |

Known limits (disclosed in `SECURITY.md`, not hidden): bearer-link claim race in the public
mempool (negligible for $1–10 drops on PoA sub-second blocks; roadmap = recipient-bound
commit-reveal), no onchain amount privacy (Arc view-keys are roadmap), receiver needs gas.

## 6. Receipts (proof, not analytics)

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="diagrams/receipts-flow-dark.png">
  <img alt="Data flow: Arc event logs parsed into a wallet-scoped receipts table and exported as CSV, with every row deep-linking to the Arc explorer" src="diagrams/receipts-flow.png">
</picture>

Receipts query only the connected wallet's own actions. Per-drop claim status (including claims
by others) lives in My drops. Every row deep-links to `explorer.arc.io/tx/<hash>`.

## 7. Code map

```
wdrop/
├── contracts/                  Foundry
│   ├── src/WDrop.sol            the whole trust surface (~240 lines, zero imports)
│   ├── test/WDrop.t.sol         10 tests: claim, wrong secret, double-claim,
│   │                            reclaim ACL, expiry + sweep, TTL bounds, arbiter, replay
│   └── script/Deploy.s.sol      mainnet deploy (chain 5042)
└── web/                        Next.js 16 + TS + viem/wagmi
    ├── app/page.tsx             home: pitch + CreateDrop + MyDrops + Receipts
    ├── app/claim/[id]/page.tsx  claim: onchain amount first, then connect, then claim
    ├── app/api/rpc/route.ts     stateless same-origin JSON-RPC relay (token server-side)
    ├── components/Providers.tsx wagmi config: injected + WalletConnect, /api/rpc transport
    ├── components/CreateDrop.tsx   approve-exact + simulate + create + auto-copy link
    ├── components/MyDrops.tsx      sender's drops + reclaim / sweep buttons
    ├── components/Receipts.tsx     own-action event log + CSV export
    ├── components/NetworkBadge.tsx wallet-truth chain readout (bottom-left)
    └── lib/
        ├── arc.ts               chain 5042, USDC 0x3600…0000, contract addr, explorer links
        ├── abi.ts               contract ABI + named single-event ABIs (no magic indices)
        ├── logs.ts              chunked, cached, bisecting getLogs scanner
        ├── walletGuard.ts       wallet-truth chain id + ensureWalletChain before writes
        └── wdrop.ts             secret gen, keccak link builder, USDC formatting, CSV
```

## 8. Deployment topology

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="diagrams/deployment-topology-dark.png">
  <img alt="Deployment topology: GitHub pushes to Vercel, production env vars feed the deployment, users connect over HTTPS, and the server-side RPC proxy reaches QuickNode and the public fallback on Arc" src="diagrams/deployment-topology.png">
</picture>

Build is `tsc` + `eslint` + static prerender; chain reads happen at runtime through the
same-origin `/api/rpc` relay, so prerender never touches RPC.

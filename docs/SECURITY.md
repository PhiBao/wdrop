# SECURITY.md — wdrop

Security is build quality, not the product category. wdrop holds real USDC, so the escrow is
minimal, self-contained (one file, no imports), and boring on purpose.

## Contract (`contracts/src/WDrop.sol`)

- **No external imports.** `IERC20` + `ReentrancyGuard` are vendored inline so the repo builds
  offline and the audit surface is one file (~230 lines).
- **Reentrancy:** `nonReentrant` on all state-changing functions; state set to non-Locked
  *before* external calls (checks-effects-interactions).
- **Safe transfers:** low-level `call` with return-data tolerance (handles non-standard ERC-20s
  like missing boolean returns); any failure reverts with `TransferFailed`.
- **Replay protection:** `nextId` refund-ids are single-use; every mutating path requires
  `status == Locked`, so claim → reclaim, double-claim, and post-expiry claim all revert.
- **Expiry logic:** `claim` reverts after expiry (`NotYetExpired` → use reclaim/sweep path);
  `sweepExpired` reverts before expiry. TTL clamped `[5 min, 30 d]`; zero/oversize amounts rejected;
  per-drop cap 10,000 USDC.
- **Arbiter:** optional per-drop dispute hook. `resolve` requires a non-zero arbiter set at creation
  and can only fire while Locked. No global admin can touch funds.
- **Fees:** default 0 bps; owner can set at most 100 bps to an explicit recipient. No upgradeability,
  no delegatecall, no selfdestruct.
- **Tests:** 10 Foundry tests cover create/claim, wrong secret, double-claim, reclaim ACL,
  expiry claim-revert + permissionless sweep, pre-expiry sweep revert, TTL bounds, arbiter resolve,
  id sequencing + single-use. Run: `cd contracts && forge test`.

## Frontend (`web/`)

- **Claim secret hygiene:** secret is random 256-bit, lives only in the URL **fragment** (`#k=`),
  which browsers never send to servers. It is also mirrored to the sender's `localStorage` as a
  backup (with memo). No backend, no database, nothing to leak.
- **Approvals:** exact-amount `approve` only when current allowance is insufficient; never unlimited.
- **Simulation first:** every write runs `simulateContract` before broadcast for friendly,
  specific errors (rejected, insufficient USDC+gas, expired, already closed).
- **Network guard:** write paths require Arc mainnet (5042); wrong-network users get a 1-click switch.
- **PII:** memos stay in the sender's browser. Onchain: only amount, expiry, hash, addresses.
- **XSS/links:** claim links are same-origin; explorer links are hardcoded to `explorer.arc.io`
  / testnet scan host (never from user input).
- **Supply chain:** pinned `pnpm-lock.yaml`; `pnpm audit` before release; RPC URL is the only
  network input and defaults to Circle's documented endpoint.

## Operational

- Deployer key used once from an offline/OS-keychain env, never committed (`.env.local` git-ignored).
- Demo caps ($1–$10) + `MAX_AMOUNT` bound blast radius during judging.
- Denomination discipline: USDC 6 decimals in UI/contract; native 18-decimal gas accounting never mixed.
- Known limits (honest, not hidden): link bearer-model — anyone holding the full link can claim
  (documented in UI); no onchain privacy (amounts visible; view-keys are an Arc roadmap item);
  spam drops cost the creator gas (self-limiting); frontend RPC is a trust point (fallback RPC documented).
- **Claim-race disclosure:** the claim secret is revealed in the claim transaction's calldata, so a
  party watching the mempool could theoretically front-run a claim with the same secret (first tx to
  land wins; the payout goes to `msg.sender`). For $1–10 drops on Arc's permissioned, sub-second
  blocks this is practically negligible, but it is inherent to bearer claim-links. Roadmap fix:
  recipient-bound commit-reveal (commit `keccak(secret, recipient)` at creation or claim in two steps).
- **Receiver gas:** claiming is an onchain action, so the claimer needs a small USDC balance on Arc
  for gas. The claim page states this up front instead of failing cryptically.

## Pre-launch checklist

- [ ] `forge test` 10/10
- [ ] `pnpm build` (tsc + eslint) green
- [ ] Funded rehearsal on mainnet ($2 create → claim → reclaim) with explorer links saved
- [ ] `NEXT_PUBLIC_DEPLOY_BLOCK` set to the real deploy block
- [ ] Backup demo recording stored
- [ ] `SUBMISSION.md` hashes verified on `explorer.arc.io`

# SUBMISSION.md — Arc Microgrants packet for wdrop

## One-liner

wdrop: send USDC on Arc as a claim link with expiry and one-click reclaim — an undo button for
irreversible money.

## Links

- Live deployment (Arc mainnet): `https://wdrop.vercel.app`
- Public repo: `https://github.com/PhiBao/wdrop`
- Builder profile: `https://github.com/PhiBao` (+ X/Farcaster TBD)
- Demo video (≤90s): TBD — record per `docs/DEMO.md`

## What it uses Arc for

- Arc mainnet (5042) settlement for all value movement (real USDC, not testnet).
- USDC as gas → $1–$2 protected drops stay economical.
- Sub-second finality → claim feels like opening a link.
- Explorer-verifiable proof for every state transition.

## Contracts (Arc mainnet) — LIVE

- WDrop: `0xEfFd3f2B0a5719cD7E7bd885738c9cEF159660F7` (deployed block `21863551`, fee 0 bps)
- USDC: `0x3600000000000000000000000000000000000000`

## Proof hashes (explorer.arc.io) — real mainnet txs

- Deploy: `0x19acfc955dc81db77454207bb64c876dab348a5e7719419bad6f4dece3fe2fd0` (block 21863551)
- Approve $1: `0x0ca4b27f2d5e0343721fb08b6f8c373d6f3fa6afcb5a40424e65875f3ea25de9`
- `Created` (drop #0, $1, 5-min TTL): `0x443df9004b5d08aac557941a39fb7c3364742da828d0e99ac4a796342878aaf6`
- `Reclaimed` (drop #0, undo): `0xa782c93f91c2baf9017445363ead35a5f97a129c464c51d8bacf8505150361a7`
- `Created` (drop #1, $1, 24h TTL): `0x3341d743a5f69b177f526663f3b1cab9bace1a9f5ce98ace602b2c4eeec921b4`
- **`Claimed` (drop #1, second wallet `0xEb1Fd37F7AcE62f94A836F0D8c37c21aD58eade1`): `0x8bc77e8f636feb998ee67c526db92b073e6f2bdb747227dbef0e0b59c9a4dbca`**
- Receipt CSV: downloadable in-app (Receipts → CSV)

Verify: `https://explorer.arc.io/tx/<hash>` and `https://explorer.arc.io/address/0xEfFd3f2B0a5719cD7E7bd885738c9cEF159660F7`

## What we look for (self-score, honest)

- Relevance to Arc: core — settlement + USDC gas + finality + explorer proof.
- Technical credibility: 1 minimal escrow contract, 10 Foundry tests, simulated writes, exact approvals.
- Quality: 3-screen polished flow (create / claim / receipts), empty + loading + error states, mobile-usable.
- Worth taking further: merchant “accept protected” button → spending-cap vaults (kids + agents) →
  dispute queue → EURC corridors. Ladder to the Circle Grant Program milestones.

## Eligibility checklist

- [x] Live on Arc mainnet (contract deployed + smoke-tested; web URL pending host deploy)
- [ ] Public repo with README + DEPLOY/DEMO/SECURITY docs ← push + set URL above
- [x] Short description + Arc usage (above)
- [ ] Public builder profile linked
- [x] Original work, no prior Circle/Arc funding
- [ ] Wallet ready to receive USDC on Arc

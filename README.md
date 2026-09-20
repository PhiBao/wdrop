# wdrop — send USDC on Arc with an undo button

Crypto payments are irreversible: one typo, wrong network, or fake screenshot and the money is gone.
**wdrop** locks USDC behind a claim link on **Arc mainnet** instead of pushing it to an address.

- **Lock** an amount + expiry → get a shareable link
- **Claim** in one click (receiver needs no signup to view; USDC lands in <1s, gas in USDC)
- **Undo**: sender reclaims anytime before claim; anyone can sweep expired drops back to the sender
- **Prove it**: every lock / claim / reclaim / sweep is an onchain event + downloadable CSV receipt

Built for the [Arc Microgrants](https://dorahacks.io/hackathon/arc-microgrants/detail) (Circle).

## What wdrop uses Arc for

- **Arc mainnet (chain 5042)** as the settlement layer — all value movement is real USDC on Arc
- **USDC as gas** — micro-drops ($1–$2) stay economical; no volatile gas token
- **Sub-second deterministic finality** — claim UX feels like a link, not a wire
- Explorer-verifiable at `https://explorer.arc.io`

## Repo layout

```
wdrop/
  contracts/   Foundry project — WDrop.sol escrow + 10 tests + deploy script
  web/         Next.js 16 + TypeScript + viem/wagmi — create / claim / reclaim / receipts
  docs/        DEPLOY.md, DEMO.md, SECURITY.md, SUBMISSION.md
```

## Quickstart

### 1. Contracts

```bash
cd contracts
forge build
forge test
```

### 2. Deploy to Arc mainnet

You need a wallet with a little USDC on Arc (bridge via canonical CCTP — the same USDC pays gas).

```bash
export ARC_RPC_URL=https://rpc.mainnet.arc.io
export PRIVATE_KEY=0x...          # deployer, handle with care
export FEE_RECIPIENT=0x...        # optional, defaults to deployer
forge script script/Deploy.s.sol --rpc-url $ARC_RPC_URL --private-key $PRIVATE_KEY --broadcast
```

Record the deployed address + block number.

### 3. Web app

```bash
cd web
cp .env.example .env.local   # fill NEXT_PUBLIC_WDROP_ADDRESS + NEXT_PUBLIC_DEPLOY_BLOCK
pnpm install
pnpm dev                     # http://localhost:3000
```

Deploy anywhere (e.g. Vercel): set the same three env vars, `pnpm build`.

## Demo in 75 seconds

See [`docs/DEMO.md`](docs/DEMO.md). Short version: create a $2 drop (5-min expiry) → claim it on a second
wallet → let a second drop expire → reclaim it. Three explorer hashes = the whole thesis.

## Security

See [`docs/SECURITY.md`](docs/SECURITY.md). Highlights: commit-reveal claim secret (stays in the URL
fragment, never logged), single-use `refund_id` replay map, reentrancy guard, expiry bounds (5 min–30 d),
10k USDC per-drop cap, pre-tx simulation, exact-amount approvals. No custody, no backend keys, no token.

## Status

MVP for Arc Microgrants. Stretch roadmap: spending-cap vaults (kids + AI agents, same primitive),
trip netting, gift skins, arbiter dispute queue, EURC corridors via StableFX, USYC sweep.

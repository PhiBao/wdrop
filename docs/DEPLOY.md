# DEPLOY.md — wdrop to Arc mainnet

## 0. Preconditions

- A deployer EOA with **~$5–10 USDC on Arc mainnet** (covers deployment + demo drops; gas is USDC).
  - Get it by bridging canonical USDC via **CCTP** from Ethereum / Base / Solana. No faucet exists on mainnet.
  - Verify network params only from `https://docs.arc.io`:
    - chain ID `5042` (`0x13b2`), RPC `https://rpc.mainnet.arc.io`, explorer `https://explorer.arc.io`
    - USDC (ERC-20 interface): `0x3600000000000000000000000000000000000000` (6 decimals)
- `forge` installed (repo built with Foundry 1.7.x), `pnpm` + Node 22 for the web app.

## 1. Build + test contracts

```bash
cd wdrop/contracts
forge build
forge test            # expect: 10 passed
```

## 2. Deploy WDrop

```bash
export ARC_RPC_URL=https://rpc.mainnet.arc.io
export PRIVATE_KEY=0xYOUR_DEPLOYER_KEY      # never commit this
export FEE_RECIPIENT=0xYOUR_FEE_ADDRESS     # optional; defaults to deployer

forge script script/Deploy.s.sol \
  --rpc-url $ARC_RPC_URL \
  --private-key $PRIVATE_KEY \
  --broadcast
```

Note from output:
- `WDrop deployed at: 0x…` → `ADDR`
- chain ID should print `5042`

## 3. Record the deploy block (for cheap log queries)

```bash
cast block-number --rpc-url $ARC_RPC_URL     # roughly now; or
cast logs --from-block 0 --to-block latest --rpc-url $ARC_RPC_URL \
  --address $ADDR | head -1
```

Use the deployment block as `NEXT_PUBLIC_DEPLOY_BLOCK` (exact block of the deploy tx is best;
get it from the explorer).

## 4. Sanity-check onchain (read-only, no funds)

```bash
cast call $ADDR "nextId()" --rpc-url $ARC_RPC_URL
cast call $ADDR "feeRecipient()" --rpc-url $ARC_RPC_URL
cast call $ADDR "MAX_AMOUNT()" --rpc-url $ARC_RPC_URL
```

## 5. Funded smoke test (optional, ~$2–3 total)

With **two** wallets (sender + claimer), each holding a little USDC:

1. `approve` $2 to the contract, `create(token, 2_000_000, keccak(secret), 300, 0x0)` → note `id` from `Created`.
2. `claim(id, secret)` from the claimer → balance +$2.
3. Create another with 300s TTL, `reclaim(id)` from sender → balance back.
4. Warp/expiry path is covered by unit tests; on mainnet, use a 5-min TTL and wait, then `sweepExpired(id)`.

## 6. Deploy the web app

```bash
cd ../web
cp .env.example .env.local
```

Set:

```
NEXT_PUBLIC_WDROP_ADDRESS=0x…        # from step 2
NEXT_PUBLIC_ARC_RPC_URL=https://rpc.mainnet.arc.io
NEXT_PUBLIC_DEPLOY_BLOCK=1234567     # from step 3
```

```bash
pnpm install
pnpm build        # must pass: tsc + eslint + static prerender
```

Deploy to Vercel (or any Node host) with the same three env vars. No server secrets, no database.

## 7. Post-deploy checklist

- [ ] Home page shows the contract address in the footer with a working explorer link
- [ ] Wallet connects only to Arc (wrong-network banner + 1-click switch otherwise)
- [ ] Create $2 / 5-min drop → link copied → `Created` on explorer
- [ ] Claim on second wallet → `Claimed` on explorer, balance updated
- [ ] Reclaim path → `Reclaimed` on explorer
- [ ] Receipts load + CSV downloads
- [ ] `docs/SUBMISSION.md` filled with live URL + addresses + hashes

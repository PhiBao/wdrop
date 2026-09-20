# DEMO.md — the 75-second wdrop demo

Principle: three live mainnet hashes beat thirty slides. Rehearse with $2 drops on a 5-minute TTL.
Have a recorded backup video in case the venue network or public RPC hiccups.

## Setup (before the clock starts)

- Wallet A (sender): ~$10 USDC on Arc mainnet.
- Wallet B (claimer): ~$1 USDC on Arc (gas) — can be a fresh MetaMask account.
- Tabs open: wdrop home, Arc explorer, second browser profile (or phone) logged in as Wallet B.
- Fallback RPC ready (Alchemy / QuickNode Arc endpoint) + backup recording.

## Script

| t | Say | Do |
|---|-----|----|
| 0–8s | “I just sent $2 to the wrong person. Watch me undo it.” | Home → amount `2`, expiry **5 min (demo)** → **Lock drop**. |
| 8–20s | “Locked — not pushed. Here&apos;s the proof.” | Point at `Created` hash → open it on `explorer.arc.io`. Copy the claim link. |
| 20–40s | “Anyone with the link claims in one click — under a second, gas in USDC.” | Paste link in Wallet-B profile → **Claim 2.00 USDC** → `Claimed` hash on explorer, balance +$2. |
| 40–60s | “And screenshots can&apos;t do this.” | Back as Wallet A: create a second $1 drop → **Reclaim (undo)** → `Reclaimed` hash. “Sent… un-sent.” |
| 60–75s | “Every step is an event with a receipt.” | Receipts → Load → **CSV**. Hold up the share card: “Protected on Arc — verify.” Repo + contract on screen. |

## The wow moment

The reclaim. Judges expect “sent = gone.” Watching a confirmed send get undone — with its own
explorer hash — is the memory they take into scoring.

## Reliable path (boring on purpose)

- Capped amounts ($1–$2), pre-approved allowance, pre-funded wallets.
- Simulate-then-write: every action runs `simulateContract` first for friendly errors.
- If claim link opens without `#k=…`, the page says exactly what&apos;s wrong (missing secret) instead of failing silently.
- If RPC stalls: switch to fallback RPC; if still stuck, play the backup recording and keep narrating.

## After the demo

Leave the judge with: live URL + repo + contract address + the three tx hashes + the CSV.
That&apos;s the submission packet (`SUBMISSION.md`).

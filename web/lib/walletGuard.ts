"use client";

import { useCallback, useState } from "react";
import { getWalletClient, switchChain } from "wagmi/actions";
import { useConfig } from "wagmi";
import { arcMainnet } from "@/lib/arc";

/**
 * Authoritative network enforcement, ported from the proven pattern in
 * ~/metropolis (`app/lib/walletGuard.ts`).
 *
 * Why this exists: `useChainId()` is React state seeded with the FIRST
 * configured chain (Arc 5042 here). If a wallet is on any other chain and the
 * connector hasn't emitted its change event, `useChainId()` still reports
 * 5042 — so a UI-driven auto-switch sees "already on Arc" and silently does
 * nothing, while transactions would be built against the wrong network.
 *
 * The fix: ask the WALLET for its chain id (`eth_chainId` through the active
 * provider) immediately before doing anything that can spend money, and switch
 * if — and only if — the wallet disagrees. Verify after switching, and refuse
 * to proceed if the wallet still isn't on Arc.
 */
export async function ensureWalletChain(config: ReturnType<typeof useConfig>): Promise<void> {
  const current = await walletChainId(config);
  if (current === arcMainnet.id) return;
  await switchChain(config, { chainId: arcMainnet.id });
  const recheck = await walletChainId(config);
  if (recheck !== arcMainnet.id) {
    throw new Error(
      `Wallet is still on chain ${recheck} — approve “Switch to Arc” in your wallet (Arc may need adding once), then retry.`
    );
  }
}

export async function walletChainId(config: ReturnType<typeof useConfig>): Promise<number> {
  try {
    const wc = await getWalletClient(config);
    return Number(await wc.getChainId());
  } catch {
    return 0; // no active provider
  }
}

/** Hook wrapper: `guard(fn)` guarantees Arc before `fn` can broadcast. */
export function useWalletGuard() {
  const config = useConfig();
  const [checking, setChecking] = useState(false);
  const [guardErr, setGuardErr] = useState<string | null>(null);
  const [liveChain, setLiveChain] = useState<number | null>(null);

  const refresh = useCallback(async () => {
    const id = await walletChainId(config);
    setLiveChain(id);
    return id;
  }, [config]);

  const guard = useCallback(
    async (fn: () => Promise<void> | void) => {
      setChecking(true);
      setGuardErr(null);
      try {
        await ensureWalletChain(config);
        await fn();
        setLiveChain(arcMainnet.id);
      } catch (e) {
        setGuardErr(
          e instanceof Error ? e.message.slice(0, 240) : "Network check failed — try again."
        );
        await refresh();
        throw e;
      } finally {
        setChecking(false);
      }
    },
    [config, refresh]
  );

  return { guard, checking, guardErr, liveChain, refresh };
}

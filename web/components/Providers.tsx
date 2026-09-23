"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { fallback, http } from "viem";
import {
  WagmiProvider,
  createConfig,
  useAccount,
  useConfig,
  useConnection,
  useSwitchChain,
} from "wagmi";
import { injected, walletConnect } from "wagmi/connectors";
import { arcMainnet, arcTestnet } from "@/lib/arc";
import { walletChainId } from "@/lib/walletGuard";

// RPC: same-origin proxy (app/api/rpc) → QuickNode primary, public failover,
// token server-side. Direct third-party RPC hosts get executed by adblockers
// (ERR_BLOCKED_BY_CLIENT) and leak the endpoint token into the JS bundle.
function arcTransport() {
  return fallback([http("/api/rpc")]);
}

const wcProjectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID;

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());
  const [config] = useState(() =>
    createConfig({
      chains: [arcMainnet, arcTestnet],
      connectors: [
        injected({ shimDisconnect: true }),
        ...(wcProjectId ? [walletConnect({ projectId: wcProjectId })] : []),
      ],
      multiInjectedProviderDiscovery: false,
      transports: {
        [arcMainnet.id]: arcTransport(),
        [arcTestnet.id]: http(),
      },
    })
  );
  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <AutoArc />
        {children}
      </QueryClientProvider>
    </WagmiProvider>
  );
}

/**
 * Auto-switch to Arc on connect.
 *
 * Critical detail: we do NOT trust `useChainId()`. It is seeded with the first
 * configured chain (Arc 5042), so it reports "already on Arc" even when the
 * wallet is elsewhere — an auto-switch keyed off it silently does nothing.
 * We ask the wallet itself via `eth_chainId` (see lib/walletGuard.ts).
 */
function AutoArc() {
  const { address, isConnected } = useAccount();
  const { connector } = useConnection();
  const config = useConfig();
  const { switchChainAsync, isPending } = useSwitchChain();
  const tried = useRef("");
  const lastError = useRef("");

  useEffect(() => {
    if (!isConnected || !address || isPending) return;
    const key = `${connector?.uid ?? "c"}:${address}`;
    if (tried.current === key) return;
    tried.current = key;
    let cancelled = false;
    (async () => {
      const live = await walletChainId(config);
      if (cancelled) return;
      if (live === arcMainnet.id || live === 0) {
        tried.current = "";
        return;
      }
      try {
        await switchChainAsync({ chainId: arcMainnet.id });
        console.info(`[wdrop] auto-switched to Arc from chain ${live}`);
        tried.current = "";
      } catch (e: unknown) {
        const err = e as { code?: number; message?: string };
        lastError.current = err?.message ?? String(e);
        console.warn(
          `[wdrop] auto-switch from chain ${live} did not complete:`,
          err?.code,
          err?.message
        );
        // Allow retry on next focus/connect (user may have missed the wallet prompt).
        tried.current = "";
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isConnected, address, connector, config, switchChainAsync, isPending]);

  useEffect(() => {
    if (!isConnected) return;
    const onFocus = () => {
      if (lastError.current) tried.current = "";
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [isConnected]);

  return null;
}

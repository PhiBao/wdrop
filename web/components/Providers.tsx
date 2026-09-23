"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { fallback, http } from "viem";
import { WagmiProvider, createConfig, useAccount, useChainId, useSwitchChain } from "wagmi";
import { injected, walletConnect } from "wagmi/connectors";
import { arcMainnet, arcTestnet } from "@/lib/arc";

// RPC: ORDERED fallback — primary first, never latency-ranked. Ranking routes
// users to the public RPC (often faster) which rate-limits aggressively.
// QuickNode first (generous quota), public only if QN errors.
function arcTransport() {
  const urls = [
    process.env.NEXT_PUBLIC_ARC_RPC_URL,
    process.env.NEXT_PUBLIC_ARC_RPC_FALLBACK,
  ].filter((u): u is string => !!u);
  return urls.length ? fallback(urls.map((url) => http(url))) : http();
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
 * Auto-switch to Arc on connect. One attempt per wallet+chain (tracked in a ref)
 * so a rejection never loops prompts — the manual "Switch to Arc" button stays
 * as backup everywhere.
 */
function AutoArc() {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { switchChain } = useSwitchChain();
  const tried = useRef("");

  useEffect(() => {
    if (!isConnected || !address || chainId === arcMainnet.id) return;
    const key = `${address}:${chainId}`;
    if (tried.current === key) return;
    tried.current = key;
    try {
      switchChain(
        { chainId: arcMainnet.id },
        { onError: () => {} }
      );
    } catch {
      /* unsupported wallet — manual button remains */
    }
  }, [isConnected, address, chainId, switchChain]);

  return null;
}

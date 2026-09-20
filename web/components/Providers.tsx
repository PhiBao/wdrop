"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { fallback, http } from "viem";
import { WagmiProvider, createConfig } from "wagmi";
import { injected, walletConnect } from "wagmi/connectors";
import { arcMainnet, arcTestnet } from "@/lib/arc";

// RPC: optional primary + fallback (e.g. paid QuickNode as primary, public as
// fallback) via env. When unset, wagmi uses the chain defaults (Circle public RPC).
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
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </WagmiProvider>
  );
}

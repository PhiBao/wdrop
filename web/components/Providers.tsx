"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { fallback, http } from "viem";
import {
  WagmiProvider,
  createConfig,
  useAccount,
  useChainId,
  useConnection,
  useSwitchChain,
} from "wagmi";
import { injected, walletConnect } from "wagmi/connectors";
import { arcMainnet, arcTestnet } from "@/lib/arc";

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
 * Why this is manual and noisy instead of silent: when Arc is not yet in the
 * wallet, `wallet_switchEthereumChain` fails with 4902 and the wallet shows an
 * "Add Arc network" confirmation dialog. That prompt lives inside the wallet UI,
 * not the page — easy to miss. So: attempt automatically, surface every
 * outcome, and let the in-page banner (WalletButton) take over on failure.
 */
function AutoArc() {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { connector } = useConnection();
  const { switchChainAsync, isPending } = useSwitchChain();
  const tried = useRef("");
  const lastError = useRef("");

  useEffect(() => {
    if (!isConnected || !address || chainId === arcMainnet.id) return;
    if (isPending) return;
    const key = `${connector?.uid ?? "c"}:${address}:${chainId}`;
    if (tried.current === key) return;
    tried.current = key;
    switchChainAsync({ chainId: arcMainnet.id })
      .then(() => {
        lastError.current = "";
        console.info("[wdrop] auto-switched to Arc (5042)");
      })
      .catch((e: unknown) => {
        const err = e as { code?: number; message?: string; details?: string };
        const msg = err?.message ?? String(e);
        lastError.current = msg;
        console.warn("[wdrop] auto-switch to Arc did not complete:", {
          code: err?.code,
          message: msg,
          hint:
            err?.code === 4902
              ? "Arc not in wallet yet — approve the 'Add Arc network' prompt in your wallet, or use the Switch to Arc button."
              : "Use the Switch to Arc button in the header, or switch networks in your wallet.",
        });
        // Allow one retry per focus (user may have missed the wallet prompt).
        tried.current = "";
      });
  }, [isConnected, address, chainId, connector, switchChainAsync, isPending]);

  useEffect(() => {
    if (!isConnected) return;
    const onFocus = () => {
      if (chainId !== arcMainnet.id && lastError.current) tried.current = "";
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [isConnected, chainId]);

  return null;
}

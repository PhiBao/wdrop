"use client";

import { useEffect } from "react";
import { useAccount, useConnection } from "wagmi";
import { arcMainnet } from "@/lib/arc";
import { useWalletGuard } from "@/lib/walletGuard";

/**
 * Always-visible network readout driven by the WALLET (eth_chainId), not by
 * React chain state — React state is seeded with the first configured chain and
 * can report "Arc" while the wallet is elsewhere.
 */
export function NetworkBadge() {
  const { address, isConnected } = useAccount();
  const { connector } = useConnection();
  const { liveChain, refresh } = useWalletGuard();

  useEffect(() => {
    if (!isConnected) return;
    const t = setInterval(refresh, 3000);
    return () => clearInterval(t);
  }, [isConnected, refresh]);

  if (!isConnected) return null;

  const onArc = liveChain === arcMainnet.id;

  return (
    <div
      className={`fixed bottom-3 left-3 z-50 flex items-center gap-2 rounded-full border px-3 py-1.5 text-[10px] backdrop-blur ${
        onArc
          ? "border-lime-800 bg-lime-950/80 text-lime-200"
          : "border-amber-700 bg-amber-950/80 text-amber-100"
      }`}
      title="Live chain id read from the wallet"
    >
      <span
        className={`h-2 w-2 rounded-full ${onArc ? "bg-lime-400" : "bg-amber-400"}`}
        aria-hidden
      />
      <span className="font-mono">
        {liveChain === null
          ? "reading wallet…"
          : onArc
            ? "Arc 5042"
            : `wallet on chain ${liveChain}`}
      </span>
      {connector && <span className="opacity-70">· {connector.name}</span>}
      {address && (
        <span className="opacity-70">
          · {address.slice(0, 6)}…{address.slice(-4)}
        </span>
      )}
    </div>
  );
}


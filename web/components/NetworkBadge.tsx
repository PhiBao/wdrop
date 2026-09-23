"use client";

import { useAccount, useChainId, useConnection } from "wagmi";
import { arcMainnet } from "@/lib/arc";

/**
 * Always-visible network readout. Judges (and we, while debugging) can see the
 * wallet's live chain ID at a glance instead of guessing from a missing button.
 */
export function NetworkBadge() {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { connector } = useConnection();
  const onArc = chainId === arcMainnet.id;

  if (!isConnected) return null;

  return (
    <div
      className={`fixed bottom-3 left-3 z-50 flex items-center gap-2 rounded-full border px-3 py-1.5 text-[10px] backdrop-blur ${
        onArc
          ? "border-lime-800 bg-lime-950/80 text-lime-200"
          : "border-amber-700 bg-amber-950/80 text-amber-100"
      }`}
      title="Wallet network (from wagmi)"
    >
      <span
        className={`h-2 w-2 rounded-full ${onArc ? "bg-lime-400" : "bg-amber-400"}`}
        aria-hidden
      />
      <span className="font-mono">
        {onArc ? "Arc 5042" : `chain ${chainId} — not Arc`}
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

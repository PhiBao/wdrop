"use client";

import { useAccount, useChainId, useConnect, useDisconnect, useSwitchChain } from "wagmi";
import { arcMainnet } from "@/lib/arc";

export function WalletButton() {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { connect, connectors, isPending, error } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChain, isPending: switching, error: switchError } = useSwitchChain();
  const wrongNet = isConnected && chainId !== arcMainnet.id;

  if (!isConnected) {
    const c = connectors[0];
    return (
      <div className="flex flex-col items-end gap-1">
        <button
          onClick={() => c && connect({ connector: c })}
          disabled={!c || isPending}
          className="rounded-full bg-lime-300 px-5 py-2 text-sm font-semibold text-zinc-950 hover:bg-lime-200 disabled:opacity-50"
        >
          {isPending ? "Connecting…" : "Connect wallet"}
        </button>
        {error && <p className="text-xs text-red-400">No injected wallet found. Install MetaMask.</p>}
      </div>
    );
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-2">
        {wrongNet && (
          <button
            onClick={() => switchChain({ chainId: arcMainnet.id })}
            disabled={switching}
            className="rounded-full bg-amber-300 px-4 py-2 text-xs font-semibold text-zinc-950 hover:bg-amber-200 disabled:opacity-50"
          >
            {switching ? "Switching…" : "Switch to Arc"}
          </button>
        )}
        <span className="rounded-full border border-zinc-700 px-4 py-2 font-mono text-xs text-zinc-200">
          {address?.slice(0, 6)}…{address?.slice(-4)}
        </span>
        <button
          onClick={() => disconnect()}
          className="rounded-full border border-zinc-700 px-4 py-2 text-xs text-zinc-400 hover:text-zinc-100"
        >
          Disconnect
        </button>
      </div>
      {wrongNet && (
        <p className="max-w-[15rem] text-right text-[10px] leading-tight text-amber-200/80">
          Wrong network. Tap “Switch to Arc” — your wallet will ask you to approve it (Arc may need to be
          added once).
        </p>
      )}
      {switchError && (
        <p className="max-w-[15rem] text-right text-[10px] leading-tight text-red-300">
          Switch failed — approve the “Add Arc network” prompt in your wallet.
        </p>
      )}
    </div>
  );
}

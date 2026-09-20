"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { useAccount, useChainId, usePublicClient, useWriteContract } from "wagmi";
import { WDROP_ADDRESS, arcMainnet, explorerAddress, explorerTx, isConfigured } from "@/lib/arc";
import { DROP_STATUS, wdropAbi } from "@/lib/abi";
import { fmtTime, fmtUsdc, readFragmentSecret, shortHash } from "@/lib/wdrop";
import { WalletButton } from "@/components/WalletButton";

type Drop = {
  token: string;
  sender: string;
  arbiter: string;
  amount: bigint;
  createdAt: number;
  expiry: number;
  status: number;
};

export default function ClaimPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const publicClient = usePublicClient();
  const { writeContractAsync } = useWriteContract();
  const [secret] = useState<string | null>(() => readFragmentSecret());
  const [drop, setDrop] = useState<Drop | null>(null);
  const [claimable, setClaimable] = useState(false);
  const [loading, setLoading] = useState(() => isConfigured);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  useEffect(() => {
    if (!publicClient || !isConfigured) return;
    let cancelled = false;
    (async () => {
      try {
        const d = (await publicClient.readContract({
          address: WDROP_ADDRESS,
          abi: wdropAbi,
          functionName: "getDrop",
          args: [BigInt(id)],
        })) as unknown as Drop;
        if (cancelled) return;
        // viem returns expiry/createdAt as bigint
        setDrop({
          ...d,
          amount: BigInt(d.amount as unknown as string),
          expiry: Number(d.expiry),
          createdAt: Number(d.createdAt),
          status: Number(d.status),
        });
        try {
          const c = (await publicClient.readContract({
            address: WDROP_ADDRESS,
            abi: wdropAbi,
            functionName: "isClaimable",
            args: [BigInt(id)],
          })) as boolean;
          if (!cancelled) setClaimable(c);
        } catch { /* ignore */ }
      } catch (e) {
        if (!cancelled) setErr(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [publicClient, id]);

  async function onClaim() {
    if (!publicClient || !address) return;
    setErr(null);
    if (!secret) return setErr("This link is missing its secret (#k=…). Ask the sender for the full link.");
    if (chainId !== arcMainnet.id) return setErr("Switch to Arc mainnet to claim.");
    setBusy(true);
    try {
      const sim = await publicClient.simulateContract({
        account: address,
        address: WDROP_ADDRESS,
        abi: wdropAbi,
        functionName: "claim",
        args: [BigInt(id), secret as `0x${string}`],
      });
      const h = await writeContractAsync(sim.request as never);
      await publicClient.waitForTransactionReceipt({ hash: h });
      setDone(h);
    } catch (e) {
      const m = e instanceof Error ? e.message : String(e);
      if (/BadSecret/i.test(m)) setErr("Wrong secret — this link doesn't match drop #" + id + ".");
      else if (/NotYetExpired|not claimable/i.test(m)) setErr("This drop expired. The sender can sweep it back.");
      else if (/NotLocked/i.test(m)) setErr("Already claimed or reclaimed.");
      else if (/rejected|denied/i.test(m)) setErr("Rejected in wallet. Nothing moved.");
      else if (/insufficient|gas/i.test(m))
        setErr("Not enough USDC on Arc for gas. Keep ~$0.10 USDC in this wallet (gas is USDC here), then retry.");
      else setErr(m);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-xl flex-col px-5 py-6">
      <header className="flex items-center justify-between">
        <Link href="/" className="font-mono text-lg font-bold text-zinc-50">
          wdrop<span className="text-lime-300">.</span>
        </Link>
        <WalletButton />
      </header>

      <div className="mt-10 rounded-2xl border border-zinc-800 bg-zinc-900/60 p-6">
        {loading ? (
          <p className="text-sm text-zinc-400">Loading drop #{id} from Arc…</p>
        ) : err && !drop ? (
          <p className="text-sm text-red-300">{err}</p>
        ) : drop ? (
          <>
            <p className="text-xs text-zinc-500">Someone sent you money on Arc</p>
            <p className="mt-1 font-mono text-4xl font-bold text-zinc-50">{fmtUsdc(drop.amount)} <span className="text-lg text-zinc-400">USDC</span></p>
            <p className="mt-2 text-xs text-zinc-500">
              Drop #{id} · {DROP_STATUS[drop.status]} · expires {fmtTime(drop.expiry)}
            </p>
            <p className="mt-1 font-mono text-xs text-zinc-500">
              from <a className="underline" target="_blank" rel="noreferrer" href={explorerAddress(chainId, drop.sender)}>{shortHash(drop.sender)} ↗</a>
            </p>

            {!isConnected ? (
              <p className="mt-5 rounded-xl border border-zinc-800 bg-zinc-950 p-4 text-sm text-zinc-300">
                Connect a wallet above to claim. No signup — the USDC lands in your wallet in under a second.
                Keep ~$0.10 USDC on Arc in it for gas (gas is paid in USDC, not ETH).
              </p>
            ) : done ? (
              <div className="mt-5 rounded-xl border border-lime-900 bg-lime-950/30 p-4">
                <p className="text-sm font-semibold text-lime-200">Claimed ✓ — check your wallet.</p>
                <a href={explorerTx(chainId, done)} target="_blank" rel="noreferrer" className="font-mono text-xs text-lime-300 underline">
                  {shortHash(done)} ↗ view on Arc explorer
                </a>
              </div>
            ) : (
              <button
                onClick={onClaim}
                disabled={busy || !claimable}
                className="mt-5 w-full rounded-xl bg-lime-300 py-3 text-sm font-semibold text-zinc-950 hover:bg-lime-200 disabled:opacity-50"
              >
                {busy ? "Claiming…" : claimable ? `Claim ${fmtUsdc(drop.amount)} USDC` : drop.status !== 0 ? `Already ${DROP_STATUS[drop.status].toLowerCase()}` : "Expired — sender can reclaim"}
              </button>
            )}
            {err && <p className="mt-3 text-sm text-red-300">{err}</p>}
            {!secret && (
              <p className="mt-3 text-xs text-amber-300">Missing secret in link. The full link ends with #k=0x… — without it, nobody (including us) can claim.</p>
            )}
          </>
        ) : null}
      </div>

      <p className="mt-6 text-center text-xs text-zinc-600">
        Protected send on Arc · gas paid in USDC · sender can reclaim until claimed
      </p>
    </main>
  );
}

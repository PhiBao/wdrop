"use client";

import { useState } from "react";
import {
  useAccount,
  useChainId,
  usePublicClient,
  useReadContract,
  useWriteContract,
} from "wagmi";
import { parseEventLogs } from "viem";
import { USDC_ADDRESS, WDROP_ADDRESS, arcMainnet, isConfigured } from "@/lib/arc";
import { erc20Abi, wdropAbi } from "@/lib/abi";
import {
  buildClaimLink,
  claimHash,
  fmtUsdc,
  newSecret,
  parseUsdc,
  saveMyDrop,
} from "@/lib/wdrop";

const TTLS = [
  { label: "5 min (demo)", secs: 300 },
  { label: "24 hours", secs: 86_400 },
  { label: "7 days", secs: 604_800 },
];

export function CreateDrop() {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const publicClient = usePublicClient();
  const [amount, setAmount] = useState("2");
  const [ttl, setTTL] = useState(TTLS[1].secs);
  const [memo, setMemo] = useState("");
  const [phase, setPhase] = useState<"idle" | "working" | "done">("idle");
  const [step, setStep] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [result, setResult] = useState<{ id: string; link: string; tx: string } | null>(null);

  const { writeContractAsync } = useWriteContract();
  const { refetch: refetchAllowance } = useReadContract({
    address: USDC_ADDRESS,
    abi: erc20Abi,
    functionName: "allowance",
    args: address ? [address, WDROP_ADDRESS] : undefined,
    query: { enabled: !!address && isConfigured },
  });
  const { data: balance } = useReadContract({
    address: USDC_ADDRESS,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    query: { enabled: !!address },
  });

  async function onCreate() {
    setErr(null);
    setResult(null);
    if (!isConnected || !address) return setErr("Connect a wallet first.");
    if (chainId !== arcMainnet.id) return setErr("Switch to Arc mainnet to create a drop.");
    if (!isConfigured) return setErr("Contract not deployed yet — set NEXT_PUBLIC_WDROP_ADDRESS.");
    if (!publicClient) return setErr("No public client. Retry in a moment.");
    let value: bigint;
    try {
      value = parseUsdc(amount);
    } catch (e) {
      return setErr((e as Error).message);
    }
    if (balance !== undefined && (balance as bigint) < value) {
      return setErr(`Insufficient USDC balance (you have ${fmtUsdc(balance as bigint)}). Top up via CCTP first.`);
    }
    setPhase("working");
    try {
      // 1. Approve exact amount if needed
      const cur = ((await refetchAllowance()).data ?? BigInt(0)) as bigint;
      if (cur < value) {
        setStep("Approving USDC… (1 of 2)");
        const h = await writeContractAsync({
          address: USDC_ADDRESS,
          abi: erc20Abi,
          functionName: "approve",
          args: [WDROP_ADDRESS, value],
        });
        await publicClient.waitForTransactionReceipt({ hash: h });
      }
      // 2. Create the drop
      setStep("Locking drop on Arc… (2 of 2)");
      const secret = newSecret();
      const hash = claimHash(secret);
      const req = await publicClient.simulateContract({
        account: address,
        address: WDROP_ADDRESS,
        abi: wdropAbi,
        functionName: "create",
        args: [USDC_ADDRESS, value, hash, BigInt(ttl), "0x0000000000000000000000000000000000000000"],
      });
      const tx = await writeContractAsync(req.request as never);
      const receipt = await publicClient.waitForTransactionReceipt({ hash: tx });
      const logs = parseEventLogs({ abi: wdropAbi, logs: receipt.logs, eventName: "Created" });
      if (!logs.length) throw new Error("Created event not found — check the explorer.");
      const id = (logs[0].args.id as bigint).toString();
      const link = buildClaimLink(window.location.origin, id, secret);
      saveMyDrop(chainId, id, { memo: memo || undefined, secret });
      try {
        await navigator.clipboard.writeText(link);
      } catch { /* clipboard optional */ }
      setResult({ id, link, tx });
      setPhase("done");
      setStep("");
    } catch (e) {
      setErr(friendly(e));
      setPhase("idle");
      setStep("");
    }
  }

  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-6">
      <h2 className="text-lg font-semibold text-zinc-50">Create a protected drop</h2>
      <p className="mt-1 text-sm text-zinc-400">
        Lock USDC behind a claim link. Reclaim anytime before it&apos;s claimed. Auto-refund after expiry.
      </p>

      <label className="mt-5 block text-xs font-medium text-zinc-400">Amount (USDC)</label>
      <input
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        inputMode="decimal"
        placeholder="2.00"
        className="mt-1 w-full rounded-xl border border-zinc-700 bg-zinc-950 px-4 py-3 font-mono text-lg text-zinc-50 outline-none focus:border-lime-300"
      />

      <label className="mt-4 block text-xs font-medium text-zinc-400">Expires in</label>
      <div className="mt-1 flex flex-wrap gap-2">
        {TTLS.map((t) => (
          <button
            key={t.secs}
            onClick={() => setTTL(t.secs)}
            className={`rounded-full px-4 py-2 text-xs font-medium ${
              ttl === t.secs ? "bg-lime-300 text-zinc-950" : "border border-zinc-700 text-zinc-300 hover:border-zinc-500"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <label className="mt-4 block text-xs font-medium text-zinc-400">Memo (private, this browser only)</label>
      <input
        value={memo}
        onChange={(e) => setMemo(e.target.value)}
        placeholder="e.g. concert ticket — Row B"
        maxLength={80}
        className="mt-1 w-full rounded-xl border border-zinc-700 bg-zinc-950 px-4 py-3 text-sm text-zinc-50 outline-none focus:border-lime-300"
      />

      <button
        onClick={onCreate}
        disabled={phase === "working"}
        className="mt-5 w-full rounded-xl bg-lime-300 py-3 text-sm font-semibold text-zinc-950 hover:bg-lime-200 disabled:opacity-50"
      >
        {phase === "working" ? step || "Working…" : "Lock drop → get link"}
      </button>

      {typeof balance === "bigint" && (
        <p className="mt-2 text-xs text-zinc-500">Balance: {fmtUsdc(balance as bigint)} USDC · Gas paid in USDC on Arc</p>
      )}
      {err && <p className="mt-3 rounded-xl border border-red-900 bg-red-950/50 px-4 py-3 text-sm text-red-300">{err}</p>}

      {result && (
        <div className="mt-4 rounded-xl border border-lime-900 bg-lime-950/30 px-4 py-3">
          <p className="text-sm font-semibold text-lime-200">Drop #{result.id} locked ✓ (link copied)</p>
          <a href={result.link} className="mt-1 block break-all font-mono text-xs text-lime-300 underline">
            {result.link}
          </a>
          <p className="mt-2 text-xs text-zinc-400">
            Share the link. Keep it secret — anyone with it can claim. Reclaim anytime from “My drops”.
          </p>
        </div>
      )}
    </div>
  );
}

function friendly(e: unknown): string {
  const m = e instanceof Error ? e.message : String(e);
  if (/User rejected|denied/i.test(m)) return "Transaction rejected in wallet. Nothing was locked.";
  if (/insufficient/i.test(m)) return "Insufficient USDC for amount + gas. Top up a little extra (gas is paid in USDC).";
  if (/BadTTL/i.test(m)) return "Expiry out of range (5 min – 30 days).";
  if (/AmountTooLarge/i.test(m)) return "Amount exceeds the 10,000 USDC per-drop cap.";
  if (/allowance|approve/i.test(m)) return "USDC approval failed. Try again — approve exactly once per amount.";
  return m.length > 280 ? m.slice(0, 280) + "…" : m;
}

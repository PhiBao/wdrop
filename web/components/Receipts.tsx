"use client";

import { useState } from "react";
import { useAccount, useChainId, usePublicClient } from "wagmi";
import { WDROP_ADDRESS, explorerTx, isConfigured } from "@/lib/arc";
import { claimedEvent, createdEvent, reclaimedEvent, sweptEvent, wdropAbi } from "@/lib/abi";
import { downloadCsv, fmtUsdc, receiptsCsv, type ReceiptRow } from "@/lib/wdrop";

const DEPLOY_BLOCK = BigInt(process.env.NEXT_PUBLIC_DEPLOY_BLOCK ?? "0");

export function Receipts() {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const publicClient = usePublicClient();
  const [rows, setRows] = useState<ReceiptRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function load() {
    if (!publicClient || !address || !isConfigured) return;
    setLoading(true);
    setErr(null);
    try {
      // Only my own actions: locks I created, claims I received, reclaims/sweeps
      // back to me. (Claims of my drops by others are visible per-drop in MyDrops.)
      const [created, claimed, reclaimed, swept] = await Promise.all([
        publicClient.getLogs({ address: WDROP_ADDRESS, event: createdEvent[0], args: { sender: address }, fromBlock: DEPLOY_BLOCK, toBlock: "latest" }),
        publicClient.getLogs({ address: WDROP_ADDRESS, event: claimedEvent[0], args: { claimer: address }, fromBlock: DEPLOY_BLOCK, toBlock: "latest" }),
        publicClient.getLogs({ address: WDROP_ADDRESS, event: reclaimedEvent[0], args: { sender: address }, fromBlock: DEPLOY_BLOCK, toBlock: "latest" }),
        publicClient.getLogs({ address: WDROP_ADDRESS, event: sweptEvent[0], args: { sender: address }, fromBlock: DEPLOY_BLOCK, toBlock: "latest" }),
      ]);
      const out: ReceiptRow[] = [];
      const { parseEventLogs } = await import("viem");
      for (const l of created) {
        const p = parseEventLogs({ abi: wdropAbi, logs: [l], eventName: "Created" })[0];
        out.push({
          event: "Locked", dropId: (p.args.id as bigint).toString(),
          amount: fmtUsdc(p.args.amount as bigint), txHash: l.transactionHash!,
          blockNumber: l.blockNumber!.toString(), counterparty: "—",
        });
      }
      for (const l of claimed) {
        const p = parseEventLogs({ abi: wdropAbi, logs: [l], eventName: "Claimed" })[0];
        out.push({
          event: "Claimed", dropId: (p.args.id as bigint).toString(),
          amount: fmtUsdc(p.args.amount as bigint), txHash: l.transactionHash!,
          blockNumber: l.blockNumber!.toString(), counterparty: p.args.claimer as string,
        });
      }
      for (const l of reclaimed) {
        const p = parseEventLogs({ abi: wdropAbi, logs: [l], eventName: "Reclaimed" })[0];
        out.push({
          event: "Reclaimed", dropId: (p.args.id as bigint).toString(),
          amount: fmtUsdc(p.args.amount as bigint), txHash: l.transactionHash!,
          blockNumber: l.blockNumber!.toString(), counterparty: address,
        });
      }
      for (const l of swept) {
        const p = parseEventLogs({ abi: wdropAbi, logs: [l], eventName: "Swept" })[0];
        out.push({
          event: "Swept", dropId: (p.args.id as bigint).toString(),
          amount: fmtUsdc(p.args.amount as bigint), txHash: l.transactionHash!,
          blockNumber: l.blockNumber!.toString(), counterparty: address,
        });
      }
      out.sort((a, b) => Number(BigInt(b.blockNumber) - BigInt(a.blockNumber)));
      setRows(out);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  if (!isConnected) return null;

  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-zinc-50">Receipts</h2>
        <div className="flex gap-2">
          <button onClick={load} disabled={loading} className="text-xs text-zinc-400 underline hover:text-zinc-200">
            {loading ? "Loading…" : rows.length ? "Refresh" : "Load receipts"}
          </button>
          {rows.length > 0 && (
            <button
              onClick={() => downloadCsv(`wdrop-receipts-${chainId}.csv`, receiptsCsv(rows))}
              className="rounded-full border border-zinc-700 px-3 py-1 text-xs text-zinc-300 hover:border-zinc-400"
            >
              ↓ CSV
            </button>
          )}
        </div>
      </div>
      {err && <p className="mt-2 text-sm text-red-300">{err}</p>}
      {rows.length === 0 && !loading && (
        <p className="mt-2 text-sm text-zinc-500">Every lock, claim, and reclaim is an onchain event. Load them here for your books.</p>
      )}
      {rows.length > 0 && (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="text-zinc-500">
                <th className="py-2 pr-3">Event</th>
                <th className="py-2 pr-3">Drop</th>
                <th className="py-2 pr-3">USDC</th>
                <th className="py-2 pr-3">Tx</th>
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, 25).map((r, i) => (
                <tr key={i} className="border-t border-zinc-800 font-mono">
                  <td className="py-2 pr-3 text-zinc-200">{r.event}</td>
                  <td className="py-2 pr-3 text-zinc-400">#{r.dropId}</td>
                  <td className="py-2 pr-3 text-zinc-200">{r.amount}</td>
                  <td className="py-2 pr-3">
                    <a href={explorerTx(chainId, r.txHash)} target="_blank" rel="noreferrer" className="text-zinc-500 underline hover:text-zinc-300">
                      {r.txHash.slice(0, 10)}… ↗
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

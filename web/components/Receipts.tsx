"use client";

import { useState } from "react";
import { useAccount, useChainId, usePublicClient } from "wagmi";
import { parseEventLogs } from "viem";
import { WDROP_ADDRESS, explorerTx, isConfigured } from "@/lib/arc";
import { wdropAbi } from "@/lib/abi";
import { getLogsCached, sameAddress } from "@/lib/logs";
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
      // One shared cached scan with MyDrops (see lib/logs): all contract logs,
      // split + filtered client-side. Single request instead of four.
      const allLogs = await getLogsCached(publicClient, chainId, {
        address: WDROP_ADDRESS,
        fromBlock: DEPLOY_BLOCK,
      });
      const created: typeof allLogs = [];
      const claimed: typeof allLogs = [];
      const reclaimed: typeof allLogs = [];
      const swept: typeof allLogs = [];
      for (const l of allLogs) {
        for (const [name, bucket] of [
          ["Created", created],
          ["Claimed", claimed],
          ["Reclaimed", reclaimed],
          ["Swept", swept],
        ] as const) {
          try {
            if (parseEventLogs({ abi: wdropAbi, logs: [l], eventName: name }).length) {
              bucket.push(l);
              break;
            }
          } catch {
            /* not this event — try next */
          }
        }
      }
      const out: ReceiptRow[] = [];
      const myDropIds = new Set<string>();
      for (const l of created) {
        const p = parseEventLogs({ abi: wdropAbi, logs: [l], eventName: "Created" })[0];
        if (!sameAddress(p.args.sender as string, address)) continue;
        myDropIds.add((p.args.id as bigint).toString());
        out.push({
          event: "Locked", dropId: (p.args.id as bigint).toString(),
          amount: fmtUsdc(p.args.amount as bigint), txHash: l.transactionHash!,
          blockNumber: l.blockNumber!.toString(), counterparty: "—",
        });
      }
      for (const l of claimed) {
        const p = parseEventLogs({ abi: wdropAbi, logs: [l], eventName: "Claimed" })[0];
        const id = (p.args.id as bigint).toString();
        // My claims, plus claims of MY drops by others (someone took my money — I want that receipt).
        if (!sameAddress(p.args.claimer as string, address) && !myDropIds.has(id)) continue;
        out.push({
          event: "Claimed", dropId: id,
          amount: fmtUsdc(p.args.amount as bigint), txHash: l.transactionHash!,
          blockNumber: l.blockNumber!.toString(), counterparty: p.args.claimer as string,
        });
      }
      for (const l of reclaimed) {
        const p = parseEventLogs({ abi: wdropAbi, logs: [l], eventName: "Reclaimed" })[0];
        if (!sameAddress(p.args.sender as string, address)) continue;
        out.push({
          event: "Reclaimed", dropId: (p.args.id as bigint).toString(),
          amount: fmtUsdc(p.args.amount as bigint), txHash: l.transactionHash!,
          blockNumber: l.blockNumber!.toString(), counterparty: address,
        });
      }
      for (const l of swept) {
        const p = parseEventLogs({ abi: wdropAbi, logs: [l], eventName: "Swept" })[0];
        if (!sameAddress(p.args.sender as string, address)) continue;
        out.push({
          event: "Swept", dropId: (p.args.id as bigint).toString(),
          amount: fmtUsdc(p.args.amount as bigint), txHash: l.transactionHash!,
          blockNumber: l.blockNumber!.toString(), counterparty: address,
        });
      }
      out.sort((a, b) => Number(BigInt(b.blockNumber) - BigInt(a.blockNumber)));
      setRows(out);
    } catch (e) {
      setErr("Couldn't load receipts — the RPC refused the query. Check your connection and retry.");
      console.warn("Receipts log query failed", e);
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

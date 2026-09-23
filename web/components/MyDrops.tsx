"use client";

import { useCallback, useEffect, useEffectEvent, useState } from "react";
import { useAccount, useChainId, usePublicClient, useWriteContract } from "wagmi";
import { parseEventLogs } from "viem";
import { WDROP_ADDRESS, arcMainnet, explorerTx, isConfigured } from "@/lib/arc";
import { DROP_STATUS, wdropAbi } from "@/lib/abi";
import { getLogsCached, sameAddress } from "@/lib/logs";
import { buildClaimLink, fmtTime, fmtUsdc, loadMyDrops, toDropData } from "@/lib/wdrop";

type Row = {
  id: string;
  amount: bigint;
  expiry: number;
  status: number;
  claimable: boolean;
  txHash: string;
  memo?: string;
  secret?: string;
};

const DEPLOY_BLOCK = BigInt(process.env.NEXT_PUBLIC_DEPLOY_BLOCK ?? "0");

export function MyDrops() {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const publicClient = usePublicClient();
  const { writeContractAsync } = useWriteContract();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now() / 1000);

  const refresh = useCallback(async () => {
    if (!publicClient || !address || !isConfigured) return;
    setLoading(true);
    setErr(null);
    try {
      // One shared cached scan (see lib/logs): no indexed-arg filters, bisect on
      // strict RPCs, client-side sender filter here.
      const logs = (
        await getLogsCached(publicClient, chainId, {
          address: WDROP_ADDRESS,
          fromBlock: DEPLOY_BLOCK,
        })
      ).filter((l) => {
        try {
          const p = parseEventLogs({ abi: wdropAbi, logs: [l], eventName: "Created" })[0];
          return sameAddress(p.args.sender as string, address);
        } catch {
          return false;
        }
      });
      const metas = loadMyDrops();
      const out: Row[] = [];
      for (const l of logs) {
        try {
          const parsed = parseEventLogs({ abi: wdropAbi, logs: [l], eventName: "Created" })[0];
          const id = (parsed.args.id as bigint).toString();
          const d = toDropData(
            await publicClient.readContract({
              address: WDROP_ADDRESS,
              abi: wdropAbi,
              functionName: "getDrop",
              args: [BigInt(id)],
            })
          );
        let claimable = false;
        try {
          claimable = (await publicClient.readContract({
            address: WDROP_ADDRESS,
            abi: wdropAbi,
            functionName: "isClaimable",
            args: [BigInt(id)],
          })) as boolean;
        } catch { /* ignore */ }
        const meta = metas[`${chainId}:${id}`];
          out.push({
            id,
            amount: d.amount,
            expiry: d.expiry,
            status: d.status,
            claimable,
            txHash: l.transactionHash!,
            memo: meta?.memo,
            secret: meta?.secret,
          });
        } catch (rowErr) {
          // One unloadable drop must not kill the whole list.
          console.warn("Skipping unloadable drop", rowErr);
        }
      }
      out.sort((a, b) => Number(BigInt(b.id) - BigInt(a.id)));
      setRows(out);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
      setNow(Date.now() / 1000);
    }
  }, [publicClient, address, chainId]);

  const syncOnConnect = useEffectEvent(() => {
    if (isConnected) refresh();
    else setRows([]);
  });

  useEffect(() => {
    // Fetch-on-connect: subscription-style sync, not render-derived state.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    syncOnConnect();
  }, [isConnected]);

  async function act(kind: "reclaim" | "sweepExpired", id: string) {
    if (!publicClient) return;
    setBusy(`${kind}:${id}`);
    setErr(null);
    setOk(null);
    try {
      const sim = await publicClient.simulateContract({
        account: address!,
        address: WDROP_ADDRESS,
        abi: wdropAbi,
        functionName: kind,
        args: [BigInt(id)],
      });
      const h = await writeContractAsync(sim.request as never);
      await publicClient.waitForTransactionReceipt({ hash: h });
      setOk(`${kind === "reclaim" ? "Reclaimed" : "Swept"} drop #${id}.`);
      refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  if (!isConnected) return null;

  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-zinc-50">My drops</h2>
        <button onClick={refresh} disabled={loading} className="text-xs text-zinc-400 underline hover:text-zinc-200">
          {loading ? "Loading…" : "Refresh"}
        </button>
      </div>
      {err && <p className="mt-3 text-sm text-red-300">{err}</p>}
      {ok && <p className="mt-3 text-sm text-lime-300">{ok}</p>}
      {!loading && rows.length === 0 && (
        <p className="mt-3 text-sm text-zinc-500">No drops yet on this network. Create one above — it appears here with its undo button.</p>
      )}
      <div className="mt-3 flex flex-col gap-3">
        {rows.map((r) => {
          const expired = now > r.expiry;
          return (
            <div key={r.id} className="rounded-xl border border-zinc-800 bg-zinc-950 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-mono text-sm text-zinc-100">
                  #{r.id} · {fmtUsdc(r.amount)} USDC ·{" "}
                  <span className={r.status === 0 ? "text-lime-300" : "text-zinc-400"}>{DROP_STATUS[r.status]}</span>
                </p>
                <a
                  href={explorerTx(chainId, r.txHash)}
                  target="_blank"
                  rel="noreferrer"
                  className="font-mono text-xs text-zinc-500 underline hover:text-zinc-300"
                >
                  lock tx ↗
                </a>
              </div>
              {r.memo && <p className="mt-1 text-xs text-zinc-400">{r.memo}</p>}
              <p className="mt-1 text-xs text-zinc-500">
                {r.status === 0 ? (expired ? `Expired ${fmtTime(r.expiry)} — sweep it back.` : `Expires ${fmtTime(r.expiry)}`) : `Closed`}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {r.secret && r.status === 0 && (
                  <a
                    href={buildClaimLink(window.location.origin, r.id, r.secret)}
                    className="rounded-full border border-zinc-700 px-4 py-1.5 text-xs text-zinc-200 hover:border-zinc-400"
                  >
                    Open claim link
                  </a>
                )}
                {r.status === 0 && !expired && (
                  <button
                    onClick={() => act("reclaim", r.id)}
                    disabled={busy !== null || chainId !== arcMainnet.id}
                    className="rounded-full bg-amber-300 px-4 py-1.5 text-xs font-semibold text-zinc-950 hover:bg-amber-200 disabled:opacity-50"
                  >
                    {busy === `reclaim:${r.id}` ? "Reclaiming…" : "↩ Reclaim (undo)"}
                  </button>
                )}
                {r.status === 0 && expired && (
                  <button
                    onClick={() => act("sweepExpired", r.id)}
                    disabled={busy !== null}
                    className="rounded-full bg-lime-300 px-4 py-1.5 text-xs font-semibold text-zinc-950 hover:bg-lime-200 disabled:opacity-50"
                  >
                    {busy === `sweepExpired:${r.id}` ? "Sweeping…" : "Sweep expired back"}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

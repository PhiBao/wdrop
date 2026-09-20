import { formatUnits, keccak256, parseUnits } from "viem";
import { USDC_DECIMALS } from "./arc";

/** Random 32-byte secret, 0x-hex. Kept in the URL fragment (#k=), never sent to any server. */
export function newSecret(): `0x${string}` {
  const b = new Uint8Array(32);
  crypto.getRandomValues(b);
  return `0x${[...b].map((x) => x.toString(16).padStart(2, "0")).join("")}`;
}

export function claimHash(secret: `0x${string}`): `0x${string}` {
  return keccak256(secret);
}

export function buildClaimLink(origin: string, id: bigint | number | string, secret: string): string {
  return `${origin.replace(/\/$/, "")}/claim/${id}#k=${secret}`;
}

/** Secret lives in the location fragment so it never hits server logs. */
export function readFragmentSecret(): string | null {
  if (typeof window === "undefined") return null;
  const m = window.location.hash.match(/#k=(0x[0-9a-fA-F]{64})/);
  return m ? m[1] : null;
}

export function parseUsdc(input: string): bigint {
  const v = input.trim();
  if (!v || Number.isNaN(Number(v)) || Number(v) <= 0) throw new Error("Enter an amount greater than 0.");
  if (Number(v) > 10_000) throw new Error("Demo cap is 10,000 USDC per drop.");
  return parseUnits(v, USDC_DECIMALS);
}

export function fmtUsdc(raw: bigint): string {
  return Number(formatUnits(raw, USDC_DECIMALS)).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function fmtTime(ts: number): string {
  return new Date(ts * 1000).toLocaleString();
}

export function shortHash(h: string): string {
  return h.length > 12 ? `${h.slice(0, 6)}…${h.slice(-4)}` : h;
}

export type DropMeta = { memo?: string; createdAt?: number };

// ---- local receipts: drops this browser created (memo + secret backup) ----
const LS_KEY = "wdrop:my-drops:v1";

export function saveMyDrop(chainId: number, id: string, entry: DropMeta & { secret?: string }) {
  try {
    const all = loadMyDrops();
    all[`${chainId}:${id}`] = { ...all[`${chainId}:${id}`], ...entry };
    localStorage.setItem(LS_KEY, JSON.stringify(all));
  } catch { /* private mode */ }
}

export function loadMyDrops(): Record<string, DropMeta & { secret?: string }> {
  try {
    return JSON.parse(localStorage.getItem(LS_KEY) ?? "{}");
  } catch {
    return {};
  }
}

export type ReceiptRow = {
  event: string;
  dropId: string;
  amount: string;
  txHash: string;
  blockNumber: string;
  counterparty: string;
};

export function receiptsCsv(rows: ReceiptRow[]): string {
  const head = "event,drop_id,amount_usdc,tx_hash,block,counterparty";
  const esc = (s: string) => `"${s.replace(/"/g, '""')}"`;
  return [head, ...rows.map((r) => [r.event, r.dropId, r.amount, r.txHash, r.blockNumber, r.counterparty].map(esc).join(","))].join("\n");
}

export function downloadCsv(filename: string, csv: string) {
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

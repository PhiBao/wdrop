import type { Log, PublicClient } from "viem";

/**
 * Shared, cached contract-log scanner.
 *
 * Why this exists: strict RPCs reject wide log queries —
 *  - Circle public RPC: `-32012 requested range too large` + tight rate limits
 *  - QuickNode: `-32614 eth_getLogs is limited to a 10,000 range` (+413s)
 * ...and `null` topic wildcards (indexed-arg filters) are flaky across providers.
 *
 * Strategy:
 *  1. ONE address-scoped query per contract (no event/topics filter), split
 *     client-side with parseEventLogs. Fewer requests = fewer rate limits.
 *  2. Fixed 9k-block windows (under QN's 10k cap) with bounded concurrency.
 *  3. Retry with backoff on rate-limit / transient network errors.
 *  4. Cache scanned logs module-wide (keyed by chain+contract): refreshes only
 *     fetch the delta since the last scan. Both MyDrops and Receipts share it.
 */

type RawLog = Log & { address: string };
type CachedScan = { toBlock: bigint; logs: RawLog[] };

const scanCache = new Map<string, CachedScan>();
const MAX_CACHED = 3000;

// Under QuickNode's 10,000-block eth_getLogs cap, with margin.
const CHUNK = BigInt(9000);
const CONCURRENCY = 4;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function getLogsCached(
  client: PublicClient,
  chainId: number,
  opts: { address: `0x${string}`; fromBlock: bigint }
): Promise<RawLog[]> {
  const key = `${chainId}:${opts.address.toLowerCase()}`;
  const prev = scanCache.get(key);
  const latest = await client.getBlockNumber();
  const start = prev ? prev.toBlock + BigInt(1) : opts.fromBlock;
  if (prev && start > latest) return prev.logs;
  const fresh = (await fetchSpan(client, {
    address: opts.address,
    fromBlock: start,
    toBlock: latest,
  })) as RawLog[];
  const merged = prev ? [...prev.logs, ...fresh] : fresh;
  const trimmed =
    merged.length > MAX_CACHED ? merged.slice(merged.length - MAX_CACHED) : merged;
  scanCache.set(key, { toBlock: latest, logs: trimmed });
  return trimmed;
}

/** Single-range attempt; falls back to fixed windows on size errors. */
async function fetchSpan(
  client: PublicClient,
  range: { address: `0x${string}`; fromBlock: bigint; toBlock: bigint },
  tries = 3
): Promise<RawLog[]> {
  try {
    return (await client.getLogs({
      address: range.address,
      fromBlock: range.fromBlock,
      toBlock: range.toBlock,
    })) as RawLog[];
  } catch (e) {
    if (isSizeError(e)) {
      return fetchChunked(client, range.address, range.fromBlock, range.toBlock);
    }
    if (tries > 1 && isTransient(e)) {
      await sleep(500 * (4 - tries));
      return fetchSpan(client, range, tries - 1);
    }
    throw e;
  }
}

async function fetchChunked(
  client: PublicClient,
  address: `0x${string}`,
  from: bigint,
  to: bigint
): Promise<RawLog[]> {
  const windows: Array<[bigint, bigint]> = [];
  for (let s = from; s <= to; s += CHUNK) {
    const e = s + CHUNK - BigInt(1) > to ? to : s + CHUNK - BigInt(1);
    windows.push([s, e]);
  }
  const out: RawLog[] = [];
  for (let i = 0; i < windows.length; i += CONCURRENCY) {
    const batch = await Promise.all(
      windows.slice(i, i + CONCURRENCY).map(([s, e]) => fetchOne(client, address, s, e))
    );
    for (const logs of batch) out.push(...logs);
  }
  return out;
}

async function fetchOne(
  client: PublicClient,
  address: `0x${string}`,
  from: bigint,
  to: bigint,
  tries = 3
): Promise<RawLog[]> {
  try {
    return (await client.getLogs({ address, fromBlock: from, toBlock: to })) as RawLog[];
  } catch (e) {
    if (tries > 1 && isTransient(e)) {
      await sleep(500 * (4 - tries));
      return fetchOne(client, address, from, to, tries - 1);
    }
    throw e;
  }
}

function isSizeError(e: unknown): boolean {
  const m = e instanceof Error ? e.message : String(e);
  return /range|limited|exceed|too many|413|payload|32614/i.test(m);
}

function isTransient(e: unknown): boolean {
  // Size errors are handled by chunking, never by retry.
  if (isSizeError(e)) return false;
  const m = e instanceof Error ? e.message : String(e);
  return /rate limit|429|too many requests|failed to fetch|network|timeout|etimeout|econnreset|502|503|504|server error|unavailable/i.test(
    m
  );
}

export function sameAddress(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase();
}

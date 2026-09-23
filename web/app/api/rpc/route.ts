/**
 * POST /api/rpc — same-origin JSON-RPC proxy for Arc mainnet.
 *
 * Why: browsers (and adblockers) kill third-party RPC hosts outright
 * (`ERR_BLOCKED_BY_CLIENT` on quiknode.pro *and* the public endpoint), and
 * shipping the QuickNode token in the JS bundle forces weak referrer-lock
 * security theater. The proxy keeps all upstream traffic server-side:
 * first-party requests only, token never leaves Vercel.
 *
 * Behavior: forward the JSON-RPC body to QuickNode; on transport/HTTP failure
 * fall back to the public RPC. Bodies capped at 16KB (our heaviest call is a
 * small getLogs window). No method allowlist by design — wallets need the full
 * eth_* surface — but POST-only + body cap bounds abuse.
 */
export async function POST(req: Request) {
  const body = await req.text();
  if (!body || body.length > 16384) {
    return json({ error: "bad request" }, 413);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return json(
      { jsonrpc: "2.0", id: null, error: { code: -32700, message: "parse error" } },
      400
    );
  }
  if (!isRpcPayload(parsed)) {
    return json(
      { jsonrpc: "2.0", id: null, error: { code: -32600, message: "invalid request" } },
      400
    );
  }

  const primary = process.env.ARC_RPC_URL;
  const fallbackUrl = process.env.ARC_RPC_FALLBACK_URL;
  if (!primary) {
    return json(
      { jsonrpc: "2.0", id: idOf(parsed), error: { code: -32603, message: "rpc not configured" } },
      500
    );
  }

  const upstream = await tryUpstream(primary, body).catch(() => null);
  const res =
    upstream && upstream.ok
      ? upstream
      : fallbackUrl
        ? await tryUpstream(fallbackUrl, body).catch(() => null)
        : null;
  if (!res) {
    return json(
      { jsonrpc: "2.0", id: idOf(parsed), error: { code: -32603, message: "all upstreams failed" } },
      502
    );
  }
  const text = await res.text();
  return new Response(text, {
    status: res.ok ? 200 : res.status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

export async function GET() {
  return json({ error: "use POST with a JSON-RPC body" }, 405);
}

async function tryUpstream(url: string, body: string): Promise<Response> {
  return fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
  });
}

function isRpcPayload(p: unknown): boolean {
  if (Array.isArray(p)) return p.every(isRpcPayload);
  if (typeof p !== "object" || p === null) return false;
  const o = p as Record<string, unknown>;
  return o["jsonrpc"] === "2.0" && typeof o["method"] === "string";
}

function idOf(p: unknown): unknown {
  if (Array.isArray(p)) return p.map(idOf);
  if (typeof p === "object" && p !== null && "id" in p) {
    return (p as Record<string, unknown>)["id"] ?? null;
  }
  return null;
}

function json(v: unknown, status: number): Response {
  return Response.json(v, { status });
}

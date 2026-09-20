import { defineChain } from "viem";

export const arcMainnet = defineChain({
  id: 5042,
  name: "Arc",
  nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 },
  rpcUrls: {
    default: {
      http: [
        process.env.NEXT_PUBLIC_ARC_RPC_URL ?? "https://rpc.mainnet.arc.io",
      ],
    },
  },
  blockExplorers: {
    default: { name: "Arc Explorer", url: "https://explorer.arc.io" },
  },
});

export const arcTestnet = defineChain({
  id: 5042002,
  name: "Arc Testnet",
  nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 },
  rpcUrls: {
    default: { http: ["https://rpc.testnet.arc.io"] },
  },
  blockExplorers: {
    default: { name: "ArcScan Testnet", url: "https://testnet.arcscan.app" },
  },
});

/** Native USDC (gas + ERC-20 interface share the balance; ERC-20 uses 6dp). */
export const USDC_ADDRESS =
  "0x3600000000000000000000000000000000000000" as const;

export const USDC_DECIMALS = 6;

/** Deployed WDrop address — set via env at deploy time. Zero = not configured. */
export const WDROP_ADDRESS = (process.env.NEXT_PUBLIC_WDROP_ADDRESS ??
  "0x0000000000000000000000000000000000000000") as `0x${string}`;

export const isConfigured =
  WDROP_ADDRESS !== "0x0000000000000000000000000000000000000000";

export function explorerTx(chainId: number, hash: string): string {
  const base =
    chainId === arcTestnet.id
      ? arcTestnet.blockExplorers.default.url
      : arcMainnet.blockExplorers.default.url;
  return `${base}/tx/${hash}`;
}

export function explorerAddress(chainId: number, addr: string): string {
  const base =
    chainId === arcTestnet.id
      ? arcTestnet.blockExplorers.default.url
      : arcMainnet.blockExplorers.default.url;
  return `${base}/address/${addr}`;
}

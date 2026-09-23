import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "@/components/Providers";
import { NetworkBadge } from "@/components/NetworkBadge";

export const metadata: Metadata = {
  title: "wdrop — send USDC on Arc with an undo button",
  description:
    "Lock USDC behind a claim link on Arc. The receiver claims in one click; the sender can reclaim anytime before that. Auto-refund on expiry.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full bg-zinc-950 text-zinc-100">
        <Providers>
          {children}
          <NetworkBadge />
        </Providers>
      </body>
    </html>
  );
}

import { CreateDrop } from "@/components/CreateDrop";
import { MyDrops } from "@/components/MyDrops";
import { Receipts } from "@/components/Receipts";
import { WalletButton } from "@/components/WalletButton";
import { WDROP_ADDRESS, explorerAddress, isConfigured } from "@/lib/arc";

export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-2xl flex-col px-5 py-6">
      <header className="flex items-center justify-between">
        <p className="font-mono text-lg font-bold">
          wdrop<span className="text-lime-300">.</span>
        </p>
        <WalletButton />
      </header>

      <section className="mt-12">
        <p className="inline-block rounded-full border border-lime-900 bg-lime-950/40 px-3 py-1 text-xs text-lime-300">
          Live on Arc mainnet · USDC gas · sub-second finality
        </p>
        <h1 className="mt-4 text-4xl font-bold leading-tight tracking-tight">
          Send USDC with an <span className="text-lime-300">undo button</span>.
        </h1>
        <p className="mt-3 text-base leading-relaxed text-zinc-400">
          Crypto payments are irreversible — one typo and it&apos;s gone. wdrop locks your USDC behind a
          claim link instead of pushing it to an address. Wrong person?{" "}
          <span className="text-zinc-200">Reclaim it.</span> They never claim?{" "}
          <span className="text-zinc-200">Auto-refund on expiry.</span>
        </p>
        <div className="mt-5 grid grid-cols-3 gap-2 text-center">
          {[
            ["1. Lock", "Amount + expiry → link"],
            ["2. Share", "Anyone with link claims"],
            ["3. Undo", "Reclaim until claimed"],
          ].map(([t, d]) => (
            <div key={t} className="rounded-xl border border-zinc-800 bg-zinc-900/60 px-2 py-3">
              <p className="text-sm font-semibold text-zinc-100">{t}</p>
              <p className="mt-1 text-xs text-zinc-500">{d}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-8 flex flex-col gap-4">
        <CreateDrop />
        <MyDrops />
        <Receipts />
      </section>

      <section className="mt-8 rounded-2xl border border-zinc-800 bg-zinc-900/60 p-6 text-sm text-zinc-400">
        <h2 className="font-semibold text-zinc-100">Why not just send?</h2>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li>Typos and wrong networks are permanent on push rails — wdrop keeps an auth window.</li>
          <li>Screenshots can be faked — a claim is onchain proof, not a photo.</li>
          <li>No middlemen — the contract (not a person) holds the funds.</li>
          <li>Every lock, claim, and reclaim is an explorer-verifiable event + CSV receipt.</li>
        </ul>
      </section>

      <footer className="mt-8 border-t border-zinc-900 pt-4 pb-8 text-xs text-zinc-600">
        {isConfigured ? (
          <p>
            Contract:{" "}
            <a className="font-mono underline" target="_blank" rel="noreferrer" href={explorerAddress(5042, WDROP_ADDRESS)}>
              {WDROP_ADDRESS}
            </a>{" "}
            · Arc mainnet (5042) · USDC 0x3600…0000
          </p>
        ) : (
          <p>Contract not deployed yet — set NEXT_PUBLIC_WDROP_ADDRESS after deployment.</p>
        )}
        <p className="mt-1">wdrop · Arc Microgrants submission · secret stays in the URL fragment, never on a server.</p>
      </footer>
    </main>
  );
}

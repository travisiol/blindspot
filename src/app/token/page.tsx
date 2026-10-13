import type { Metadata } from "next";
import { TokenView } from "@/components/TokenView";
import { SITE } from "@/config/site";
import { baseFeeBps, buybackShareBps } from "@/server/config";

export const metadata: Metadata = { title: SITE.ticker };

export default function TokenPage() {
  const fee = baseFeeBps() / 100;
  const share = buybackShareBps() / 100;
  return (
    <main className="shell pt-10 sm:pt-14">
      <h1 className="h2">{SITE.ticker}</h1>
      <p className="mt-4 max-w-3xl text-xl">
        Every swap made from the vault pays a {fee}% fee; {share}% of that fee buys {SITE.ticker} on the market, and each buyback is listed below with its
        transaction.
      </p>
      <p className="mt-3 max-w-3xl text-muted">
        Holding {SITE.ticker} — in your wallet or in your vault balance — lowers your fee. Bought tokens stay in the vault wallet&apos;s treasury. Launched
        on pump.fun.
      </p>
      <div className="mt-10">
        <TokenView />
      </div>
    </main>
  );
}

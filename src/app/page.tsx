import Link from "next/link";
import { Faq, FAQ } from "@/components/Faq";
import { Mirror } from "@/components/Mirror";
import { TrackerPanel } from "@/components/TrackerPanel";
import { SITE } from "@/config/site";
import { baseFeeBps, buybackShareBps, feeTiers } from "@/server/config";

const pct = (bps: number) => `${(bps / 100).toFixed(2).replace(/\.?0+$/, "")}%`;

const STEPS = [
  {
    title: "Deposit",
    body: "Send SOL or USDC from your wallet to the vault. Your balance is credited as soon as the transfer confirms.",
  },
  {
    title: "Trade from the vault",
    body: "Pick a coin, see the Jupiter quote and the fee, sign. The vault wallet makes the swap — the same wallet for every user.",
  },
  {
    title: "Withdraw to your wallet",
    body: "Take your coins or SOL back to the wallet you came from, whenever you want. Queued and sent with a transaction link.",
  },
];

const HIDDEN = [
  "Which wallet made which swap",
  "Your entries and exits on a coin",
  "Your bag size in a coin you hold inside the vault",
  "Your wallet's link to your trades on GMGN, Bubblemaps, Cielo",
];

const VISIBLE = [
  "Deposits and withdrawals, with their amounts",
  "Timing: a deposit right before a vault buy can be guessed",
  "Everything the vault wallet does, as one wallet",
];

export default function Home() {
  const base = baseFeeBps();
  const lowest = Math.min(base, ...feeTiers().map((t) => t.feeBps));
  const share = buybackShareBps();
  return (
    <main>
      <section className="shell grid items-center gap-10 pt-10 pb-16 sm:pt-16 lg:grid-cols-[1.15fr_0.85fr] lg:gap-10">
        <div>
          <h1 className="display text-[clamp(3rem,7.2vw,6rem)]">{SITE.hook}</h1>
          <p className="mt-6 max-w-xl text-lg text-muted sm:text-xl">{SITE.sub}</p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/app" className="btn btn-primary">Open the vault</Link>
            <Link href="/reserves" className="btn btn-quiet">See reserves</Link>
          </div>
        </div>
        <div className="mx-auto w-full max-w-[34rem]">
          <Mirror />
        </div>
      </section>

      <section className="shell">
        <div className="mb-6 max-w-2xl">
          <h2 className="h2">Same trades. No trail to you.</h2>
          <p className="mt-3 text-muted">Left is what a wallet tracker reads from chain. Right is your side, visible only when you sign in.</p>
        </div>
        <TrackerPanel />
      </section>

      <section className="shell mt-24">
        <h2 className="h2">How it works</h2>
        <ol className="mt-8 grid gap-4 md:grid-cols-3">
          {STEPS.map((step, i) => (
            <li key={step.title} className="card p-6">
              <span className="display text-4xl text-amber">{i + 1}</span>
              <h3 className="mt-4 text-lg font-semibold">{step.title}</h3>
              <p className="mt-2 text-muted">{step.body}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="shell mt-24 grid gap-4 md:grid-cols-2">
        <div className="card p-6 sm:p-8">
          <span className="pill pill-good">Hidden</span>
          <h3 className="mt-4 text-xl font-semibold">What BLINDSPOT hides</h3>
          <ul className="mt-4 space-y-2.5">
            {HIDDEN.map((t) => (
              <li key={t} className="flex gap-3"><span className="mt-2 dot" style={{ background: "var(--color-good)" }} />{t}</li>
            ))}
          </ul>
        </div>
        <div className="card p-6 sm:p-8">
          <span className="pill">Still visible</span>
          <h3 className="mt-4 text-xl font-semibold">What it doesn&apos;t</h3>
          <ul className="mt-4 space-y-2.5">
            {VISIBLE.map((t) => (
              <li key={t} className="flex gap-3"><span className="mt-2 dot" style={{ background: "var(--color-muted)" }} />{t}</li>
            ))}
          </ul>
          <p className="mt-5 text-sm text-muted">Withdrawals only return to the wallet that deposited. BLINDSPOT hides your trades, not where your money comes from.</p>
        </div>
      </section>

      <section className="shell mt-24">
        <div className="grid gap-8 rounded-[var(--radius-card)] border border-line p-6 sm:p-10 lg:grid-cols-[1fr_1.2fr]">
          <div>
            <h2 className="h2">{SITE.ticker}</h2>
            <p className="mt-3 text-muted">The vault charges {pct(base)} per swap. {pct(share)} of every fee buys {SITE.ticker} on the market, and holders pay less.</p>
            <Link href="/token" className="btn btn-quiet mt-6">Token details</Link>
          </div>
          <dl className="grid grid-cols-3 gap-3 self-center">
            {[
              [pct(base), "fee per vault swap"],
              [pct(share), `of fees buy ${SITE.ticker}`],
              [pct(lowest), "lowest fee for holders"],
            ].map(([big, small]) => (
              <div key={small} className="card p-4">
                <dt className="display text-[clamp(1.5rem,4vw,2.5rem)]">{big}</dt>
                <dd className="mt-2 text-sm text-muted">{small}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      <section className="shell mt-24 grid gap-8 lg:grid-cols-[1fr_2fr]">
        <div>
          <h2 className="h2">Straight answers</h2>
          <Link href="/faq" className="link mt-4 inline-block">All questions</Link>
        </div>
        <Faq items={FAQ.slice(0, 5)} />
      </section>
    </main>
  );
}

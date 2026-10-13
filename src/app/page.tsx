import Link from "next/link";
import { Faq } from "@/components/Faq";
import { HeroArt } from "@/components/home/HeroArt";
import { ArrowRight, CheckIcon, DepositIcon, EyeOffIcon, SwapIcon, VaultIcon, WithdrawIcon } from "@/components/icons";
import { SITE } from "@/config/site";
import { baseFeeBps, buybackShareBps, feeTiers } from "@/server/config";

const pct = (bps: number) => `${(bps / 100).toFixed(2).replace(/\.?0+$/, "")}%`;

const STEPS = [
  { n: "01", Icon: DepositIcon, title: "Deposit once", body: "Send SOL or USDC from your wallet to the shared vault." },
  { n: "02", Icon: SwapIcon, title: "Trade from the vault", body: "The vault wallet makes your swap — the same wallet for everyone." },
  { n: "03", Icon: WithdrawIcon, title: "Withdraw to you", body: "Take your coins back to your own wallet whenever you want." },
];

export default function Home() {
  const base = baseFeeBps();
  const tiers = feeTiers();
  const lowest = Math.min(base, ...tiers.map((t) => t.feeBps));
  const topTier = tiers.find((t) => t.feeBps === lowest);
  const share = buybackShareBps();

  const TOKEN = [
    { Icon: SwapIcon, big: pct(base), title: "Fee per vault swap", body: "Taken in SOL whenever SOL is one side of the trade." },
    { Icon: VaultIcon, big: pct(share), title: `Of every fee buys ${SITE.ticker}`, body: "On the market, through Jupiter. Each buyback is listed with its transaction." },
    { Icon: EyeOffIcon, big: pct(lowest), title: "Lowest fee for holders", body: topTier ? `Hold ${topTier.minTokens.toLocaleString("en-US")} ${SITE.ticker}, in your wallet or your vault balance.` : "Holders pay less." },
  ];

  return (
    <>
      <main id="top">
        {/* ───────────── hero */}
        <section className="shell relative pb-10 lg:min-h-[37.4rem] lg:pb-0">
          <div className="relative z-10 pt-8 sm:pt-12 lg:pt-[3.9rem]">
            <h1 className="display rise text-[clamp(3.05rem,13.4vw,5.6rem)] lg:text-[clamp(4.6rem,7.32vw,7.1rem)]">
              Stop getting
              <br />
              copytraded.
            </h1>
            <p className="rise mt-7 max-w-[34rem] text-[clamp(1.2rem,1.78vw,1.7rem)] leading-snug tracking-[-0.01em] lg:mt-[1.85rem]" style={{ "--delay": "80ms" } as React.CSSProperties}>
              Trade from a shared vault. Trackers see the vault, not you.
            </p>
            <div className="rise mt-7 flex flex-wrap items-center gap-x-9 gap-y-5 lg:mt-[1.6rem]" style={{ "--delay": "160ms" } as React.CSSProperties}>
              <Link href="/app" className="btn btn-amber btn-xl w-full sm:w-auto">
                <EyeOffIcon className="size-[1.9rem]" strokeWidth={1.9} />
                Open the vault
              </Link>
              <a href="#how" className="link-arrow">
                See how it works
                <ArrowRight className="size-[1.35rem]" strokeWidth={1.8} />
              </a>
            </div>
          </div>

          <HeroArt className="rise mx-auto mt-6 w-[min(112%,34rem)] max-w-none -translate-x-[6%] sm:-translate-x-0 lg:absolute lg:-top-[5.25rem] lg:-right-[1.5%] lg:mt-0 lg:w-[54.5%]" />
        </section>

        {/* ───────────── three steps */}
        <section aria-label="Steps" className="shell relative z-10 lg:mt-[2rem]">
          <ol className="grid border-t border-line md:grid-cols-3">
            {STEPS.map(({ n, Icon, title, body }, index) => (
              <li key={n} className={`flex items-start gap-5 py-7 md:py-[1.9rem] ${index > 0 ? "border-t border-line md:border-t-0 md:border-l md:pl-[3.1rem]" : ""}`}>
                <span className="mt-[0.95rem] w-7 shrink-0 text-[1.0625rem] font-extrabold">{n}</span>
                <Icon className="mt-1 h-[4.2rem] w-[3.4rem] shrink-0" strokeWidth={2.6} />
                <div className="pl-1.5">
                  <h2 className="text-[1.3125rem] leading-tight font-bold tracking-[-0.015em]">{title}</h2>
                  <p className="mt-2 max-w-[15.5rem] text-[1.0625rem] leading-snug text-muted">{body}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>
      </main>

      {/* ───────────── ink panel: how the vault hides you */}
      <section id="how" className="on-ink grain mx-[clamp(0.5rem,1.85vw,1.75rem)] mt-4 scroll-mt-4 overflow-hidden rounded-[clamp(1.75rem,3vw,2.5rem)] bg-ink text-card lg:mt-[0.9rem]">
        <div className="shell py-[clamp(3rem,5.4vw,5rem)]">
          <h2 className="display text-[clamp(2.6rem,5.75vw,5.55rem)]">
            Same trades. <br className="lg:hidden" />
            No trail to you.
          </h2>
          <p className="mt-6 max-w-[40rem] text-[clamp(1.0625rem,1.4vw,1.3125rem)] leading-relaxed text-card/80">
            Copytrade bots follow wallets. In BLINDSPOT every swap leaves from one shared vault, for every user — so a tracker sees a busy
            vault, and nothing it can pin on you.
          </p>

          <div className="mt-[clamp(2.5rem,5vw,4.5rem)] grid gap-10 md:grid-cols-[1fr_auto_1fr_auto_1fr] md:items-center md:gap-0">
            <figure>
              <div className="journey-pop mx-auto w-[min(100%,17rem)] -rotate-3 rounded-t-[14px] bg-card px-6 pt-6 pb-8 text-ink shadow-lift [clip-path:polygon(0_0,100%_0,100%_calc(100%-9px),95%_100%,90%_calc(100%-9px),85%_100%,80%_calc(100%-9px),75%_100%,70%_calc(100%-9px),65%_100%,60%_calc(100%-9px),55%_100%,50%_calc(100%-9px),45%_100%,40%_calc(100%-9px),35%_100%,30%_calc(100%-9px),25%_100%,20%_calc(100%-9px),15%_100%,10%_calc(100%-9px),5%_100%,0_calc(100%-9px))]">
                <p className="text-sm font-bold tracking-[0.14em]">YOUR WALLET</p>
                <div className="mt-4 space-y-1.5 font-mono text-[0.8125rem]">
                  <div className="flex justify-between"><span>Deposit</span><span>5 SOL</span></div>
                  <div className="flex justify-between"><span>To</span><span>Shared vault</span></div>
                  <div className="flex justify-between border-t border-dashed border-ink/40 pt-1.5 font-medium"><span>Swaps from here</span><span>0</span></div>
                </div>
              </div>
              <figcaption className="mt-6 text-center">
                <p className="text-lg font-bold">You deposit once</p>
                <p className="mt-1 text-[0.9375rem] text-card/70">SOL or USDC. This transfer is public.</p>
              </figcaption>
            </figure>

            <div aria-hidden="true" className="journey-dash mx-auto hidden h-0.5 w-[clamp(2rem,6vw,5.5rem)] md:block" />

            <figure>
              <div className="journey-pop mx-auto grid w-[min(100%,17rem)] place-items-center rounded-[24px] bg-ink-2 px-6 py-9 shadow-lift ring-1 ring-card/10" style={{ "--delay": "1.8s" } as React.CSSProperties}>
                <span className="grid size-14 place-items-center rounded-full bg-amber text-ink">
                  <CheckIcon className="size-7" strokeWidth={2.6} />
                </span>
                <p className="mt-4 text-lg font-bold">Swap sent by the vault</p>
                <p className="mt-1 text-center text-sm text-card/70">One wallet for every user&apos;s trades</p>
              </div>
              <figcaption className="mt-6 text-center">
                <p className="text-lg font-bold">The vault trades for you</p>
                <p className="mt-1 text-[0.9375rem] text-card/70">Jupiter quote and fee shown before you sign.</p>
              </figcaption>
            </figure>

            <div aria-hidden="true" className="journey-dash mx-auto hidden h-0.5 w-[clamp(2rem,6vw,5.5rem)] md:block" />

            <figure>
              <div className="journey-pop mx-auto w-[min(100%,17rem)] rotate-3 rounded-[24px] bg-amber px-6 py-6 text-ink shadow-lift" style={{ "--delay": "3.6s" } as React.CSSProperties}>
                <div className="flex items-start justify-between">
                  <EyeOffIcon className="size-7" strokeWidth={2.2} />
                  <span className="text-xs font-semibold">Your balance</span>
                </div>
                <p className="mt-5 text-[1.75rem] leading-none font-extrabold">+3.3M BONK</p>
                <p className="mt-1.5 text-sm font-medium">Held in the vault, unseen</p>
              </div>
              <figcaption className="mt-6 text-center">
                <p className="text-lg font-bold">Your bag stays yours</p>
                <p className="mt-1 text-[0.9375rem] text-card/70">Withdraw to your own wallet anytime.</p>
              </figcaption>
            </figure>
          </div>

          <ul className="mt-[clamp(2.5rem,5vw,4.5rem)] grid gap-x-10 gap-y-6 border-t border-card/15 pt-8 text-[0.9375rem] leading-relaxed text-card/75 md:grid-cols-3">
            <li>
              <strong className="block text-base text-card">Custodial, said plainly</strong>
              Funds sit in the vault wallet and our ledger keeps your balance. Check it live on the reserves page.
            </li>
            <li>
              <strong className="block text-base text-card">Hides trades, not transfers</strong>
              Your deposit and withdrawal are public transfers. Which swaps were yours is not.
            </li>
            <li>
              <strong className="block text-base text-card">Back to you, only</strong>
              Withdrawals go to the wallet that owns the account. Never to another address.
            </li>
          </ul>
        </div>
      </section>

      {/* ───────────── token */}
      <section id="token" className="shell py-[clamp(4rem,8vw,7.5rem)]">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div>
            <p className="eyebrow">The token</p>
            <h2 className="display mt-3 text-[clamp(2.3rem,4.6vw,4.2rem)]">
              Fees buy
              <br />
              {SITE.ticker}.
            </h2>
          </div>
          <p className="max-w-[27rem] text-[1.0625rem] leading-relaxed text-muted">
            Every swap made from the vault pays a fee. Part of it goes back into the token, and holding it lowers what you pay.
          </p>
        </div>
        <ul className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {TOKEN.map((item) => (
            <li key={item.title} className="card flex flex-col p-6">
              <span className="grid size-14 place-items-center rounded-2xl bg-paper">
                <item.Icon className="size-7" strokeWidth={2.4} />
              </span>
              <p className="mt-5 text-[2.75rem] leading-none font-black tracking-[-0.04em]">{item.big}</p>
              <h3 className="mt-2 text-[1.25rem] font-extrabold tracking-[-0.02em]">{item.title}</h3>
              <p className="mt-1 text-[0.9375rem] text-muted">{item.body}</p>
            </li>
          ))}
        </ul>
        <Link href="/token" className="link-arrow mt-8">
          Token details and buybacks
          <ArrowRight className="size-[1.35rem]" strokeWidth={1.8} />
        </Link>
      </section>

      {/* ───────────── FAQ */}
      <section id="faq" className="shell grid gap-10 pb-[clamp(4rem,8vw,7.5rem)] lg:grid-cols-[0.8fr_1.2fr]">
        <div>
          <p className="eyebrow">Questions</p>
          <h2 className="display mt-3 text-[clamp(2.3rem,4.6vw,4.2rem)]">
            The honest
            <br />
            answers.
          </h2>
        </div>
        <Faq />
      </section>

      {/* ───────────── closing call */}
      <section className="shell">
        <div className="grain flex flex-col items-start justify-between gap-8 rounded-[clamp(1.75rem,3vw,2.5rem)] bg-amber px-[clamp(1.5rem,5vw,4.5rem)] py-[clamp(2.25rem,5vw,4rem)] md:flex-row md:items-center">
          <h2 className="display text-[clamp(2.2rem,4.4vw,4rem)]">
            Being followed?
            <br />
            Trade in the blind spot.
          </h2>
          <Link href="/app" className="btn btn-primary btn-xl">
            Open the vault
          </Link>
        </div>
      </section>
    </>
  );
}

import Link from "next/link";
import { SITE } from "@/config/site";
import { CopyCa } from "./CopyCa";
import { Logo } from "./Logo";
import { ConnectButton } from "./wallet/ConnectButton";

const NAV = [
  { href: "/#how", label: "How it works" },
  { href: "/token", label: "Token" },
  { href: "/reserves", label: "Reserves" },
  { href: "/faq", label: "FAQ" },
];

export function SiteHeader() {
  return (
    <header className="relative z-20">
      <div className="shell flex h-[5.25rem] items-center justify-between gap-4">
        <Logo />
        <nav aria-label="Main" className="hidden items-center gap-10 text-[1.0625rem] font-medium md:flex">
          {NAV.map((item) => (
            <Link key={item.href} href={item.href} className="rounded-md underline-offset-8 hover:underline">
              {item.label}
            </Link>
          ))}
        </nav>
        <ConnectButton className="btn btn-primary btn-sm sm:min-h-[3.1rem] sm:px-[1.6rem] sm:text-base" />
      </div>
      <nav aria-label="Sections" className="shell -mt-2 flex gap-5 overflow-x-auto pb-2 text-[0.9375rem] font-medium md:hidden">
        {NAV.map((item) => (
          <Link key={item.href} href={item.href} className="whitespace-nowrap">
            {item.label}
          </Link>
        ))}
      </nav>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="shell mt-[clamp(3rem,6vw,5rem)] border-t border-line py-10">
      <div className="flex flex-wrap items-center justify-between gap-6">
        <Logo />
        <nav aria-label="Footer" className="flex flex-wrap gap-x-8 gap-y-2 text-[0.9375rem] font-medium">
          <Link href="/app" className="hover:underline">Vault</Link>
          <Link href="/reserves" className="hover:underline">Reserves</Link>
          <Link href="/token" className="hover:underline">{SITE.ticker}</Link>
          <Link href="/faq" className="hover:underline">FAQ</Link>
          <a href={`https://x.com/${SITE.xHandle}`} target="_blank" rel="noreferrer" className="hover:underline">X</a>
        </nav>
      </div>
      <div className="mt-6">
        <CopyCa />
      </div>
      <p className="mt-6 max-w-[58rem] text-[0.8125rem] leading-relaxed text-muted">
        BLINDSPOT is custodial: deposits sit in a shared vault wallet and balances are kept by our ledger. It hides which wallet made
        which trade; deposits and withdrawals stay visible on chain. Withdrawals only go back to the wallet that owns the account.
        Nothing here is investment advice. Token values can go down as well as up.
      </p>
    </footer>
  );
}

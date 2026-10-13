import Link from "next/link";
import { SITE } from "@/config/site";
import { CopyCa } from "./CopyCa";
import { LogoMark } from "./Logo";
import { ConnectButton } from "./wallet/ConnectButton";

const NAV = [
  { href: "/app", label: "Vault" },
  { href: "/reserves", label: "Reserves" },
  { href: "/token", label: "Token" },
  { href: "/faq", label: "FAQ" },
];

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-paper">
      <div className="shell flex h-16 items-center justify-between gap-3">
        <Link href="/" className="flex items-center gap-2.5">
          <LogoMark />
          <span className="display text-lg tracking-tight" style={{ lineHeight: 1 }}>{SITE.name}</span>
        </Link>
        <nav className="flex items-center gap-1 sm:gap-2">
          {NAV.map((item) => (
            <Link key={item.href} href={item.href} className="hidden rounded-full px-3 py-2 text-sm font-medium text-muted hover:text-ink md:inline">
              {item.label}
            </Link>
          ))}
          <ConnectButton className="btn btn-primary btn-sm" />
        </nav>
      </div>
      <nav className="shell flex gap-1 overflow-x-auto pb-2 md:hidden" aria-label="Sections">
        {NAV.map((item) => (
          <Link key={item.href} href={item.href} className="rounded-full border border-line px-3 py-1 text-sm font-medium text-muted">
            {item.label}
          </Link>
        ))}
      </nav>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="mt-24 border-t border-line">
      <div className="shell grid gap-8 py-10 sm:grid-cols-[1.2fr_1fr]">
        <div className="space-y-3">
          <Link href="/" className="flex items-center gap-2.5">
            <LogoMark />
            <span className="display text-lg" style={{ lineHeight: 1 }}>{SITE.name}</span>
          </Link>
          <p className="max-w-sm text-sm text-muted">{SITE.sub} Custodial: funds sit in the vault wallet and balances are kept by our ledger.</p>
          <CopyCa />
        </div>
        <div className="grid grid-cols-2 gap-2 text-sm">
          <Link href="/app" className="text-muted hover:text-ink">Vault</Link>
          <Link href="/reserves" className="text-muted hover:text-ink">Reserves</Link>
          <Link href="/token" className="text-muted hover:text-ink">{SITE.ticker}</Link>
          <Link href="/faq" className="text-muted hover:text-ink">FAQ</Link>
          <a href={`https://x.com/${SITE.xHandle}`} target="_blank" rel="noreferrer" className="text-muted hover:text-ink">X / @{SITE.xHandle}</a>
        </div>
      </div>
    </footer>
  );
}

"use client";

import { useState } from "react";
import { SITE } from "@/config/site";
import { amountText, usdText } from "@/lib/client";
import { shortAddress } from "@/lib/format";
import { ConnectButton } from "../wallet/ConnectButton";
import { signIn, walletErrorMessage } from "../wallet/store";
import { TokenIcon } from "../TokenAmount";
import { DepositForm } from "./DepositForm";
import { History } from "./History";
import { SwapForm } from "./SwapForm";
import { KNOWN, SOL, type Account } from "./types";
import { useAccount } from "./useAccount";
import { WithdrawForm } from "./WithdrawForm";

type Tab = "deposit" | "swap" | "withdraw";

function Balances({ account }: { account: Account }) {
  const rows = account.balances.length ? account.balances : [{ mint: SOL, available: "0", held: "0", out: "0", frozen: "0" }];
  const usd = rows.reduce((sum, b) => {
    const t = account.tokens[b.mint];
    if (!t?.usdPrice) return sum;
    return sum + (Number(BigInt(b.available) + BigInt(b.held)) / 10 ** t.decimals) * t.usdPrice;
  }, 0);
  return (
    <div className="card p-5 sm:p-6">
      <p className="text-sm text-muted">Vault balance</p>
      <p className="display mt-2 text-[3.25rem]">{usdText(usd)}</p>
      <p className="mt-1 text-sm text-muted">
        Signed in as <span className="mono">{shortAddress(account.wallet)}</span> · fee {account.fee.feeBps / 100}%
      </p>
      <ul className="rows mt-5">
        {rows.map((b) => {
          const t = account.tokens[b.mint] ?? KNOWN[b.mint] ?? { mint: b.mint, symbol: b.mint.slice(0, 4), decimals: 0, icon: null };
          const extra = BigInt(b.held) + BigInt(b.out);
          return (
            <li key={b.mint} className="flex items-center gap-3 py-3">
              <TokenIcon token={t} />
              <div className="min-w-0 flex-1">
                <p className="font-semibold">{t.symbol}</p>
                {extra > BigInt(0) && (
                  <p className="text-xs text-muted">
                    {BigInt(b.held) > BigInt(0) && `${amountText(b.held, t.decimals)} reserved for orders`}
                    {BigInt(b.held) > BigInt(0) && BigInt(b.out) > BigInt(0) && " · "}
                    {BigInt(b.out) > BigInt(0) && `${amountText(b.out, t.decimals)} on its way out`}
                  </p>
                )}
                {BigInt(b.frozen) > BigInt(0) && <p className="text-xs text-alert">{amountText(b.frozen, t.decimals)} not credited — contact support</p>}
              </div>
              <span className="num font-semibold">{amountText(b.available, t.decimals)}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function AppView() {
  const { account, signedIn, connected, refresh } = useAccount();
  const [tab, setTab] = useState<Tab>("deposit");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!connected || !signedIn) {
    return (
      <div className="card mx-auto max-w-lg p-6 text-center sm:p-10">
        <h1 className="display text-[clamp(2.2rem,4vw,3.2rem)]">Open your vault account</h1>
        <p className="mt-3 text-muted">
          {connected ? "Sign a message to prove this wallet is yours. It costs nothing and moves no funds." : `Connect the wallet you trade from. ${SITE.name} keeps a balance for it inside the shared vault.`}
        </p>
        <div className="mt-6 flex justify-center">
          {connected ? (
            <button
              type="button"
              className="btn btn-primary"
              disabled={busy}
              onClick={() => {
                setBusy(true);
                setError(null);
                signIn()
                  .catch((e) => setError(walletErrorMessage(e)))
                  .finally(() => setBusy(false));
              }}
            >
              {busy ? <span className="spinner" /> : "Sign in"}
            </button>
          ) : (
            <ConnectButton />
          )}
        </div>
        {error && <p className="notice notice-alert mt-4">{error}</p>}
      </div>
    );
  }

  if (!account) {
    return <div className="card p-10 text-center text-muted">Loading your vault account…</div>;
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-[1fr_1.15fr]">
        <Balances account={account} />
        <div className="card p-5 sm:p-6">
          <div className="tabs" role="tablist">
            {(["deposit", "swap", "withdraw"] as Tab[]).map((t) => (
              <button key={t} type="button" role="tab" aria-selected={tab === t} className="tab capitalize" onClick={() => setTab(t)}>
                {t}
              </button>
            ))}
          </div>
          <div className="mt-5">
            {tab === "deposit" && <DepositForm account={account} onDone={refresh} />}
            {tab === "swap" && <SwapForm account={account} onDone={refresh} />}
            {tab === "withdraw" && <WithdrawForm account={account} onDone={refresh} />}
          </div>
        </div>
      </div>
      <History account={account} onChange={refresh} />
    </div>
  );
}

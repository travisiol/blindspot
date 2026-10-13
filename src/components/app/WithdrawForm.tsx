"use client";

import { useState } from "react";
import { amountText } from "@/lib/client";
import { formatUnits, shortAddress } from "@/lib/format";
import { walletErrorMessage } from "@/components/wallet/store";
import { TokenIcon } from "../TokenAmount";
import { signedAction } from "./actions";
import { KNOWN, SOL, type Account } from "./types";

export function WithdrawForm({ account, onDone }: { account: Account; onDone: () => void }) {
  const withBalance = account.balances.filter((b) => BigInt(b.available) > BigInt(0));
  const [mint, setMint] = useState(withBalance[0]?.mint ?? SOL);
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const token = account.tokens[mint] ?? KNOWN[mint] ?? { mint, symbol: mint.slice(0, 4), decimals: 0, icon: null };
  const available = BigInt(account.balances.find((b) => b.mint === mint)?.available ?? "0");

  const submit = async () => {
    setBusy(true);
    setResult(null);
    try {
      const r = await signedAction<{ rent: string }>("withdraw", "/api/withdraw", { mint, amount });
      const rent = BigInt(r.rent ?? "0");
      setResult({ ok: true, text: `Queued. It's sent to your wallet in a few seconds — status below.${rent > BigInt(0) ? ` ${amountText(rent, 9)} SOL was used to open the token account in your wallet.` : ""}` });
      setAmount("");
      onDone();
    } catch (e) {
      setResult({ ok: false, text: walletErrorMessage(e) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      {withBalance.length === 0 ? (
        <p className="text-sm text-muted">Nothing to withdraw yet.</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {withBalance.map((b) => {
            const t = account.tokens[b.mint] ?? KNOWN[b.mint];
            return (
              <button key={b.mint} type="button" className="chip" aria-pressed={mint === b.mint} onClick={() => setMint(b.mint)}>
                <TokenIcon token={t} />
                {t?.symbol ?? b.mint.slice(0, 4)}
              </button>
            );
          })}
        </div>
      )}
      <div>
        <div className="mb-1.5 flex justify-between text-sm">
          <span className="font-medium">Amount</span>
          <button type="button" className="text-muted hover:text-ink" onClick={() => setAmount(formatUnits(available, token.decimals, token.decimals).replace(/,/g, ""))}>
            Available: <span className="num">{amountText(available, token.decimals)}</span> · Max
          </button>
        </div>
        <div className="field">
          <input inputMode="decimal" placeholder="0.0" value={amount} onChange={(e) => setAmount(e.target.value.replace(",", "."))} aria-label="Amount to withdraw" />
          <span className="pr-2 font-semibold">{token.symbol}</span>
        </div>
      </div>
      <div className="kv rounded-xl border border-line px-3 py-2.5">
        <span>To</span>
        <span className="mono">{shortAddress(account.wallet)} (this wallet)</span>
      </div>
      <p className="text-sm text-muted">Withdrawals only go back to the wallet you signed in with. The transfer is public, like your deposit.</p>
      <button type="button" className="btn btn-primary w-full" disabled={busy || !(Number(amount) > 0) || withBalance.length === 0} onClick={() => void submit()}>
        {busy ? <span className="spinner" /> : `Withdraw ${token.symbol}`}
      </button>
      {result && <p className={`notice ${result.ok ? "notice-good" : "notice-alert"}`}>{result.text}</p>}
    </div>
  );
}

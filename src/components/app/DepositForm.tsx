"use client";

import { useState } from "react";
import { explorerUrl } from "@/config/solana";
import { amountText, errorText, postJson } from "@/lib/client";
import { walletErrorMessage } from "@/components/wallet/store";
import { TokenIcon } from "../TokenAmount";
import { deposit } from "./actions";
import { KNOWN, SOL, USDC, type Account } from "./types";

export function DepositForm({ account, onDone }: { account: Account; onDone: () => void }) {
  const [mint, setMint] = useState(SOL);
  const [amount, setAmount] = useState("");
  const [stage, setStage] = useState<"idle" | "build" | "sign" | "confirm">("idle");
  const [result, setResult] = useState<{ ok: boolean; text: string; sig?: string } | null>(null);
  const [scanning, setScanning] = useState(false);
  const token = account.tokens[mint] ?? KNOWN[mint];
  const room = account.room[mint] ?? "0";

  const submit = async () => {
    setResult(null);
    setStage("build");
    try {
      const sig = await deposit(mint, amount, (s) => setStage(s));
      setResult({ ok: true, text: `Deposited ${amount} ${token.symbol}. It's in your vault balance.`, sig });
      setAmount("");
      onDone();
    } catch (e) {
      setResult({ ok: false, text: walletErrorMessage(e) });
    } finally {
      setStage("idle");
    }
  };

  const scan = async () => {
    setScanning(true);
    setResult(null);
    try {
      const { found } = await postJson<{ found: number }>("/api/deposit/claim", {});
      setResult({ ok: found > 0, text: found > 0 ? `Found and credited ${found} deposit${found > 1 ? "s" : ""}.` : "No unclaimed deposit from this wallet in the vault's recent transactions." });
      onDone();
    } catch (e) {
      setResult({ ok: false, text: errorText(e) });
    } finally {
      setScanning(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        {[SOL, USDC].map((m) => (
          <button key={m} type="button" className="chip" aria-pressed={mint === m} onClick={() => setMint(m)}>
            <TokenIcon token={account.tokens[m] ?? KNOWN[m]} />
            {KNOWN[m].symbol}
          </button>
        ))}
      </div>
      <div>
        <div className="mb-1.5 flex justify-between text-sm">
          <span className="font-medium">Amount</span>
          <span className="text-muted">You can add up to <span className="num">{amountText(room, token.decimals)}</span> {token.symbol}</span>
        </div>
        <div className="field">
          <input inputMode="decimal" placeholder="0.0" value={amount} onChange={(e) => setAmount(e.target.value.replace(",", "."))} aria-label="Amount to deposit" />
          <span className="pr-2 font-semibold">{token.symbol}</span>
        </div>
      </div>
      <p className="text-sm text-muted">
        Your wallet sends a normal transfer to the vault and pays the Solana network fee. This transfer is public: its amount and time can be seen. For the most privacy, don&apos;t trade right after depositing.
      </p>
      <button type="button" className="btn btn-primary w-full" disabled={stage !== "idle" || !(Number(amount) > 0)} onClick={() => void submit()}>
        {stage === "idle" ? `Deposit ${token.symbol}` : stage === "build" ? <span className="spinner" /> : stage === "sign" ? "Approve in your wallet…" : "Confirming on chain…"}
      </button>
      {result && (
        <p className={`notice ${result.ok ? "notice-good" : "notice-alert"}`}>
          {result.text}{" "}
          {result.sig && <a className="link" href={explorerUrl("tx", result.sig)} target="_blank" rel="noreferrer">View tx</a>}
        </p>
      )}
      <button type="button" className="text-sm text-muted underline underline-offset-4 hover:text-ink" disabled={scanning} onClick={() => void scan()}>
        {scanning ? "Looking…" : "Sent a deposit that isn't showing? Find my deposit"}
      </button>
    </div>
  );
}

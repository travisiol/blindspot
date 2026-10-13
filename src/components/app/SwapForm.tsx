"use client";

import { useEffect, useMemo, useState } from "react";
import { explorerUrl } from "@/config/solana";
import { amountText, errorText, getJson } from "@/lib/client";
import { formatUnits } from "@/lib/format";
import { walletErrorMessage } from "@/components/wallet/store";
import { TokenAmount } from "../TokenAmount";
import { signedAction } from "./actions";
import { TokenPicker } from "./TokenPicker";
import { KNOWN, SOL, USDC, type Account, type TokenInfo } from "./types";

interface Quote {
  gross: string;
  net: string;
  feeBps: number;
  baseFeeBps: number;
  fee: string;
  feeToken: { mint: string; symbol: string; decimals: number };
  userOut: string;
  minOut: string;
  priceImpactPct: number;
  usdValue: number | null;
  route: string[];
  out: { mint: string; symbol: string; decimals: number };
}

const SLIPPAGES = [50, 100, 300, 500];
const WINDOWS = [15, 30, 60, 120, 240];

export function SwapForm({ account, onDone }: { account: Account; onDone: () => void }) {
  const held = account.balances.filter((b) => BigInt(b.available) > BigInt(0)).map((b) => account.tokens[b.mint] ?? KNOWN[b.mint]).filter(Boolean) as TokenInfo[];
  const [from, setFrom] = useState<TokenInfo | null>(held[0] ?? KNOWN[SOL]);
  const [to, setTo] = useState<TokenInfo | null>(null);
  const [amount, setAmount] = useState("");
  const [slippage, setSlippage] = useState(100);
  const [split, setSplit] = useState(false);
  const [parts, setParts] = useState(4);
  const [windowMin, setWindowMin] = useState(60);
  const [quote, setQuote] = useState<{ key: string; data?: Quote; error?: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string; sig?: string | null } | null>(null);

  const available = from ? BigInt(account.balances.find((b) => b.mint === from.mint)?.available ?? "0") : BigInt(0);
  const key = from && to && /^\d*\.?\d+$/.test(amount) && Number(amount) > 0 ? `${from.mint}|${to.mint}|${amount}|${slippage}` : null;

  useEffect(() => {
    if (!key || !from || !to) return;
    const id = setTimeout(() => {
      const qs = new URLSearchParams({ in: from.mint, out: to.mint, amount, slippageBps: String(slippage) });
      getJson<Quote>(`/api/quote?${qs}`)
        .then((data) => setQuote({ key, data }))
        .catch((e) => setQuote({ key, error: errorText(e) }));
    }, 450);
    return () => clearTimeout(id);
  }, [key, from, to, amount, slippage]);

  const live = quote && quote.key === key ? quote : null;
  const tooMuch = useMemo(() => {
    if (!from || !/^\d*\.?\d+$/.test(amount)) return false;
    try {
      const [w, f = ""] = amount.split(".");
      const base = BigInt(w || "0") * BigInt(10) ** BigInt(from.decimals) + BigInt((f + "0".repeat(from.decimals)).slice(0, from.decimals) || "0");
      return base > available;
    } catch {
      return false;
    }
  }, [amount, from, available]);

  const submit = async () => {
    if (!from || !to || !live?.data) return;
    setBusy(true);
    setResult(null);
    try {
      const params = { inMint: from.mint, outMint: to.mint, amount, slippageBps: slippage, ...(split ? { parts, windowMin } : { minOut: live.data.minOut }) };
      const r = await signedAction<{ status?: string; sig?: string | null; error?: string | null; outAmount?: string | null }>(split ? "split" : "swap", "/api/swap", params, { split });
      if (split) setResult({ ok: true, text: `Split order placed: ${parts} parts over ${windowMin} minutes. Track it below.` });
      else if (r.status === "filled") setResult({ ok: true, text: `Swapped. You received ${amountText(r.outAmount ?? "0", to.decimals)} ${to.symbol}.`, sig: r.sig });
      else if (r.status === "unknown" || r.status === "executing") setResult({ ok: true, text: "Sent. Waiting for the network to confirm — your balance updates when it lands.", sig: r.sig });
      else setResult({ ok: false, text: r.error ?? "The swap did not go through. Your balance was restored." });
      setAmount("");
      onDone();
    } catch (e) {
      setResult({ ok: false, text: walletErrorMessage(e) });
    } finally {
      setBusy(false);
    }
  };

  const quick = [KNOWN[SOL], KNOWN[USDC], ...held.filter((t) => t.mint !== SOL && t.mint !== USDC)].map((t) => account.tokens[t.mint] ?? t);

  return (
    <div className="space-y-4">
      <div>
        <div className="mb-1.5 flex justify-between text-sm">
          <span className="font-medium">You sell</span>
          <button type="button" className="text-muted hover:text-ink" onClick={() => from && setAmount(formatUnits(available, from.decimals, from.decimals).replace(/,/g, ""))}>
            In vault: <span className="num">{from ? amountText(available, from.decimals) : "0"}</span> · Max
          </button>
        </div>
        <div className="field">
          <input inputMode="decimal" placeholder="0.0" value={amount} onChange={(e) => setAmount(e.target.value.replace(",", "."))} aria-label="Amount to sell" />
          <TokenPicker label="Token to sell" value={from} onChange={setFrom} quick={quick} />
        </div>
      </div>
      <div>
        <div className="mb-1.5 text-sm font-medium">You buy</div>
        <div className="field">
          <input readOnly value={live?.data ? amountText(live.data.userOut, live.data.out.decimals) : ""} placeholder="—" aria-label="Estimated amount received" />
          <TokenPicker label="Token to buy" value={to} onChange={setTo} quick={quick} />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-muted">Max slippage</span>
        {SLIPPAGES.map((s) => (
          <button key={s} type="button" className="chip" aria-pressed={slippage === s} onClick={() => setSlippage(s)}>
            {s / 100}%
          </button>
        ))}
      </div>

      <label className="flex items-start gap-3 rounded-xl border border-line p-3">
        <input type="checkbox" className="mt-1 size-4 accent-[#121316]" checked={split} onChange={(e) => setSplit(e.target.checked)} />
        <span>
          <span className="font-semibold">Split into parts</span>
          <span className="block text-sm text-muted">Random sizes at random times inside a window, so one big buy doesn&apos;t stand out.</span>
        </span>
      </label>
      {split && (
        <div className="grid grid-cols-2 gap-3">
          <label className="text-sm">
            <span className="mb-1 block text-muted">Parts: {parts}</span>
            <input type="range" min={2} max={10} value={parts} onChange={(e) => setParts(Number(e.target.value))} className="w-full accent-[#ff7a00]" />
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-muted">Window</span>
            <select className="select w-full" value={windowMin} onChange={(e) => setWindowMin(Number(e.target.value))}>
              {WINDOWS.map((w) => (
                <option key={w} value={w}>{w < 60 ? `${w} minutes` : `${w / 60} hour${w > 60 ? "s" : ""}`}</option>
              ))}
            </select>
          </label>
        </div>
      )}

      {live?.error && <p className="notice notice-alert">{live.error}</p>}
      {live?.data && from && to && (
        <div className="rounded-xl border border-line p-3">
          <div className="kv"><span>Fee ({live.data.feeBps / 100}%)</span><TokenAmount raw={live.data.fee} token={{ ...live.data.feeToken, icon: null }} /></div>
          <div className="kv"><span>{split ? "You receive, if the price holds" : "You receive"}</span><TokenAmount raw={live.data.userOut} token={to} /></div>
          {!split && <div className="kv"><span>Minimum received</span><TokenAmount raw={live.data.minOut} token={to} /></div>}
          <div className="kv"><span>Price impact</span><span className="num">{live.data.priceImpactPct < 0.01 ? "<0.01" : live.data.priceImpactPct.toFixed(2)}%</span></div>
          {live.data.route.length > 0 && <div className="kv"><span>Route</span><span className="truncate text-right">{live.data.route.join(" → ")}</span></div>}
          {live.data.feeBps < live.data.baseFeeBps && <p className="mt-1 text-xs text-good">Holder discount applied.</p>}
        </div>
      )}

      <button type="button" className="btn btn-primary w-full" disabled={busy || !live?.data || tooMuch} onClick={() => void submit()}>
        {busy ? <span className="spinner" /> : tooMuch ? "Not enough in your vault balance" : split ? `Place split order` : "Swap from the vault"}
      </button>
      <p className="text-xs text-muted">You sign a message (nothing leaves your wallet). The vault wallet sends the swap.</p>
      {result && (
        <p className={`notice ${result.ok ? "notice-good" : "notice-alert"}`}>
          {result.text}{" "}
          {result.sig && <a className="link" href={explorerUrl("tx", result.sig)} target="_blank" rel="noreferrer">View tx</a>}
        </p>
      )}
    </div>
  );
}

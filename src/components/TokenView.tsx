"use client";

import { useEffect, useState } from "react";
import { explorerUrl } from "@/config/solana";
import { SITE } from "@/config/site";
import { ago, amountText, getJson, useNow } from "@/lib/client";
import { CopyCa } from "./CopyCa";

interface TokenData {
  mint: string | null;
  coin: { marketCapUsd: number; complete: boolean; name: string | null; symbol: string | null } | null;
  feeBps: number;
  buybackShareBps: number;
  tiers: { minTokens: number; feeBps: number }[];
  buybacks: { id: string; in_mint: string; in_amount: string; out_amount: string | null; sig: string | null; created_at: string }[];
  pools: { mint: string; amount: string }[];
  treasury: string;
  tokens: Record<string, { symbol: string; decimals: number }>;
}

const KNOWN: Record<string, { symbol: string; decimals: number }> = {
  So11111111111111111111111111111111111111112: { symbol: "SOL", decimals: 9 },
  EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v: { symbol: "USDC", decimals: 6 },
};

export function TokenView() {
  const now = useNow();
  const [data, setData] = useState<TokenData | null>(null);

  useEffect(() => {
    let alive = true;
    getJson<TokenData>("/api/token").then((d) => alive && setData(d)).catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  const tok = (m: string) => data?.tokens[m] ?? KNOWN[m] ?? { symbol: m.slice(0, 4), decimals: 0 };
  const own = data?.mint ? tok(data.mint) : { symbol: SITE.ticker.slice(1), decimals: 6 };

  return (
    <div className="space-y-8">
      <div className="grid gap-4 md:grid-cols-3">
        <div className="card p-5">
          <p className="text-sm text-muted">Market cap</p>
          <p className="display mt-2 text-3xl">{data?.coin ? `$${Math.round(data.coin.marketCapUsd).toLocaleString("en-US")}` : "—"}</p>
        </div>
        <div className="card p-5">
          <p className="text-sm text-muted">Bought back so far (treasury)</p>
          <p className="display mt-2 text-3xl">{data ? amountText(data.treasury, own.decimals) : "—"}</p>
        </div>
        <div className="card p-5">
          <p className="text-sm text-muted">Waiting to buy back</p>
          <p className="mt-2 font-semibold">
            {data && data.pools.length > 0
              ? data.pools.map((p) => `${amountText(p.amount, tok(p.mint).decimals)} ${tok(p.mint).symbol}`).join(" · ")
              : "Nothing yet"}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <CopyCa full />
        {data?.mint && (
          <>
            <a className="btn btn-primary btn-sm" href={`https://pump.fun/coin/${data.mint}`} target="_blank" rel="noreferrer">Trade on pump.fun</a>
            <a className="btn btn-quiet btn-sm" href={`https://dexscreener.com/solana/${data.mint}`} target="_blank" rel="noreferrer">DexScreener</a>
          </>
        )}
      </div>

      {data?.mint && (
        <div className="card overflow-hidden">
          <iframe title={`${SITE.ticker} chart`} src={`https://dexscreener.com/solana/${data.mint}?embed=1&theme=light&info=0&trades=0`} className="h-[420px] w-full border-0" loading="lazy" />
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="card overflow-hidden">
          <h2 className="p-5 text-lg font-semibold">Fee for holders</h2>
          <table className="table border-t border-line">
            <thead>
              <tr>
                <th>Hold (wallet + vault)</th>
                <th className="text-right">Fee per swap</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Less than {data?.tiers.at(-1)?.minTokens.toLocaleString("en-US") ?? "—"}</td>
                <td className="num text-right">{data ? `${data.feeBps / 100}%` : "—"}</td>
              </tr>
              {[...(data?.tiers ?? [])].reverse().map((t) => (
                <tr key={t.minTokens}>
                  <td>{t.minTokens.toLocaleString("en-US")}+ {SITE.ticker}</td>
                  <td className="num text-right">{t.feeBps / 100}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="card overflow-hidden">
          <h2 className="p-5 text-lg font-semibold">Buybacks</h2>
          {data && data.buybacks.length === 0 ? (
            <p className="border-t border-line p-5 text-sm text-muted">No buyback yet. One runs whenever a fee pool reaches its minimum.</p>
          ) : (
            <div className="scroll-x border-t border-line">
              <table className="table">
                <thead>
                  <tr>
                    <th>Spent</th>
                    <th>Bought</th>
                    <th className="text-right">Tx</th>
                  </tr>
                </thead>
                <tbody>
                  {data?.buybacks.map((b) => (
                    <tr key={b.id}>
                      <td className="num">{amountText(b.in_amount, tok(b.in_mint).decimals)} {tok(b.in_mint).symbol}</td>
                      <td className="num">{amountText(b.out_amount ?? "0", own.decimals)} {own.symbol}</td>
                      <td className="text-right text-sm">
                        {b.sig && <a className="link" href={explorerUrl("tx", b.sig)} target="_blank" rel="noreferrer">{ago(b.created_at, now) || "tx"} ↗</a>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

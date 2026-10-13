"use client";

import { useEffect, useState } from "react";
import { explorerUrl } from "@/config/solana";
import { ago, amountText, getJson, useNow } from "@/lib/client";
import { shortAddress } from "@/lib/format";
import { TokenIcon } from "./TokenAmount";

interface Reserves {
  vault: string | null;
  checkedAt: string;
  rows: { mint: string; symbol: string; decimals: number; icon: string | null; onChain: string; owed: string; platform: string; expected: string; surplus: string }[];
}

function coverage(onChain: string, owed: string): string {
  const o = BigInt(owed);
  if (o <= BigInt(0)) return "—";
  const pct = Number((BigInt(onChain) * BigInt(10_000)) / o) / 100;
  return `${pct >= 1000 ? ">1000" : pct.toFixed(2)}%`;
}

/** Live: refreshed every 15 s. */
export function ReservesView() {
  const now = useNow();
  const [data, setData] = useState<Reserves | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    const load = () =>
      getJson<Reserves>("/api/reserves")
        .then((d) => {
          if (!alive) return;
          setData(d);
          setFailed(false);
        })
        .catch(() => alive && setFailed(true));
    void load();
    const id = setInterval(load, 15_000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  const covered = data?.rows.every((r) => !r.surplus.startsWith("-")) ?? true;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="card p-5">
          <p className="text-sm text-muted">Vault wallet</p>
          <p className="mono mt-2 text-lg">
            {data?.vault ? <a className="link" href={explorerUrl("account", data.vault)} target="_blank" rel="noreferrer">{shortAddress(data.vault)}</a> : "—"}
          </p>
        </div>
        <div className="card p-5">
          <p className="text-sm text-muted">User balances covered</p>
          <p className="mt-2 text-lg font-semibold">{data ? (covered ? "Yes, every token" : "No — see below") : "…"}</p>
        </div>
        <div className="card p-5">
          <p className="text-sm text-muted">Last read</p>
          <p className="mt-2 text-lg font-semibold">{data ? ago(data.checkedAt, now) || "just now" : failed ? "Unavailable" : "…"}</p>
        </div>
      </div>
      <div className="card overflow-hidden">
        <div className="scroll-x">
          <table className="table">
            <thead>
              <tr>
                <th>Token</th>
                <th className="text-right">Held on chain</th>
                <th className="text-right">Owed to users</th>
                <th className="text-right">Coverage</th>
                <th className="text-right">Platform (fees, buyback, ops)</th>
              </tr>
            </thead>
            <tbody>
              {!data && (
                <tr>
                  <td colSpan={5} className="text-muted">{failed ? "Couldn't read the chain right now. Retrying…" : "Reading the chain…"}</td>
                </tr>
              )}
              {data?.rows.map((r) => (
                <tr key={r.mint}>
                  <td>
                    <span className="flex items-center gap-2 font-semibold">
                      <TokenIcon token={{ mint: r.mint, symbol: r.symbol, decimals: r.decimals, icon: r.icon }} />
                      {r.symbol}
                    </span>
                  </td>
                  <td className="num text-right">{amountText(r.onChain, r.decimals)}</td>
                  <td className="num text-right">{amountText(r.owed, r.decimals)}</td>
                  <td className="text-right">
                    <span className={`pill ${r.surplus.startsWith("-") ? "pill-alert" : BigInt(r.owed) > BigInt(0) ? "pill-good" : ""}`}>{coverage(r.onChain, r.owed)}</span>
                  </td>
                  <td className="num text-right text-muted">{amountText(r.platform, r.decimals)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

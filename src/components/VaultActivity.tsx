"use client";

import { useEffect, useState } from "react";
import { explorerUrl } from "@/config/solana";
import { ago, getJson, useNow } from "@/lib/client";
import { shortAddress } from "@/lib/format";
import { TokenAmount } from "./TokenAmount";
import { KNOWN, type TokenInfo } from "./app/types";

interface Activity {
  vault: string | null;
  items: { sig: string; time: number | null; kind: "swap" | "in" | "out" | "other"; legs: { mint: string; amount: string }[] }[];
  tokens: Record<string, { symbol: string; decimals: number; icon: string | null }>;
}

const KIND: Record<string, string> = { swap: "Swap", in: "Transfer in", out: "Transfer out", other: "Other" };

/** The vault's latest on-chain transactions — exactly what a wallet tracker reads. */
export function VaultActivity() {
  const now = useNow();
  const [activity, setActivity] = useState<Activity | null>(null);

  useEffect(() => {
    let alive = true;
    const load = () =>
      getJson<Activity>("/api/activity")
        .then((a) => alive && setActivity(a))
        .catch(() => alive && setActivity({ vault: null, items: [], tokens: {} }));
    void load();
    const id = setInterval(load, 30_000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  const token = (mint: string): TokenInfo => {
    const t = activity?.tokens[mint];
    return t ? { mint, symbol: t.symbol, decimals: t.decimals, icon: t.icon } : (KNOWN[mint] ?? { mint, symbol: mint.slice(0, 4), decimals: 0, icon: null });
  };

  return (
    <div className="card overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 p-6">
        <div>
          <h2 className="text-[1.375rem] font-extrabold tracking-[-0.02em]">What trackers see</h2>
          <p className="mt-1 text-[0.9375rem] text-muted">The vault wallet&apos;s latest transactions, read on chain. Every swap is the vault&apos;s — none is tied to a user.</p>
        </div>
        <span className="pill">Public</span>
      </div>
      <ul className="rows border-t border-line">
        {activity === null && <li className="px-6 py-4 text-muted">Reading the chain…</li>}
        {activity?.items.length === 0 && <li className="px-6 py-4 text-muted">No vault activity yet.</li>}
        {activity?.items.map((item) => (
          <li key={item.sig} className="flex items-center justify-between gap-4 px-6 py-3.5">
            <div className="min-w-0">
              <p className="font-semibold">
                <span className="mono font-normal text-muted">{activity.vault ? shortAddress(activity.vault) : "Vault"}</span> · {KIND[item.kind]}
              </p>
              <p className="flex flex-wrap gap-x-3 text-[0.9375rem] text-muted">
                {item.legs.map((leg) => (
                  <TokenAmount key={leg.mint} raw={leg.amount} token={token(leg.mint)} signed />
                ))}
              </p>
            </div>
            <a className="link shrink-0 text-sm" href={explorerUrl("tx", item.sig)} target="_blank" rel="noreferrer">
              {ago(item.time, now) || "tx"} ↗
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}

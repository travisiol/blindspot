"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { explorerUrl } from "@/config/solana";
import { ago, getJson, useNow } from "@/lib/client";
import { shortAddress } from "@/lib/format";
import { TokenAmount } from "./TokenAmount";
import { useAccount } from "./app/useAccount";
import { KNOWN, type TokenInfo } from "./app/types";
import { ConnectButton } from "./wallet/ConnectButton";
import { signIn } from "./wallet/store";

interface Activity {
  vault: string | null;
  items: { sig: string; time: number | null; kind: "swap" | "in" | "out" | "other"; legs: { mint: string; amount: string }[] }[];
  tokens: Record<string, { symbol: string; decimals: number; icon: string | null }>;
}

const KIND: Record<string, string> = { swap: "Swap", in: "Transfer in", out: "Transfer out", other: "Other" };

/** Left: the vault's real on-chain activity. Right: your own trades, only visible to you. */
export function TrackerPanel() {
  const now = useNow();
  const [activity, setActivity] = useState<Activity | null>(null);
  const { account, signedIn, connected } = useAccount();

  useEffect(() => {
    let alive = true;
    const load = () => getJson<Activity>("/api/activity").then((a) => alive && setActivity(a)).catch(() => alive && setActivity({ vault: null, items: [], tokens: {} }));
    void load();
    const id = setInterval(load, 30_000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  const token = (mint: string): TokenInfo => {
    const t = activity?.tokens[mint] ?? account?.tokens[mint];
    return t ? { mint, symbol: t.symbol, decimals: t.decimals, icon: t.icon } : (KNOWN[mint] ?? { mint, symbol: mint.slice(0, 4), decimals: 0, icon: null });
  };

  const mine = (account?.orders ?? []).filter((o) => o.status === "filled" || o.status === "open" || o.kind === "split").slice(0, 6);

  return (
    <div className="card grid overflow-hidden md:grid-cols-2">
      <div className="public-feed border-b border-line p-5 sm:p-7 md:border-r md:border-b-0">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-lg font-semibold">What trackers see</h3>
          <span className="pill">Public</span>
        </div>
        <p className="mt-1 text-sm text-muted">
          The vault wallet&apos;s latest transactions, read on chain.
          {activity?.vault && (
            <>
              {" "}
              <a className="link mono" href={explorerUrl("account", activity.vault)} target="_blank" rel="noreferrer">{shortAddress(activity.vault)}</a>
            </>
          )}
        </p>
        <ul className="rows mt-4">
          {activity === null && <li className="py-3 text-sm text-muted">Reading the chain…</li>}
          {activity?.items.length === 0 && <li className="py-3 text-sm text-muted">No vault activity yet.</li>}
          {activity?.items.slice(0, 7).map((item) => (
            <li key={item.sig} className="flex items-center justify-between gap-3 py-2.5 text-sm">
              <div className="min-w-0">
                <p className="font-medium">
                  <span className="mono text-muted">{activity.vault ? shortAddress(activity.vault) : "Vault"}</span> · {KIND[item.kind]}
                </p>
                <p className="flex flex-wrap gap-x-2 text-muted">
                  {item.legs.map((leg) => (
                    <span key={leg.mint} className={leg.amount.startsWith("-") ? "" : "text-ink"}>
                      <TokenAmount raw={leg.amount} token={token(leg.mint)} signed />
                    </span>
                  ))}
                </p>
              </div>
              <a className="shrink-0 text-xs text-muted hover:text-ink" href={explorerUrl("tx", item.sig)} target="_blank" rel="noreferrer">
                {ago(item.time, now) || "tx"} ↗
              </a>
            </li>
          ))}
        </ul>
      </div>

      <div className="p-5 sm:p-7">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-lg font-semibold">What you did</h3>
          <span className="pill pill-amber">Only you</span>
        </div>
        <p className="mt-1 text-sm text-muted">Your own trades from the vault. Nobody else sees this side.</p>
        {!connected && (
          <div className="mt-6 space-y-3">
            <p className="text-sm">Connect your wallet to see your trades here.</p>
            <ConnectButton className="btn btn-primary btn-sm" />
          </div>
        )}
        {connected && !signedIn && (
          <div className="mt-6 space-y-3">
            <p className="text-sm">Sign a message to open your account. It moves nothing.</p>
            <button type="button" className="btn btn-primary btn-sm" onClick={() => void signIn().catch(() => {})}>Sign in</button>
          </div>
        )}
        {signedIn && (
          <ul className="rows mt-4">
            {account === null && <li className="py-3 text-sm text-muted">Loading…</li>}
            {account && mine.length === 0 && (
              <li className="py-3 text-sm text-muted">
                No trades yet. <Link className="link text-ink" href="/app">Open the vault</Link>
              </li>
            )}
            {mine.map((o) => (
              <li key={o.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                <div className="min-w-0">
                  <p className="font-medium">{o.kind === "split" ? `Split swap · ${o.parts} parts` : "Swap"}</p>
                  <p className="flex flex-wrap gap-x-2 text-muted">
                    <TokenAmount raw={`-${o.in_amount}`} token={token(o.in_mint)} />
                    <span>→</span>
                    {o.out_amount ? <TokenAmount raw={o.out_amount} token={token(o.out_mint)} signed /> : <span>{token(o.out_mint).symbol}</span>}
                  </p>
                </div>
                <span className="shrink-0 text-xs text-muted">{ago(o.created_at, now)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

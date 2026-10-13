"use client";

import { useState } from "react";
import { explorerUrl } from "@/config/solana";
import { ago, inText, toMs, useNow } from "@/lib/client";
import { walletErrorMessage } from "@/components/wallet/store";
import { TokenAmount } from "../TokenAmount";
import { signedAction } from "./actions";
import { KNOWN, type Account, type Order, type TokenInfo } from "./types";

const STATUS: Record<string, { text: string; tone: string }> = {
  filled: { text: "Filled", tone: "pill-good" },
  sent: { text: "Sent", tone: "pill-good" },
  credited: { text: "Credited", tone: "pill-good" },
  open: { text: "Running", tone: "pill-amber" },
  scheduled: { text: "Scheduled", tone: "" },
  ready: { text: "Sending", tone: "pill-amber" },
  executing: { text: "Sending", tone: "pill-amber" },
  unknown: { text: "Confirming", tone: "pill-amber" },
  queued: { text: "Queued", tone: "pill-amber" },
  sending: { text: "Sending", tone: "pill-amber" },
  failed: { text: "Failed", tone: "pill-alert" },
  cancelled: { text: "Cancelled", tone: "" },
  cancelling: { text: "Cancelling", tone: "" },
  held: { text: "On hold", tone: "pill-alert" },
  frozen: { text: "Not credited", tone: "pill-alert" },
};

function Status({ s }: { s: string }) {
  const v = STATUS[s] ?? { text: s, tone: "" };
  return <span className={`pill ${v.tone}`}>{v.text}</span>;
}

function TxLink({ sig }: { sig: string | null }) {
  return sig ? <a className="link text-sm" href={explorerUrl("tx", sig)} target="_blank" rel="noreferrer">tx ↗</a> : <span className="text-sm text-muted">—</span>;
}

type Row = { at: string; key: string; node: React.ReactNode };

export function History({ account, onChange }: { account: Account; onChange: () => void }) {
  const now = useNow();
  const [cancelling, setCancelling] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const t = (mint: string): TokenInfo => account.tokens[mint] ?? KNOWN[mint] ?? { mint, symbol: mint.slice(0, 4), decimals: 0, icon: null };

  const cancel = async (o: Order) => {
    setCancelling(o.id);
    setError(null);
    try {
      await signedAction("cancel", "/api/split/cancel", { orderId: o.id });
      onChange();
    } catch (e) {
      setError(walletErrorMessage(e));
    } finally {
      setCancelling(null);
    }
  };

  const rows: Row[] = [
    ...account.deposits.map((d) => ({
      at: d.created_at,
      key: `d${d.sig}${d.mint}`,
      node: (
        <>
          <td className="font-medium">Deposit</td>
          <td>
            <TokenAmount raw={d.amount} token={t(d.mint)} />
            {BigInt(d.refunded) > BigInt(0) && <span className="block text-xs text-muted">Over the cap: <TokenAmount raw={d.refunded} token={t(d.mint)} /> sent back</span>}
          </td>
          <td><Status s={d.status} /></td>
          <td><TxLink sig={d.sig} /></td>
        </>
      ),
    })),
    ...account.withdrawals.map((w) => ({
      at: w.created_at,
      key: `w${w.id}`,
      node: (
        <>
          <td className="font-medium">{w.kind === "refund" ? "Refund" : "Withdraw"}</td>
          <td>
            <TokenAmount raw={w.amount} token={t(w.mint)} />
            {w.error && <span className="block text-xs text-muted">{w.error}</span>}
          </td>
          <td><Status s={w.status} /></td>
          <td><TxLink sig={w.sig} /></td>
        </>
      ),
    })),
    ...account.orders.map((o) => {
      const parts = o.children ?? [];
      const filled = parts.filter((c) => c.status === "filled");
      const got = filled.reduce((s, c) => s + BigInt(c.out_amount ?? "0"), BigInt(0));
      const next = parts.find((c) => c.status === "scheduled");
      return {
        at: o.created_at,
        key: `o${o.id}`,
        node: (
          <>
            <td className="font-medium">{o.kind === "split" ? `Split · ${filled.length}/${o.parts}` : "Swap"}</td>
            <td>
              <span className="flex flex-wrap items-center gap-x-2">
                <TokenAmount raw={o.in_amount} token={t(o.in_mint)} />
                <span className="text-muted">→</span>
                {o.kind === "split" ? (got > BigInt(0) ? <TokenAmount raw={got} token={t(o.out_mint)} /> : <span>{t(o.out_mint).symbol}</span>) : o.out_amount ? <TokenAmount raw={o.out_amount} token={t(o.out_mint)} /> : <span>{t(o.out_mint).symbol}</span>}
              </span>
              {o.error && o.status === "failed" && <span className="block text-xs text-muted">{o.error}</span>}
              {next && <span className="block text-xs text-muted">Next part {inText(next.scheduled_at, now)}</span>}
            </td>
            <td><Status s={o.status} /></td>
            <td>
              {o.kind === "split" ? (
                next ? (
                  <button type="button" className="text-sm text-muted underline underline-offset-4 hover:text-ink" disabled={cancelling === o.id} onClick={() => void cancel(o)}>
                    {cancelling === o.id ? "…" : "Cancel rest"}
                  </button>
                ) : (
                  <span className="flex flex-wrap gap-2">{filled.slice(0, 3).map((c) => <TxLink key={c.id} sig={c.sig} />)}</span>
                )
              ) : (
                <TxLink sig={o.sig} />
              )}
            </td>
          </>
        ),
      };
    }),
  ].sort((a, b) => toMs(b.at) - toMs(a.at));

  return (
    <div className="card overflow-hidden">
      <div className="flex items-center justify-between p-5">
        <h2 className="text-lg font-semibold">History</h2>
        <span className="text-sm text-muted">Only visible to you</span>
      </div>
      {error && <p className="notice notice-alert mx-5 mb-3">{error}</p>}
      {rows.length === 0 ? (
        <p className="border-t border-line p-5 text-sm text-muted">Nothing yet. Deposits, swaps and withdrawals show up here.</p>
      ) : (
        <div className="scroll-x border-t border-line">
          <table className="table">
            <thead>
              <tr>
                <th>Type</th>
                <th>Details</th>
                <th>Status</th>
                <th>Tx</th>
                <th className="text-right">When</th>
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, 40).map((r) => (
                <tr key={r.key}>
                  {r.node}
                  <td className="text-right text-sm whitespace-nowrap text-muted">{ago(r.at, now)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

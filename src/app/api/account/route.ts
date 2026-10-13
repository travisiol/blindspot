import { after } from "next/server";
import { json, route } from "@/server/api";
import { SOL_MINT, USDC_MINT } from "@/server/config";
import { depositRoom } from "@/server/deposits";
import { feeFor } from "@/server/fees";
import { runJobs } from "@/server/jobs";
import { tokenMetas, usdPrices } from "@/server/jupiter";
import { acct, balances } from "@/server/ledger";
import { listOrders } from "@/server/orders";
import { requireSession } from "@/server/session";
import { listWithdrawals } from "@/server/withdrawals";

export const maxDuration = 60;

/** The signed-in wallet's vault account: balances, limits, fee and history. */
export async function GET(request: Request) {
  return route(request, { name: "account", limit: 90 }, async ({ db }) => {
    const wallet = await requireSession();
    after(() => runJobs(db, { budgetMs: 35_000 }));
    const [spendable, held, out, frozen, orders, withdrawals, deposits, fee, roomSol, roomUsdc] = await Promise.all([
      balances(db, acct.user(wallet)),
      balances(db, acct.hold(wallet)),
      balances(db, acct.out(wallet)),
      balances(db, acct.frozen(wallet)),
      listOrders(db, wallet),
      listWithdrawals(db, wallet),
      db.query("SELECT sig, mint, amount::text, credited::text, refunded::text, status, created_at::text FROM deposits WHERE wallet = $1 ORDER BY created_at DESC LIMIT 30", [wallet]),
      feeFor(db, wallet),
      depositRoom(db, wallet, SOL_MINT),
      depositRoom(db, wallet, USDC_MINT),
    ]);
    const mints = [...new Set([SOL_MINT, ...spendable.keys(), ...held.keys(), ...out.keys(), ...frozen.keys(), ...orders.flatMap((o) => [o.in_mint, o.out_mint]), ...withdrawals.map((w) => w.mint)])];
    const [metas, prices] = await Promise.all([tokenMetas(mints), usdPrices(mints)]);
    const tokens = Object.fromEntries(
      mints.map((m) => {
        const meta = metas.get(m);
        return [m, { mint: m, symbol: meta?.symbol ?? m.slice(0, 4), name: meta?.name ?? "", decimals: meta?.decimals ?? (m === SOL_MINT ? 9 : 0), icon: meta?.icon ?? null, usdPrice: prices.get(m) ?? null }];
      }),
    );
    const rows = [...new Set([...spendable.keys(), ...held.keys(), ...out.keys(), ...frozen.keys()])].map((mint) => ({
      mint,
      available: spendable.get(mint) ?? BigInt(0),
      held: held.get(mint) ?? BigInt(0),
      out: out.get(mint) ?? BigInt(0),
      frozen: frozen.get(mint) ?? BigInt(0),
    }));
    return json({
      wallet,
      balances: rows,
      tokens,
      fee,
      room: { [SOL_MINT]: roomSol.room, [USDC_MINT]: roomUsdc.room },
      orders,
      withdrawals,
      deposits,
    });
  });
}

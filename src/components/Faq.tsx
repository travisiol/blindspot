import { SITE } from "@/config/site";

export const FAQ: { q: string; a: string }[] = [
  {
    q: "Do you hold my money?",
    a: "Yes. BLINDSPOT is custodial: funds sit in the vault wallet and your balance is tracked by our ledger. Not trustless. The /reserves page shows the vault's on-chain balances next to what the ledger owes, token by token, refreshed live.",
  },
  {
    q: "What does BLINDSPOT hide?",
    a: "The link between your wallet and your trades. Every swap is sent by the vault wallet, for every user. GMGN, Bubblemaps, Cielo or a copytrade bot can follow the vault, but nothing on chain says which of its swaps was yours.",
  },
  {
    q: "What does it not hide?",
    a: "Your deposits and withdrawals: a transfer from your wallet to the vault, or back, is public like any transfer, with its amount and time. Timing patterns too: if you deposit and the vault buys a coin a second later, someone watching can guess. Use split orders and don't trade right after a deposit if that matters to you.",
  },
  {
    q: "Can I withdraw to a different wallet?",
    a: "No. Withdrawals only go back to the wallet that owns the account. BLINDSPOT keeps your trades private; it does not launder where money came from or where it goes.",
  },
  {
    q: "What is a split order?",
    a: "Your order is cut into 2 to 10 parts of random size, each sent at a random time inside the window you pick (5 minutes to 4 hours). The amount is reserved from your balance when you place it; parts that have not run can be cancelled.",
  },
  {
    q: "What does it cost?",
    a: `0.5% of each swap made from the vault (less if you hold ${SITE.ticker}). Half of all fees buys ${SITE.ticker} on the market. Deposits are free apart from the Solana network fee your wallet pays. Withdrawals are free, except 0.00204 SOL when your wallet needs a new token account for that coin (the rent Solana charges to open it).`,
  },
  {
    q: "How are swaps executed?",
    a: "Through Jupiter. You see the quote before signing: what you sell, the fee, what you should receive and the minimum. You sign a message (it moves nothing from your wallet), then the vault sends the swap. If the price moved below the minimum you signed, nothing is sent and your balance is untouched.",
  },
  {
    q: "Are there limits?",
    a: "Yes: a cap per deposit and per account, shown in the app. A deposit above the cap is credited up to the cap and the rest is sent straight back to your wallet. Wallets on the OFAC sanctions list can't use BLINDSPOT.",
  },
  {
    q: "Is this zero-knowledge?",
    a: "No. There is no zero-knowledge proof and no on-chain program. Privacy comes from sharing one wallet, and safety depends on the operator. Keep in the vault only what you are trading.",
  },
];

export function Faq({ items = FAQ }: { items?: { q: string; a: string }[] }) {
  return (
    <div className="faq">
      {items.map((item) => (
        <details key={item.q}>
          <summary>{item.q}</summary>
          <p>{item.a}</p>
        </details>
      ))}
    </div>
  );
}

import type { Metadata } from "next";
import { ReservesView } from "@/components/ReservesView";
import { VaultActivity } from "@/components/VaultActivity";

export const metadata: Metadata = { title: "Reserves" };

export default function ReservesPage() {
  return (
    <main className="shell pt-10 sm:pt-14">
      <p className="eyebrow">Proof of reserves</p>
      <h1 className="display mt-3 text-[clamp(2.6rem,5.75vw,5.2rem)]">Reserves</h1>
      <p className="mt-3 max-w-2xl text-muted">
        BLINDSPOT is custodial, so you should be able to check it. This page reads the vault wallet&apos;s balances on chain, token by token, and puts
        them next to what our ledger owes users (spendable balances, amounts reserved for split orders, and withdrawals on their way out).
      </p>
      <div className="mt-8">
        <ReservesView />
      </div>
      <div className="mt-10">
        <VaultActivity />
      </div>
      <div className="mt-8 max-w-2xl space-y-3 text-sm text-muted">
        <p>
          <strong className="text-ink">Coverage</strong> is held on chain ÷ owed to users. Below 100% means the vault holds less than it owes for that
          token.
        </p>
        <p>
          <strong className="text-ink">Platform</strong> is the ledger&apos;s own share: fees kept, fees waiting to buy back the token, bought tokens, minus
          network fees and rent the vault has paid. It can be negative for SOL: the operator tops the vault up for gas.
        </p>
      </div>
    </main>
  );
}

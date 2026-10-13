# Reference sites (checked 2026-10-13)

**veilit.xyz ($VEIL)**: loaded via WebFetch. Sections: nav (How it works / Privacy / Protocol / Docs / Security / Compliance + "Open app"), ZK-labelled hero with "Solana mainnet, live, audited" badge, token CA strip + Chrome-extension countdown, 5-step flow (exposed → shield → sealed → trade → exit), hidden-vs-public table, protocol stats + 4 cards (client, program, relay, disclosure), roadmap, 3-step onboarding (Phantom → unlock vault → shield/send/trade/earn), extension block, footer with audit badge.
- Flows: one approval deposits into a shared vault; balances become encrypted notes; trades settle in batches signed by a relayer; exit goes to a fresh address in round amounts.
- Claims: keys never leave the browser, "0 secrets on our servers", Groth16 proofs verified on-chain, relayers pay fees. Never says custodial/non-custodial. No fee figures. No $VEIL utility explained.

**visionswap.net ($VSWAP)**: WebFetch got only the title (client-rendered SPA). I read the structure from its public JS bundle (curl, read-only). Nav: How it works, Exposure check (/check), Fees, Tokenomics, Docs, Support, plus a pay page. Hero: "non-custodial, zero-knowledge, works with any wallet or no wallet (QR)", animated "eyes" scene that toggles with shield state, tutorial video with chapters (Connect, Shield, Privacy, Buy, Sell, Send, Extras), 3 steps "shield / blend / spend", SVG pool diagram, fees, tokenomics, trust/compliance, FAQ.
- Flows: shield SOL into a pool (sealed notes) → buy/sell from a fresh "Vision wallet", relayer pays gas → send/withdraw to any address. Pro orders: scale-out, stop-loss/trailing, DCA.
- Claims: non-custodial, ZK program pays only against a valid proof, open-source program/circuits/relayer, sanctioned wallets refused at deposit, nobody can freeze. FAQ admits what stays visible: deposit and amount, withdrawal, amount, destination.
- Fees: 0.8% per shield and per send/buy/sell + ≈0.002 SOL network/relayer. Jupiter routing. Token: holder cashback on fees, 50% of revenue buys $VSWAP, buybacks burned.

**Patterns worth matching for BLINDSPOT**
- An explicit "what trackers still see / what they don't" table (both sites have one). It fits our honest custodial stance well.
- A free "Exposure check": paste a wallet, see how copytradeable it is. This is the strongest hook to borrow.
- Fees shown as 3 big numbers, plus a plain line that swaps route through Jupiter.
- Numbered 3-step flow + a single diagram of money entering the vault and leaving it.
- FAQ that answers "do you hold my money?" head-on. Ours says yes, custodial, and explains why.
- Positioning gap: both lead with ZK/non-custodial. We are custodial and cheaper (0.5% vs 0.8%), and withdrawals go only back to the source wallet. So we must not borrow their ZK or "nobody can freeze" language.

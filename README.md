# BLINDSPOT — “Stop getting copytraded.”

Trade from a shared vault. Trackers see the vault, not you.

Users deposit SOL or USDC from their wallet into one vault wallet. Their balance lives in a double-entry ledger
(Postgres). Every swap is a Jupiter swap **sent by the vault wallet**, for every user, so GMGN / Bubblemaps / Cielo /
copytrade bots can follow the vault but cannot tell whose swap is whose. Withdrawals go back **only to the wallet that
owns the account**.

Next 16 + React 19 + Tailwind 4, `@solana/web3.js` 1.98, Postgres (`pg`) with a PGlite fallback for local dev. Port 3709.

## Design decisions to know

- **Custodial, not trustless.** No Anchor program, no zero-knowledge. The site says so (FAQ, footer, /reserves).
- **Not a mixer.** The brief allowed withdrawing to any address (a fresh wallet generated in the browser) after a delay.
  I left that out on purpose: deposit → shared pool → withdraw to an unrelated address is exactly what a custodial
  mixer does, and that is the legal risk flagged in the brief (operators of such services have been prosecuted for
  unlicensed money transmission and laundering). The product promise — your *trades* can't be tied to your wallet —
  holds without it. Deposits and withdrawals stay visible on chain, and the FAQ says so.
- **Regulation.** Even without a fresh-address exit, holding user funds and trading for them can fall under money
  transmission / custody rules depending on the jurisdiction. That is the owner's call; nothing in the code decides it.

## How it works (code map)

| Piece | Files |
|---|---|
| Ledger: journal + postings, sums to zero per mint, idempotent `ref`, per-wallet advisory lock | `src/server/ledger.ts`, `src/server/db.ts` |
| Deposit: server builds the transfer, the wallet signs & sends, the server reads the tx back and credits what the vault actually received (fee payer must be the wallet). Over-cap excess is credited then refunded automatically; sanctioned senders are frozen | `src/server/deposits.ts`, `/api/deposit`, `/api/deposit/claim` |
| Swap: input moved `user → hold`, live Jupiter quote, minimum check against what the user signed, vault signs the Jupiter tx, settlement from the tx's own pre/post balances. Fee 0.5 % (from the SOL side when possible), half to the buyback pool | `src/server/orders.ts`, `src/server/vaulttx.ts`, `/api/quote`, `/api/swap` |
| Split: 2–10 parts of random size at random times inside 5 min–4 h; cancel the rest anytime | `orders.ts` (`createSplitOrder`, `runDueParts`, `cancelSplit`) |
| Withdraw: queued `user → out`, claimed once, signature stored **before** sending, settled or refunded from the chain's answer; token-account rent charged to the user only when their wallet needs a new one | `src/server/withdrawals.ts`, `/api/withdraw` |
| Every write = sign-in session + a fresh signed message (server-built text, nonce, 2-min expiry, spent once) | `src/server/auth.ts`, `src/lib/intent-message.ts`, `src/server/intents.ts`, `/api/intent` |
| OFAC screening (SDN Solana list, cached 6 h, fail-closed for deposits, withdrawals wait) | `src/server/sanctions.ts` |
| Rate limits per IP per route, kept in Postgres | `src/server/ratelimit.ts`, `src/server/api.ts` |
| Buyback of $BLINDSPOT through Jupiter, one swap per pass, each listed with its tx | `src/server/buyback.ts`, `/token` |
| Reserves: vault balances read on chain vs what the ledger owes, token by token | `src/server/public-data.ts`, `/reserves` |
| “What trackers see”: the vault's real latest transactions | `public-data.ts`, home page |
| Background work without loops: `after()` on account reads/writes + `GET /api/cron/run` | `src/server/jobs.ts` |

## Environment

See `.env.example`. The ones that matter:

| Var | |
|---|---|
| `VAULT_SECRET_KEY` | The vault wallet (server only). Empty = deposits/trading/withdrawals answer “opens soon”. Fund it with a little SOL for gas (network fees + token-account rent are paid by the vault and booked to `ops`). |
| `DATABASE_URL` | **Required on Vercel.** Without it the ledger is PGlite in memory on Vercel = lost on every cold start. |
| `SOLANA_RPC_URL` | A keyed RPC. The public one rate-limits `getTransaction` (deposit claims, activity feed). |
| `CRON_SECRET` | Bearer token for `/api/cron/run`. |
| `NEXT_PUBLIC_MINT` | $BLINDSPOT once launched (enables the CA, holder tiers and buybacks). |
| `FEE_BPS`, `FEE_TIERS`, `BUYBACK_SHARE_BPS`, `BUYBACK_MIN_USD`, `CAP_*` | Fees, tiers, buyback, deposit caps. |

## Deploy (Vercel)

Import the repo as is (it is a single Next app at the root). Add the env vars above. `vercel.json` declares a daily
cron on `/api/cron/run` (Hobby allows daily only). Split orders and the withdrawal queue need it **every minute**: on
Hobby, point any external cron (cron-job.org, GitHub Actions…) at
`GET https://<site>/api/cron/run` with `Authorization: Bearer <CRON_SECRET>`. Without it, work still advances whenever
a signed-in user loads `/app` (`after()`), but scheduled parts can run late.

## Commands

```
npm run dev                 # next dev -p 3709
npm test                    # 28 node tests: ledger, deposits, swaps, splits, withdrawals, intents, reserves, sanctions
npx eslint . && npx tsc --noEmit
npx next build && npm run play   # headless Chrome, stub wallet, fake RPC + real Jupiter: 24 checks
node scripts/capture.mjs http://localhost:3709 [home,app,reserves,token,faq]   # screenshots in shots/
```

## Proven / not proven

Proven (tests + `npm run play`, 2026-10-13): sign-in; deposit built by the server, signed and sent by the wallet,
read back and credited once; live Jupiter quote with fee and minimum; signed swap intent → Jupiter tx built for the
vault, signed by the vault, rejected at preflight (unfunded vault) → balance restored, no tx link; split placed,
reserved, cancelled; withdrawal queued, sent, received on chain; forged signature refused; reserves and the public
feed read from chain.

Not proven: a **real mainnet swap** settling from a funded vault (the settlement math is tested on synthetic balance
deltas, not on a landed Jupiter transaction); USDC deposits through a real wallet; Token-2022 withdrawals; buybacks
(no mint yet). Do one small swap and one withdrawal with a few dollars before announcing.

## Brand kit

`brand/`: names (domains, X handles, ticker checks), 3 X posts, logo and banner prompts, notes on veilit.xyz and
visionswap.net.

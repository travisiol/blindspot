# BLINDSPOT — names, domains, handles, ticker

All checks run on **2026-10-13** (~12:50 UTC). Raw outcomes only; nothing below is assumed.

Method
- Domains: `https://rdap.org/domain/<d>` (404 from the registry = likely free; 200 = registered), then a DNS NS lookup against 1.1.1.1 (NXDOMAIN = no delegation). The first pass hit HTTP 429 (rate limit) on five domains; they were re-queried with a delay and the results below are from the retry.
- X handles: `https://api.x.com/i/users/username_available.json?username=<h>` (endpoint answered HTTP 200 every time). It reports suspended/reserved handles as "taken" and does not guarantee signup will succeed.
- Ticker: pump.fun `frontend-api-v3.pump.fun/coins/search-v2` (the `/coins/search` path in the brief returns **404 "Cannot GET"**, so search-v2 was used), GMGN `gmgn.ai/vas/api/v1/search_v3?chain=sol` (the `/defi/quotation/v1/tokens/sol/search` path in the brief returns a **Cloudflare challenge**, so not usable), DexScreener `latest/dex/search`.

## Domains

| Domain | RDAP | DNS (NS) | Verdict |
|---|---|---|---|
| **blindspot.trade** | 404 (rdap.nic.trade) | NXDOMAIN | **Likely free** — first choice |
| blindspot.cash | 404 (Identity Digital) | NXDOMAIN | Likely free |
| blindspot.exchange | 404 | NXDOMAIN | Likely free |
| **blindspotvault.com** | 404 | NXDOMAIN | **Likely free** — the only free .com found |
| blindspotvault.xyz | 404 | NXDOMAIN | Likely free |
| blindspotvault.app | 404 | NXDOMAIN | Likely free |
| useblindspot.xyz | 404 | NXDOMAIN | Likely free |
| useblindspot.app | 404 | NXDOMAIN | Likely free |
| getblindspot.xyz | 404 | NXDOMAIN | Likely free |
| blindspot.com | 200 | delegated | Taken |
| blindspot.fun | 200 | ns1/ns2.nameshift.com | Taken (Nameshift = resale marketplace, probably for sale) |
| blindspot.xyz | 200 | ns1/ns2.afternic.com | Taken (Afternic = for sale listing) |
| blindspot.app | 200 | ns1/ns2.afternic.com | Taken (Afternic = for sale listing) |
| blindspot.finance | 200 | dns-parking.com | Taken (parked) |
| blindspot.money | 200 | domaincontrol.com (GoDaddy) | Taken |
| useblindspot.com | 200 | registrar-servers.com (Namecheap) | Taken |
| getblindspot.com | 200 | AWS Route 53 | Taken (looks in active use) |
| tradeblindspot.com | 200 | domaincontrol.com | Taken |
| blindspotsol.com | 200 | domaincontrol.com | Taken |
| blindspot.so | rdap.org: "No RDAP service is available" | registrar-servers.com | Taken (has live NS delegation) |
| blindspot.io | rdap.org: "No RDAP service is available" | no NXDOMAIN, no A record, NS query timed out; whois.nic.io:43 gave no answer | **Inconclusive**, probably registered |

Recommendation: **blindspot.trade** (exact name, on-message TLD). Backup: **blindspotvault.com** (only free .com) or **useblindspot.app**. If an exact-match premium is wanted, blindspot.xyz / .app sit on Afternic and blindspot.fun on Nameshift (resale prices not checked).

"Likely free" = no registry record + no DNS today. Confirm at a registrar before announcing (premium pricing or a registry reserve list can still apply).

## X handles

| Handle | Raw response | Status |
|---|---|---|
| @blindspot | `{"valid":false,"reason":"taken"}` | Taken |
| @blindspot_sol | `{"valid":false,"reason":"taken"}` | Taken |
| **@blindspotsol** | `{"valid":true,"reason":"available"}` | **Available** |
| @useblindspot | `{"valid":true,"reason":"available"}` | Available |
| @blindspotvault | `{"valid":true,"reason":"available"}` | Available |
| @blindspottrade | `{"valid":true,"reason":"available"}` | Available |
| @blindspotfi | `{"valid":true,"reason":"available"}` | Available |

Recommendation: **@blindspotsol** (pairs with any domain); **@blindspottrade** if blindspot.trade is bought (handle = domain).

## Ticker

Classification: free / launched-dead / taken-alive. Mcaps are the figures returned by the APIs at check time.

### $BLINDSPOT — Solana: **launched-dead** (no live Solana token)
- DexScreener search `BLINDSPOT`: **0 pairs**.
- GMGN (sol), 26 hits. Every one has 24h volume 0. Exact/near matches: `JEASTYG7…pump` BLINDSPOT $2,151 (created 2026-08-12); `CVmybApN…pump` BLINDSPOT "BlindSpot" $492 (2026-04-26); `9wsc5YMV…mcae` BLINDSPOT "Blind Spot" $2,382 (2026-02-10); `9M1namSN…pump` BLINDSPOT $4,532 (2025-05-18); `GvG2amrX…pump` "Blindspot AI" $6,611 (2024-11-28); `8m6QWQHo…pump` "Trade in the blindspot" $2,526 (2026-02-09); plus 2024–2026 "Blindspot" / "BlindSpot" variants at $2.5k–$4.1k.
- pump.fun search-v2: all Solana BLINDSPOT coins are `complete: false` (never bonded); last trades are all 2026-08-12 or earlier.
- **Off-Solana** (pump.fun search-v2 also lists EVM tokens; chain not named by the API): `0x64E5…3bB07` BLINDSPOT ~$26.8k (created 2026-01-29), `0x77A3…3b07` "BLINDSPOT AGENT" ~$24.5k (created 2026-10-09), `0xeD41…8aA5` BLINDSPOT ~$16.3k (2026-08-13), several others at $0–$3.6k. Small, but a "BLINDSPOT AGENT" launched 4 days ago exists elsewhere. Expect some search confusion.
- Verdict: usable on Solana. Nobody holds it alive. Pin the CA everywhere from minute one.

### $BSPOT — Solana: **launched-dead**
- DexScreener `BSPOT`: 2 fuzzy pairs, neither with symbol BSPOT (ELF $8.4k, GIFTHUB $3.0k).
- GMGN (sol): `HpczxCeo…pump` BSPOT "Just a Black Spot" $6,116 (2024-12-16, vol 0); `8QMxMa44…pump` BSPOTR "Blindspotr" $2,344 (2026-04-28, vol 0).
- Off-Solana: `0xecDa…eB07` BSPOT "BlindSpot" ~$21.1k (2026-05-20).

### $BLIND — **taken-alive (avoid)**
- pump.fun search-v2, Solana: `AbeDBXvq…pump` **BLIND "Blindfold Finance"**, `complete: true` (bonded), ~$21.5k mcap, last trade 2026-10-09. It is a privacy-flavoured name in our exact niche.
- GMGN (sol): many dead BLIND/Blind coins at $1.7k–$3.1k (Sept 2026).
- Off-Solana: BLIND "Blindfold" `0x6678…2f65` ~$699.5k, several "Blind"/"Blindstreet" at $20k–$232k.
- Verdict: crowded, and it collides with Blindfold Finance. Don't use it.

**Ticker decision: $BLINDSPOT.** No live Solana token holds it, and it matches the name. $BSPOT is the fallback.

/** Site identity. */
export const SITE = {
  name: "BLINDSPOT",
  ticker: "$BLINDSPOT",
  hook: "Stop getting copytraded.",
  sub: "Trade from a shared vault. Trackers see the vault, not you.",
  description: "Deposit once, trade from a shared vault. GMGN, Bubblemaps and copytrade bots see the vault's swaps, never which wallet made them.",
  port: 3709,
  xHandle: process.env.NEXT_PUBLIC_X_HANDLE?.trim() || "blindspotsol",
  url: process.env.NEXT_PUBLIC_SITE_URL?.trim() || "http://localhost:3709",
} as const;

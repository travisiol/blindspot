export interface TokenInfo {
  mint: string;
  symbol: string;
  name?: string;
  decimals: number;
  icon: string | null;
  usdPrice?: number | null;
}

export interface BalanceRow {
  mint: string;
  available: string;
  held: string;
  out: string;
  frozen: string;
}

export interface Order {
  id: string;
  kind: "swap" | "split" | "part";
  in_mint: string;
  out_mint: string;
  in_amount: string;
  fee_bps: number;
  parts: number | null;
  status: string;
  scheduled_at: string;
  sig: string | null;
  out_amount: string | null;
  fee_amount: string | null;
  error: string | null;
  created_at: string;
  children?: Order[];
}

export interface Withdrawal {
  id: string;
  mint: string;
  amount: string;
  dest: string;
  kind: "withdraw" | "refund";
  status: string;
  sig: string | null;
  error: string | null;
  created_at: string;
}

export interface Deposit {
  sig: string;
  mint: string;
  amount: string;
  credited: string;
  refunded: string;
  status: string;
  created_at: string;
}

export interface Account {
  wallet: string;
  balances: BalanceRow[];
  tokens: Record<string, TokenInfo>;
  fee: { feeBps: number; baseBps: number; heldTokens: number };
  room: Record<string, string>;
  orders: Order[];
  withdrawals: Withdrawal[];
  deposits: Deposit[];
}

export const SOL = "So11111111111111111111111111111111111111112";
export const USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

export const KNOWN: Record<string, TokenInfo> = {
  [SOL]: { mint: SOL, symbol: "SOL", decimals: 9, icon: null },
  [USDC]: { mint: USDC, symbol: "USDC", decimals: 6, icon: null },
};

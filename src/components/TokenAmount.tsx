import { amountText } from "@/lib/client";
import type { TokenInfo } from "./app/types";

export function TokenIcon({ token }: { token?: TokenInfo | null }) {
  if (token?.icon) {
    // eslint-disable-next-line @next/next/no-img-element -- token logos come from many hosts
    return <img src={token.icon} alt="" className="token-icon" loading="lazy" />;
  }
  return (
    <span className="token-icon grid place-items-center text-[10px] font-bold text-muted" aria-hidden="true">
      {(token?.symbol ?? "?").slice(0, 2)}
    </span>
  );
}

export function TokenAmount({ raw, token, signed = false }: { raw: string | bigint | null; token?: TokenInfo | null; signed?: boolean }) {
  const text = amountText(raw, token?.decimals ?? 0);
  const plus = signed && raw != null && !String(raw).startsWith("-") ? "+" : "";
  return (
    <span className="num whitespace-nowrap">
      {plus}
      {text} <span className="font-semibold">{token?.symbol ?? "?"}</span>
    </span>
  );
}

"use client";

import { useEffect, useState } from "react";
import { getJson } from "@/lib/client";
import { shortAddress } from "@/lib/format";
import { TokenIcon } from "../TokenAmount";
import type { TokenInfo } from "./types";

/** Search any token (symbol, name or mint) with quick picks. */
export function TokenPicker({ value, onChange, quick, label }: { value: TokenInfo | null; onChange: (t: TokenInfo) => void; quick: TokenInfo[]; label: string }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<{ q: string; tokens: TokenInfo[] } | null>(null);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) return;
    const id = setTimeout(() => {
      getJson<{ tokens: (TokenInfo & { verified?: boolean; mcap?: number | null })[] }>(`/api/tokens?q=${encodeURIComponent(q)}`)
        .then((r) => setResults({ q, tokens: r.tokens }))
        .catch(() => setResults({ q, tokens: [] }));
    }, 300);
    return () => clearTimeout(id);
  }, [query]);

  const shown = query.trim().length >= 2 && results?.q === query.trim() ? results.tokens : null;

  return (
    <div className="relative">
      <button type="button" className="chip" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-label={label}>
        <TokenIcon token={value} />
        {value ? value.symbol : "Select"}
        <span aria-hidden="true" className="text-muted">▾</span>
      </button>
      {open && (
        <div className="card absolute right-0 z-20 mt-2 w-[min(20rem,calc(100vw-3rem))] p-3">
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name or paste a mint"
            className="w-full rounded-xl border border-line bg-white px-3 py-2 text-sm outline-none focus:border-ink"
          />
          <div className="mt-2 flex flex-wrap gap-1.5">
            {quick.map((t) => (
              <button key={t.mint} type="button" className="chip" onClick={() => { onChange(t); setOpen(false); setQuery(""); }}>
                <TokenIcon token={t} />
                {t.symbol}
              </button>
            ))}
          </div>
          {shown && (
            <ul className="mt-2 max-h-64 overflow-y-auto">
              {shown.length === 0 && <li className="px-2 py-3 text-sm text-muted">No token found.</li>}
              {shown.map((t) => (
                <li key={t.mint}>
                  <button
                    type="button"
                    className="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left hover:bg-paper"
                    onClick={() => {
                      onChange({ mint: t.mint, symbol: t.symbol, decimals: t.decimals, icon: t.icon, name: t.name });
                      setOpen(false);
                      setQuery("");
                    }}
                  >
                    <TokenIcon token={t} />
                    <span className="min-w-0 flex-1">
                      <span className="block font-semibold">{t.symbol}</span>
                      <span className="block truncate text-xs text-muted">{t.name}</span>
                    </span>
                    <span className="mono text-xs text-muted">{shortAddress(t.mint)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

"use client";

import { useState } from "react";
import { MINT } from "@/config/solana";
import { shortAddress } from "@/lib/format";

/** The contract address, copyable. Empty until NEXT_PUBLIC_MINT is set. */
export function CopyCa({ full = false }: { full?: boolean }) {
  const [copied, setCopied] = useState(false);
  if (!MINT) {
    return (
      <p className="flex items-center gap-2 text-sm">
        <span className="font-semibold">CA</span>
        <span className="mono text-muted">—</span>
      </p>
    );
  }
  return (
    <button
      type="button"
      className="flex max-w-full items-center gap-2 text-left text-sm"
      onClick={() => {
        void navigator.clipboard?.writeText(MINT ?? "").then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        });
      }}
    >
      <span className="font-semibold">CA</span>
      <span className="mono truncate text-muted">{full ? MINT : shortAddress(MINT)}</span>
      <span className="pill">{copied ? "Copied" : "Copy"}</span>
    </button>
  );
}

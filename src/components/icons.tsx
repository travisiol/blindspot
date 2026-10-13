type P = { className?: string; strokeWidth?: number };

const base = (strokeWidth = 2) => ({ fill: "none", stroke: "currentColor", strokeWidth, strokeLinecap: "round" as const, strokeLinejoin: "round" as const });

export function ArrowRight({ className, strokeWidth }: P) {
  return (
    <svg viewBox="0 0 24 24" className={className} {...base(strokeWidth)} aria-hidden="true">
      <path d="M4 12h15M13 6l6 6-6 6" />
    </svg>
  );
}

export function PlusIcon({ className, strokeWidth }: P) {
  return (
    <svg viewBox="0 0 24 24" className={className} {...base(strokeWidth)} aria-hidden="true">
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

export function CheckIcon({ className, strokeWidth }: P) {
  return (
    <svg viewBox="0 0 24 24" className={className} {...base(strokeWidth)} aria-hidden="true">
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </svg>
  );
}

/** An eye with a slash: what trackers get. */
export function EyeOffIcon({ className, strokeWidth }: P) {
  return (
    <svg viewBox="0 0 24 24" className={className} {...base(strokeWidth)} aria-hidden="true">
      <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" />
      <circle cx="12" cy="12" r="3" />
      <path d="M4 20L20 4" />
    </svg>
  );
}

export function EyeIcon({ className, strokeWidth }: P) {
  return (
    <svg viewBox="0 0 24 24" className={className} {...base(strokeWidth)} aria-hidden="true">
      <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

/** A vault door. */
export function VaultIcon({ className, strokeWidth }: P) {
  return (
    <svg viewBox="0 0 48 48" className={className} {...base(strokeWidth)} aria-hidden="true">
      <rect x="5" y="7" width="38" height="32" rx="5" />
      <circle cx="24" cy="23" r="8" />
      <path d="M24 15v3M24 28v3M16 23h3M29 23h3M11 39v3M37 39v3" />
    </svg>
  );
}

/** Coins going into a box. */
export function DepositIcon({ className, strokeWidth }: P) {
  return (
    <svg viewBox="0 0 48 56" className={className} {...base(strokeWidth)} aria-hidden="true">
      <path d="M24 4v22M15 17l9 9 9-9" />
      <path d="M5 30h11l3 6h10l3-6h11v18a3 3 0 0 1-3 3H8a3 3 0 0 1-3-3z" />
    </svg>
  );
}

/** Two arrows trading places. */
export function SwapIcon({ className, strokeWidth }: P) {
  return (
    <svg viewBox="0 0 48 56" className={className} {...base(strokeWidth)} aria-hidden="true">
      <path d="M8 18h30M30 10l8 8-8 8" />
      <path d="M40 38H10M18 30l-8 8 8 8" />
    </svg>
  );
}

/** Arrow back out to a wallet. */
export function WithdrawIcon({ className, strokeWidth }: P) {
  return (
    <svg viewBox="0 0 48 56" className={className} {...base(strokeWidth)} aria-hidden="true">
      <rect x="5" y="20" width="38" height="30" rx="5" />
      <path d="M33 35h10" />
      <path d="M24 26V4M15 13l9-9 9 9" />
    </svg>
  );
}

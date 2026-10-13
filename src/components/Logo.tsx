import Link from "next/link";

/** The mark: a rounded tile with an eye, crossed out by the blind-spot slash. */
export function LogoMark({ className = "h-[2.6rem] w-auto", tone = "ink" }: { className?: string; tone?: "ink" | "amber" }) {
  const tile = tone === "ink" ? "#1b2a4a" : "#ffc857";
  const eye = tone === "ink" ? "#fffdf8" : "#1b2a4a";
  const slash = tone === "ink" ? "#ffc857" : "#1b2a4a";
  return (
    <svg viewBox="0 0 44 44" className={className} aria-hidden="true">
      <rect x="1" y="1" width="42" height="42" rx="12" fill={tile} transform="skewX(-5) translate(2 0)" />
      <path d="M9 22.5c3.4-5.6 7.7-8.4 13-8.4s9.6 2.8 13 8.4c-3.4 5.6-7.7 8.4-13 8.4s-9.6-2.8-13-8.4z" fill="none" stroke={eye} strokeWidth="3.2" />
      <circle cx="22" cy="22.5" r="3.9" fill={eye} />
      <path d="M11.5 34L33 11" stroke={tile} strokeWidth="7" strokeLinecap="round" />
      <path d="M11.5 34L33 11" stroke={slash} strokeWidth="3.6" strokeLinecap="round" />
    </svg>
  );
}

export function Logo({ tone = "ink" }: { tone?: "ink" | "amber" }) {
  return (
    <Link href="/" className="inline-flex items-center gap-2.5 rounded-lg" aria-label="BLINDSPOT home">
      <LogoMark tone={tone} />
      <span className={`text-[1.75rem] font-extrabold tracking-[-0.035em] ${tone === "ink" ? "text-ink" : "text-card"}`}>blindspot</span>
    </Link>
  );
}

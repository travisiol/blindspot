/** The mark: an eye, crossed out. */
export function LogoMark({ className = "size-7" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
      <rect width="32" height="32" rx="9" fill="#121316" />
      <path d="M5.5 16c2.8-4.6 6.3-6.9 10.5-6.9s7.7 2.3 10.5 6.9c-2.8 4.6-6.3 6.9-10.5 6.9S8.3 20.6 5.5 16z" fill="none" stroke="#f2f0ea" strokeWidth="2" />
      <circle cx="16" cy="16" r="3.2" fill="#f2f0ea" />
      <path d="M8 25L24.5 7" stroke="#121316" strokeWidth="4.5" strokeLinecap="round" />
      <path d="M8 25L24.5 7" stroke="#ff7a00" strokeWidth="2.4" strokeLinecap="round" />
    </svg>
  );
}

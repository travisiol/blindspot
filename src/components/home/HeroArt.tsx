import { EyeIcon, EyeOffIcon, VaultIcon } from "../icons";

/** Deterministic barcode: bar widths from a fixed pattern, not random. */
const BARS = "31121312211321121131221113122131121231121321112213112131221113211221311213".split("").map(Number);
const BAR_OFFSETS = BARS.map((_, index) => BARS.slice(0, index).reduce((sum, width) => sum + width, 0));
const BAR_TOTAL = BARS.reduce((sum, width) => sum + width, 0);

function Barcode({ className }: { className?: string }) {
  return (
    <svg viewBox={`0 0 ${BAR_TOTAL} 20`} preserveAspectRatio="none" className={className} fill="#1e2330" aria-hidden="true">
      {BARS.map((width, index) => (index % 2 === 0 ? <rect key={index} x={BAR_OFFSETS[index]} y={0} width={width} height={20} /> : null))}
    </svg>
  );
}

/**
 * The hero, read left to right: a copytrade bot's printout on your wallet (nothing to copy),
 * the vault card that carries the trade, and your own card that only you see.
 * HTML, CSS and SVG — the text is real text.
 */
export function HeroArt({ className = "" }: { className?: string }) {
  return (
    <div className={`art ${className}`} role="img" aria-label="A copytrade bot's printout on your wallet showing nothing to copy, beside the vault card that made the trade and your private card">
      <div className="art-float-a absolute inset-0">
        <div className="art-receipt">
          <svg className="art-curl" viewBox="0 0 130 310" preserveAspectRatio="none" aria-hidden="true">
            <defs>
              <linearGradient id="curl-shade" x1="0" y1="0" x2="1" y2="0.25">
                <stop offset="0" stopColor="#fbf8ee" />
                <stop offset="0.35" stopColor="#e9e3d2" />
                <stop offset="1" stopColor="#cbc4af" />
              </linearGradient>
              <linearGradient id="curl-fade" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0.55" stopColor="#000" stopOpacity="0" />
                <stop offset="1" stopColor="#5a4c20" stopOpacity="0.2" />
              </linearGradient>
            </defs>
            <path d="M0 6C38-4 92 0 112 22c22 26 14 150-36 284C70 222 66 96 0 6Z" fill="url(#curl-shade)" />
            <path d="M0 6C38-4 92 0 112 22c22 26 14 150-36 284C70 222 66 96 0 6Z" fill="url(#curl-fade)" />
          </svg>

          <div className="paper">
            <div className="paper-brand">
              <EyeIcon strokeWidth={2.6} />
              <span>copytrade bot</span>
            </div>

            <div className="paper-merchant">
              <span>WATCHING</span>
              <span className="paper-mono not-italic" style={{ letterSpacing: 0, fontSize: "2.5cqw" }}>7xKp…3fQd (you)</span>
            </div>

            <div className="paper-mono mt-[2.4cqw]">
              <div className="paper-row italic">
                <span>Oct 13, 2026</span>
                <span>14:02 UTC</span>
              </div>
              <div className="paper-rule" />
              <div className="paper-row italic">
                <span>Last buy</span>
                <span>—</span>
              </div>
              <div className="paper-row italic">
                <span>Last sell</span>
                <span>—</span>
              </div>
              <div className="paper-row italic">
                <span>Open positions</span>
                <span>—</span>
              </div>
              <div className="paper-rule" />
              <div className="paper-row paper-total italic">
                <span>Signals sent</span>
                <span>0</span>
              </div>
            </div>

            <Barcode className="paper-barcode" />
            <p className="paper-thanks">NOTHING TO COPY</p>
          </div>
        </div>
      </div>

      <div className="art-card art-card-amber">
        <div className="flex items-center gap-[1.6cqw]">
          <EyeOffIcon className="h-[5cqw] w-[5cqw]" strokeWidth={2.4} />
          <p className="art-card-ticker">YOU</p>
        </div>
        <p className="art-card-kind mt-[0.8cqw] pl-[6.6cqw]">Only you see it</p>
      </div>

      <div className="art-card art-card-ink">
        <VaultIcon className="h-[5.6cqw] w-[5.6cqw] text-amber" strokeWidth={3.4} />
        <p className="art-card-ticker mt-[1.8cqw]">VAULT</p>
        <p className="art-card-kind mt-[0.7cqw]">Trades for everyone</p>
        <span className="art-card-amount">+3.3M BONK</span>
      </div>
    </div>
  );
}

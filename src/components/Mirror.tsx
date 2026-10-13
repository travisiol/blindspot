/**
 * The hero's one dark mass: a side mirror. In the glass, a tracker's bubble map, out of focus —
 * every wallet blurred into one sharp node, the vault. The amber glyph is the blind-spot light.
 */
const BUBBLES: [number, number, number][] = [
  [152, 128, 16], [210, 100, 9], [248, 158, 22], [184, 204, 11], [130, 244, 14], [216, 270, 8], [280, 244, 12],
  [364, 112, 13], [414, 158, 8], [436, 222, 17], [390, 276, 10], [334, 308, 7], [466, 298, 9], [304, 92, 6],
  [160, 308, 7], [486, 136, 11], [248, 326, 9], [378, 204, 6],
];

const LINKS: [number, number][] = [
  [0, 1], [0, 2], [2, 3], [3, 4], [2, 6], [6, 5], [7, 8], [8, 9], [9, 10], [10, 11], [9, 12], [7, 13], [4, 14], [8, 15], [6, 16], [9, 17],
];

export function Mirror() {
  return (
    <svg viewBox="0 0 540 440" className="h-auto w-full" role="img" aria-label="A car side mirror showing a blurred wallet tracker map with a single sharp node labelled vault">
      <defs>
        <clipPath id="glass">
          <path d="M112 122c0-15 8-23 24-26l300-46c46-7 70 32 70 100v146c0 66-24 104-70 98L136 336c-16-3-24-11-24-26z" />
        </clipPath>
        <radialGradient id="sheen" cx="30%" cy="20%" r="80%">
          <stop offset="0" stopColor="#3a3d44" />
          <stop offset="1" stopColor="#16171b" />
        </radialGradient>
      </defs>

      {/* door mount and stalk */}
      <rect x="10" y="246" width="26" height="70" rx="7" fill="#121316" />
      <path d="M98 228c-28 8-48 20-64 34v38c20 2 42 0 64-4z" fill="#121316" />
      {/* housing: taller on the outer edge, like a real side mirror */}
      <path d="M90 112c0-22 12-34 34-38l310-50c60-9 94 38 94 124v152c0 86-34 132-94 124L124 352c-22-4-34-16-34-38z" fill="#121316" />
      {/* glass */}
      <path d="M112 122c0-15 8-23 24-26l300-46c46-7 70 32 70 100v146c0 66-24 104-70 98L136 336c-16-3-24-11-24-26z" fill="url(#sheen)" />

      <g clipPath="url(#glass)">
        <g className="mirror-glass">
          {LINKS.map(([a, b], i) => (
            <line key={i} x1={BUBBLES[a][0]} y1={BUBBLES[a][1]} x2={BUBBLES[b][0]} y2={BUBBLES[b][1]} stroke="#8d929c" strokeWidth="2" />
          ))}
          {BUBBLES.map(([x, y, r], i) => (
            <circle key={i} cx={x} cy={y} r={r} fill={i % 5 === 0 ? "#c9cdd4" : "#7d828c"} />
          ))}
        </g>
        {/* the only thing a tracker can read */}
        <circle cx="322" cy="206" r="30" fill="#f2f0ea" />
        <circle cx="322" cy="206" r="38" fill="none" stroke="#f2f0ea" strokeOpacity="0.35" strokeWidth="2" />
        <text x="322" y="211" textAnchor="middle" fontFamily="var(--font-code), monospace" fontSize="13" fontWeight="600" fill="#121316">VAULT</text>
        {/* reflection */}
        <path d="M200 30L140 380" stroke="#fff" strokeOpacity="0.05" strokeWidth="46" />
      </g>

      {/* blind-spot warning light */}
      <g transform="translate(446 300) scale(1.35)" className="blink">
        <path d="M0 22L13 0l13 22z" fill="#ff7a00" />
        <rect x="11.6" y="7" width="2.8" height="8" rx="1.4" fill="#121316" />
        <circle cx="13" cy="18" r="1.6" fill="#121316" />
      </g>
    </svg>
  );
}

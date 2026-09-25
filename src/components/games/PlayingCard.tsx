/**
 * İskambil kartı — Yüksek/Alçak ve Blackjack paylaşır.
 * `label` "10♥" biçiminde; null verilirse kart kapalı (sırtı) çizilir.
 */

const isRed = (label: string) => label.includes("♦") || label.includes("♥");

const SIZES = {
  sm: { box: "h-12 w-9", rank: "text-[11px]", suit: "text-lg" },
  md: { box: "h-[88px] w-16", rank: "text-base", suit: "text-3xl" },
  lg: { box: "h-32 w-24", rank: "text-xl", suit: "text-5xl" },
} as const;

export function PlayingCard({
  label,
  size = "sm",
  className = "",
}: {
  label: string | null;
  size?: keyof typeof SIZES;
  className?: string;
}) {
  const s = SIZES[size];
  if (label === null) {
    return (
      <div
        aria-label="kapalı kart"
        className={`relative shrink-0 overflow-hidden rounded-xl ring-1 ring-white/25 shadow-[0_6px_16px_rgba(0,0,0,0.45)]
          bg-[repeating-linear-gradient(45deg,#8b1a1a_0_6px,#6d1414_6px_12px)] ${s.box} ${className}`}
      >
        <div className="absolute inset-1.5 rounded-lg ring-1 ring-[#ffd062]/60" />
        <div className="absolute inset-0 grid place-items-center">
          <span className="gold-text font-display text-sm font-black">106</span>
        </div>
      </div>
    );
  }
  const red = isRed(label);
  const rank = label.slice(0, -1);
  const suit = label.slice(-1);
  const color = red ? "#e01e37" : "#12263d";
  return (
    <div
      aria-label={label}
      className={`relative shrink-0 rounded-xl bg-gradient-to-b from-white to-[#e9edf5]
        shadow-[0_6px_16px_rgba(0,0,0,0.45)] ring-1 ring-black/20 ${s.box} ${className}`}
    >
      <span className={`absolute left-1.5 top-1 font-display font-black leading-none ${s.rank}`} style={{ color }}>
        {rank}
      </span>
      <span className={`absolute inset-0 grid place-items-center ${s.suit}`} style={{ color }}>
        {suit}
      </span>
    </div>
  );
}

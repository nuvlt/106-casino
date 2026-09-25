/**
 * Oyun kartlarının çizimleri.
 *
 * Her oyunun kendi sahnesi var — emoji yerine gerçek vektör çizim.
 * Hepsi 100x100 kutuya oturur, kart arka planının üstünde durur.
 */

export type ArtKey =
  | "wheel"
  | "crash"
  | "dice"
  | "plinko"
  | "scratch"
  | "guess"
  | "mystery"
  | "hilo"
  | "roulette"
  | "slot"
  | "bazaar"
  | "blackjack";

const Gold = ({ id }: { id: string }) => (
  <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
    <stop offset="0%" stopColor="#fff3cc" />
    <stop offset="45%" stopColor="#ffd062" />
    <stop offset="100%" stopColor="#b5830e" />
  </linearGradient>
);

function WheelArt() {
  const slices = Array.from({ length: 12 }, (_, i) => i);
  return (
    <svg viewBox="0 0 100 100" className="size-full">
      <defs><Gold id="gw" /></defs>
      <circle cx="50" cy="52" r="34" fill="url(#gw)" />
      <circle cx="50" cy="52" r="30" fill="#0b1a12" />
      {slices.map((i) => {
        const a0 = (i * 30 - 90) * (Math.PI / 180);
        const a1 = ((i + 1) * 30 - 90) * (Math.PI / 180);
        const r = 30;
        return (
          <path
            key={i}
            d={`M50 52 L${50 + r * Math.cos(a0)} ${52 + r * Math.sin(a0)} A${r} ${r} 0 0 1 ${50 + r * Math.cos(a1)} ${52 + r * Math.sin(a1)} Z`}
            fill={i % 3 === 0 ? "#e01e37" : i % 3 === 1 ? "#0f5132" : "#12263d"}
            stroke="#ffd062"
            strokeWidth="0.6"
          />
        );
      })}
      <circle cx="50" cy="52" r="8" fill="url(#gw)" />
      <circle cx="50" cy="52" r="3" fill="#7a5804" />
      <path d="M50 10 L56 22 L44 22 Z" fill="url(#gw)" />
    </svg>
  );
}

function CrashArt() {
  return (
    <svg viewBox="0 0 100 100" className="size-full">
      <defs>
        <linearGradient id="ct" x1="0" y1="1" x2="1" y2="0">
          <stop offset="0%" stopColor="#2ee6ff" stopOpacity="0" />
          <stop offset="100%" stopColor="#2ee6ff" />
        </linearGradient>
        <Gold id="gc" />
      </defs>
      <path d="M8 88 Q45 84 64 40 T88 12" fill="none" stroke="url(#ct)" strokeWidth="4" strokeLinecap="round" />
      <g transform="translate(74 20) rotate(38)">
        <path d="M0 -12 C6 -6 7 4 0 12 C-7 4 -6 -6 0 -12 Z" fill="url(#gc)" />
        <circle cx="0" cy="-2" r="3.2" fill="#0a1420" />
        <path d="M-6 6 L-10 14 L-2 10 Z" fill="#e01e37" />
        <path d="M6 6 L10 14 L2 10 Z" fill="#e01e37" />
        <path d="M0 12 L-3 22 L0 19 L3 22 Z" fill="#ffc94a" />
      </g>
      {[[20, 24], [34, 14], [78, 62], [64, 74]].map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r="1.6" fill="#ffffff" opacity="0.7" />
      ))}
    </svg>
  );
}

function DiceArt() {
  const pip = (x: number, y: number, k: string) => <circle key={k} cx={x} cy={y} r="3.4" fill="#0b3d22" />;
  return (
    <svg viewBox="0 0 100 100" className="size-full">
      <defs><Gold id="gd" /></defs>
      <g transform="translate(14 30) rotate(-12)">
        <rect width="42" height="42" rx="9" fill="#f6fbf7" />
        <rect width="42" height="42" rx="9" fill="none" stroke="url(#gd)" strokeWidth="2" />
        {[pip(11, 11, "a"), pip(31, 11, "b"), pip(11, 31, "c"), pip(31, 31, "d"), pip(21, 21, "e")]}
      </g>
      <g transform="translate(50 44) rotate(14)">
        <rect width="36" height="36" rx="8" fill="#e01e37" />
        <rect width="36" height="36" rx="8" fill="none" stroke="url(#gd)" strokeWidth="2" />
        <circle cx="10" cy="10" r="3" fill="#fff" />
        <circle cx="26" cy="26" r="3" fill="#fff" />
        <circle cx="18" cy="18" r="3" fill="#fff" />
      </g>
    </svg>
  );
}

function PlinkoArt() {
  const pegs: [number, number][] = [];
  for (let row = 0; row < 4; row++) {
    for (let c = 0; c <= row; c++) pegs.push([50 - row * 9 + c * 18, 26 + row * 15]);
  }
  return (
    <svg viewBox="0 0 100 100" className="size-full">
      <defs><Gold id="gp" /></defs>
      {pegs.map(([x, y], i) => <circle key={i} cx={x} cy={y} r="2.6" fill="#c9b7ff" opacity="0.85" />)}
      <path d="M50 8 L50 20" stroke="#ffd062" strokeWidth="2" strokeLinecap="round" />
      <circle cx="50" cy="14" r="6" fill="url(#gp)" />
      {[18, 34, 50, 66, 82].map((x, i) => (
        <rect key={i} x={x - 7} y="86" width="14" height="10" rx="2"
          fill={i === 2 ? "#3b1470" : i % 2 ? "#6d28d9" : "#9d5cff"} />
      ))}
    </svg>
  );
}

function ScratchArt() {
  return (
    <svg viewBox="0 0 100 100" className="size-full">
      <defs><Gold id="gs" /></defs>
      <rect x="14" y="24" width="72" height="54" rx="8" fill="#fff6e6" />
      <rect x="14" y="24" width="72" height="54" rx="8" fill="none" stroke="url(#gs)" strokeWidth="2.5" />
      <rect x="21" y="34" width="58" height="26" rx="4" fill="#c2c9d4" />
      <path d="M24 60 Q34 46 46 58 T70 40" stroke="#fbbf24" strokeWidth="7" fill="none" strokeLinecap="round" opacity="0.95" />
      <text x="50" y="72" fontSize="11" fontWeight="800" textAnchor="middle" fill="#c2410c">★ ★ ★</text>
      <g transform="translate(72 18) rotate(20)">
        <rect x="-3" y="-10" width="6" height="22" rx="2" fill="#7c2d12" />
        <path d="M-4 10 L4 10 L0 18 Z" fill="#fbbf24" />
      </g>
    </svg>
  );
}

function GuessArt() {
  const balls = [
    { x: 28, y: 40, n: "3", c: "#2f80ed" },
    { x: 56, y: 30, n: "7", c: "#e01e37" },
    { x: 46, y: 62, n: "9", c: "#1f8b4c" },
    { x: 72, y: 56, n: "1", c: "#ffc94a" },
  ];
  return (
    <svg viewBox="0 0 100 100" className="size-full">
      {balls.map((b, i) => (
        <g key={i}>
          <circle cx={b.x} cy={b.y} r="13" fill={b.c} />
          <circle cx={b.x - 4} cy={b.y - 5} r="4" fill="#fff" opacity="0.32" />
          <circle cx={b.x} cy={b.y} r="8" fill="#fff" />
          <text x={b.x} y={b.y + 3.6} fontSize="10" fontWeight="900" textAnchor="middle" fill="#12263d">
            {b.n}
          </text>
        </g>
      ))}
    </svg>
  );
}

function MysteryArt() {
  /** Kapağı ayrı, gövdesi koyu bir hediye kutusu — küçük boyutta da okunur. */
  const box = (x: number, y: number, w: number, h: number, body: string, k: number) => (
    <g key={k} transform={`translate(${x} ${y})`}>
      {/* gövde */}
      <rect y={h * 0.26} width={w} height={h * 0.74} rx="2.5" fill={body} stroke="#2a0426" strokeWidth="1.2" />
      {/* dikey kurdele */}
      <rect x={w / 2 - 2.6} y={h * 0.26} width="5.2" height={h * 0.74} fill="#ffd062" />
      {/* kapak */}
      <rect width={w} height={h * 0.28} rx="2.5" fill="#ffd062" stroke="#a9760a" strokeWidth="1" />
      <rect x={w / 2 - 2.6} width="5.2" height={h * 0.28} fill="#e8a91b" />
    </g>
  );
  return (
    <svg viewBox="0 0 100 100" className="size-full">
      {box(10, 54, 26, 34, "#7b1370", 1)}
      {box(64, 54, 26, 34, "#b01167", 2)}
      <g transform="translate(35 16)">
        {box(0, 0, 30, 38, "#4a0d46", 3)}
        {/* fiyonk */}
        <path d="M15 -1 C7 -12 -3 -3 15 2 C33 -3 23 -12 15 -1 Z" fill="#ffd062" stroke="#a9760a" strokeWidth="1" />
        <circle cx="15" cy="1" r="2.6" fill="#e8a91b" />
      </g>
      <text x="50" y="52" fontSize="13" fontWeight="900" textAnchor="middle" fill="#ffffff" opacity="0.9">
        ?
      </text>
    </svg>
  );
}

function HiloArt() {
  return (
    <svg viewBox="0 0 100 100" className="size-full">
      <defs><Gold id="gh" /></defs>
      <g transform="translate(16 30) rotate(-14)">
        <rect width="36" height="50" rx="5" fill="#f7f9fc" stroke="url(#gh)" strokeWidth="1.6" />
        <text x="8" y="16" fontSize="12" fontWeight="900" fill="#12263d">K</text>
        <path d="M18 30 L24 38 L18 46 L12 38 Z" fill="#12263d" />
      </g>
      <g transform="translate(48 26) rotate(12)">
        <rect width="36" height="50" rx="5" fill="#f7f9fc" stroke="url(#gh)" strokeWidth="1.6" />
        <text x="8" y="16" fontSize="12" fontWeight="900" fill="#e01e37">A</text>
        <path d="M18 44 C10 36 12 28 18 32 C24 28 26 36 18 44 Z" fill="#e01e37" />
      </g>
      <path d="M50 84 L44 92 L56 92 Z" fill="#2fe08a" />
      <path d="M50 96 L44 88 L56 88 Z" fill="#ff5d78" opacity="0" />
    </svg>
  );
}

function RouletteArt() {
  // 38 cep: yeşil 0/00, kırmızı-siyah dönüşümlü; tepede top.
  const n = 38;
  return (
    <svg viewBox="0 0 100 100" className="size-full">
      <defs><Gold id="gr" /></defs>
      <circle cx="50" cy="54" r="36" fill="url(#gr)" />
      <circle cx="50" cy="54" r="32" fill="#3b1d0e" />
      {Array.from({ length: n }, (_, i) => {
        const a0 = ((i * 360) / n - 90) * (Math.PI / 180);
        const a1 = (((i + 1) * 360) / n - 90) * (Math.PI / 180);
        const r = 31;
        const fill = i === 0 || i === 19 ? "#1f8b4c" : i % 2 ? "#12161f" : "#c8102e";
        const f = (v: number) => Number(v.toFixed(2));
        return (
          <path
            key={i}
            d={`M50 54 L${f(50 + r * Math.cos(a0))} ${f(54 + r * Math.sin(a0))} A${r} ${r} 0 0 1 ${f(50 + r * Math.cos(a1))} ${f(54 + r * Math.sin(a1))} Z`}
            fill={fill}
          />
        );
      })}
      <circle cx="50" cy="54" r="20" fill="#5a2d12" stroke="url(#gr)" strokeWidth="1.5" />
      <circle cx="50" cy="54" r="7" fill="url(#gr)" />
      {[0, 90, 180, 270].map((d) => (
        <rect key={d} x="49" y="36" width="2" height="12" fill="url(#gr)" transform={`rotate(${d} 50 54)`} />
      ))}
      <circle cx="62" cy="27" r="3.4" fill="#ffffff" stroke="#c9ced8" strokeWidth="0.6" />
    </svg>
  );
}

function SlotArt() {
  return (
    <svg viewBox="0 0 100 100" className="size-full">
      <defs><Gold id="gs" /></defs>
      <rect x="14" y="24" width="72" height="54" rx="9" fill="url(#gs)" />
      <rect x="19" y="30" width="62" height="42" rx="5" fill="#fff8e6" />
      {[0, 1, 2].map((i) => (
        <g key={i}>
          <rect x={21 + i * 20} y="32" width="18" height="38" rx="3" fill="#ffffff" stroke="#e6d6ad" />
          <text x={30 + i * 20} y="57" fontSize="17" fontWeight="900" textAnchor="middle" fill="#c8102e">7</text>
        </g>
      ))}
      <rect x="19" y="49" width="62" height="1.6" fill="#c8102e" opacity="0.55" />
      <rect x="86" y="34" width="4" height="26" rx="2" fill="url(#gs)" />
      <circle cx="88" cy="32" r="5" fill="#c8102e" />
      <rect x="30" y="16" width="40" height="10" rx="5" fill="#c8102e" />
      <text x="50" y="24" fontSize="7" fontWeight="900" textAnchor="middle" fill="#fff3cc">JACKPOT</text>
    </svg>
  );
}

function BazaarArt() {
  // Çarşı kemeri, altında kandil ve nazar boncuğu.
  return (
    <svg viewBox="0 0 100 100" className="size-full">
      <defs>
        <Gold id="gb" />
        <radialGradient id="nazar" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0%" stopColor="#0b1a3a" />
          <stop offset="30%" stopColor="#0b1a3a" />
          <stop offset="31%" stopColor="#ffffff" />
          <stop offset="52%" stopColor="#ffffff" />
          <stop offset="53%" stopColor="#6fc3ff" />
          <stop offset="72%" stopColor="#6fc3ff" />
          <stop offset="73%" stopColor="#1541b8" />
        </radialGradient>
      </defs>
      <path d="M18 88 L18 46 Q18 18 50 14 Q82 18 82 46 L82 88 Z" fill="url(#gb)" />
      <path d="M25 88 L25 48 Q25 25 50 21 Q75 25 75 48 L75 88 Z" fill="#3a0f1f" />
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <rect key={i} x={27 + i * 8} y="78" width="6" height="10" fill={i % 2 ? "#c8102e" : "#1541b8"} opacity="0.85" />
      ))}
      <line x1="50" y1="21" x2="50" y2="34" stroke="url(#gb)" strokeWidth="1.2" />
      <path d="M42 34 L58 34 L55 46 Q50 52 45 46 Z" fill="url(#gb)" />
      <circle cx="50" cy="40" r="3" fill="#ffe89a" />
      <circle cx="50" cy="64" r="12" fill="url(#nazar)" />
    </svg>
  );
}

function BlackjackArt() {
  return (
    <svg viewBox="0 0 100 100" className="size-full">
      <defs><Gold id="gj" /></defs>
      <g transform="translate(20 22) rotate(-10)">
        <rect width="36" height="50" rx="5" fill="#f7f9fc" stroke="url(#gj)" strokeWidth="1.6" />
        <text x="7" y="15" fontSize="12" fontWeight="900" fill="#12263d">A</text>
        <path d="M18 24 C12 32 8 36 12 40 C15 43 17 41 18 39 C19 41 21 43 24 40 C28 36 24 32 18 24 Z M16 40 L20 40 L21 46 L15 46 Z" fill="#12263d" />
      </g>
      <g transform="translate(46 24) rotate(10)">
        <rect width="36" height="50" rx="5" fill="#f7f9fc" stroke="url(#gj)" strokeWidth="1.6" />
        <text x="7" y="15" fontSize="12" fontWeight="900" fill="#c8102e">K</text>
        <path d="M18 44 C10 36 12 28 18 32 C24 28 26 36 18 44 Z" fill="#c8102e" />
      </g>
      <circle cx="74" cy="80" r="11" fill="#1f8b4c" stroke="#ffffff" strokeWidth="2" strokeDasharray="4 3" />
      <text x="74" y="84" fontSize="9" fontWeight="900" textAnchor="middle" fill="#ffffff">21</text>
    </svg>
  );
}

const ART: Record<ArtKey, () => React.JSX.Element> = {
  roulette: RouletteArt,
  slot: SlotArt,
  bazaar: BazaarArt,
  blackjack: BlackjackArt,
  wheel: WheelArt,
  crash: CrashArt,
  dice: DiceArt,
  plinko: PlinkoArt,
  scratch: ScratchArt,
  guess: GuessArt,
  mystery: MysteryArt,
  hilo: HiloArt,
};

export function GameArt({ name }: { name: ArtKey }) {
  const C = ART[name];
  return <C />;
}

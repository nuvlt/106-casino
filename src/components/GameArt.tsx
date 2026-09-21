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
  | "hilo";

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

const ART: Record<ArtKey, () => React.JSX.Element> = {
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

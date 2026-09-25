"use client";

import { useEffect, useRef, useState } from "react";
import { Button, Card, Pill, SectionTitle } from "@/components/ui";
import { ActionDock } from "@/components/games/ActionDock";
import { ResultFlash } from "@/components/games/ResultFlash";
import { newKey, post } from "@/hooks/useApi";
import { COIN, MAX_BET, MIN_BET, ROULETTE_DOUBLE_ZERO, ROULETTE_RED } from "@/lib/games/config";
import type { RouletteBet, RouletteBetKind } from "@/lib/games/engine";
import { coins } from "@/lib/format";
import { sfx } from "@/lib/sound";

interface SpinResponse {
  payout: number;
  mult: number;
  balance: number;
  result: { pocket: number; label: string; color: "green" | "red" | "black"; winners: number[] };
  newBadges: { id: string; title: string; icon: string; reward: number }[];
}

/** Amerikan çarkındaki cep dizilimi (saat yönünde, 0'dan başlayarak). 37 = "00". */
const WHEEL_ORDER = [
  0, 28, 9, 26, 30, 11, 7, 20, 32, 17, 5, 22, 34, 15, 3, 24, 36, 13, 1, 37,
  27, 10, 25, 29, 12, 8, 19, 31, 18, 6, 21, 33, 16, 4, 23, 35, 14, 2,
];
const STEP = 360 / WHEEL_ORDER.length;

/* ---- Çark hareketi ---- */
const CRUISE_DEG_S = 540; // çarkın seyir hızı (saat yönü)
const BALL_DEG_S = 780; // topun pistteki hızı (ters yön)
const RAMP_MS = 300;
const MIN_DECEL_MS = 3400;
/** Yavaşlama süresinin hangi kısmında top cebe oturur; kalanında çarkla birlikte döner. */
const BALL_SETTLE = 0.74;
/** Top, oturma süresinin bu noktasına kadar pistte kalır, sonra cebe düşer. */
const BALL_DROP = 0.5;

/* ---- Çark geometrisi (SVG birimi, merkez 0,0) ---- */
const R_BOWL = 118; // ahşap kasenin dışı
const R_TRACK_OUT = 104; // top pisti
const R_TRACK_IN = 90;
const R_NUM_OUT = 88; // numara halkası
const R_NUM_IN = 70;
const R_POCKET_IN = 57; // cepler (topun oturduğu yer)
const BALL_TRACK = 97;
const BALL_POCKET = 63.5;
const BALL_R = 3.9;

const CHIPS = [
  { v: 10, face: "#2f80ed", edge: "#1d5fae", ink: "#ffffff" },
  { v: 50, face: "#1f8b4c", edge: "#0b3d22", ink: "#ffffff" },
  { v: 100, face: "#e01e37", edge: "#7a0d1d", ink: "#ffffff" },
  { v: 250, face: "#9d5cff", edge: "#4a0d8a", ink: "#ffffff" },
  { v: 500, face: "#ffc94a", edge: "#8d6205", ink: "#3a2500" },
].map((c) => ({ ...c, amount: c.v * COIN }));

const label = (p: number) => (p === ROULETTE_DOUBLE_ZERO ? "00" : String(p));
const colorOf = (p: number) =>
  p === 0 || p === ROULETTE_DOUBLE_ZERO ? "green" : ROULETTE_RED.has(p) ? "red" : "black";
const COLOR_BG = { green: "#1f8b4c", red: "#c8102e", black: "#14171f" } as const;
/** Masadaki sayı kutuları: düz renk yerine hafif kabarık degrade. */
const CELL_BG = {
  green: "linear-gradient(180deg,#27b163 0%,#137a3f 100%)",
  red: "linear-gradient(180deg,#e2263f 0%,#a10c22 100%)",
  black: "linear-gradient(180deg,#2c313d 0%,#0d0f15 100%)",
} as const;
/** Çarktaki cep dibi — numara halkasından bir ton koyu. */
const POCKET_BG = { green: "#0f5c31", red: "#8a0a1e", black: "#07080b" } as const;

type Key = string; // "straight:17", "red", "dozen:2", "column:3"
const keyOf = (kind: RouletteBetKind, n?: number): Key => (n === undefined ? kind : `${kind}:${n}`);
function parseKey(k: Key): { kind: RouletteBetKind; n?: number } {
  const [kind, n] = k.split(":");
  return n === undefined ? { kind: kind as RouletteBetKind } : { kind: kind as RouletteBetKind, n: Number(n) };
}

/** Bu cepte hangi alanlar kazanır — tahtada vurgulamak için (sunucu kuralının aynısı). */
function winningKeys(pocket: number): Set<Key> {
  const out = new Set<Key>([keyOf("straight", pocket)]);
  if (pocket === 0 || pocket === ROULETTE_DOUBLE_ZERO) return out;
  out.add(ROULETTE_RED.has(pocket) ? "red" : "black");
  out.add(pocket % 2 ? "odd" : "even");
  out.add(pocket <= 18 ? "low" : "high");
  out.add(keyOf("dozen", Math.ceil(pocket / 12)));
  out.add(keyOf("column", ((pocket - 1) % 3) + 1));
  return out;
}

const f3 = (v: number) => Number(v.toFixed(3));
/** i. cebin (kesirli olabilir) ro–ri arasındaki halka dilimi. Açı 0 = tepe, saat yönü. */
function ringSlice(i: number, ro: number, ri: number) {
  const a0 = ((i * STEP - 90) * Math.PI) / 180;
  const a1 = (((i + 1) * STEP - 90) * Math.PI) / 180;
  return (
    `M${f3(ro * Math.cos(a0))} ${f3(ro * Math.sin(a0))} ` +
    `A${ro} ${ro} 0 0 1 ${f3(ro * Math.cos(a1))} ${f3(ro * Math.sin(a1))} ` +
    `L${f3(ri * Math.cos(a1))} ${f3(ri * Math.sin(a1))} ` +
    `A${ri} ${ri} 0 0 0 ${f3(ri * Math.cos(a0))} ${f3(ri * Math.sin(a0))} Z`
  );
}

const easeOutCubic = (u: number) => 1 - Math.pow(1 - u, 3);
/** Top cebe düşerken bir-iki kez sekip oturur. */
function easeOutBounce(x: number) {
  const n = 7.5625;
  const d = 2.75;
  if (x < 1 / d) return n * x * x;
  if (x < 2 / d) return n * (x -= 1.5 / d) * x + 0.75;
  if (x < 2.5 / d) return n * (x -= 2.25 / d) * x + 0.9375;
  return n * (x -= 2.625 / d) * x + 0.984375;
}

/* ================================================================
   ÇARK — statik kısımlar (kase, pist, saptırıcılar) ve dönen rotor
   ================================================================ */

/** Rotor bir kez çizilir; dönüşü ref üzerinden `transform` ile verilir. */
function Rotor() {
  return (
    <>
      {/* numara halkası */}
      {WHEEL_ORDER.map((p, i) => (
        <path key={`n${p}`} d={ringSlice(i, R_NUM_OUT, R_NUM_IN)} fill={COLOR_BG[colorOf(p)]} />
      ))}
      {/* cepler */}
      {WHEEL_ORDER.map((p, i) => (
        <path key={`p${p}`} d={ringSlice(i, R_NUM_IN, R_POCKET_IN)} fill={POCKET_BG[colorOf(p)]} />
      ))}
      {/* cep içi gölge: dışa doğru koyulaşır, derinlik hissi */}
      <circle r={(R_NUM_IN + R_POCKET_IN) / 2} fill="none" stroke="url(#rl-pocketShade)" strokeWidth={R_NUM_IN - R_POCKET_IN} />
      {/* metal ayraçlar */}
      {WHEEL_ORDER.map((_, i) => {
        const a = ((i * STEP - 90) * Math.PI) / 180;
        return (
          <line
            key={`f${i}`}
            x1={f3(R_POCKET_IN * Math.cos(a))}
            y1={f3(R_POCKET_IN * Math.sin(a))}
            x2={f3(R_NUM_OUT * Math.cos(a))}
            y2={f3(R_NUM_OUT * Math.sin(a))}
            stroke="url(#rl-gold)"
            strokeWidth={0.9}
          />
        );
      })}
      {/* numaralar */}
      {WHEEL_ORDER.map((p, i) => {
        const mid = i * STEP + STEP / 2;
        const rad = ((mid - 90) * Math.PI) / 180;
        const rr = (R_NUM_OUT + R_NUM_IN) / 2;
        const tx = f3(rr * Math.cos(rad));
        const ty = f3(rr * Math.sin(rad));
        return (
          <text
            key={`t${p}`}
            x={tx}
            y={ty}
            fill="#ffffff"
            fontSize={7.6}
            fontWeight={800}
            textAnchor="middle"
            dominantBaseline="central"
            transform={`rotate(${mid.toFixed(3)} ${tx} ${ty})`}
            style={{ fontFamily: "var(--font-display, inherit)" }}
          >
            {label(p)}
          </text>
        );
      })}
      <circle r={R_NUM_OUT} fill="none" stroke="url(#rl-gold)" strokeWidth={1.3} />
      <circle r={R_NUM_IN} fill="none" stroke="url(#rl-gold)" strokeWidth={0.9} />
      <circle r={R_POCKET_IN} fill="url(#rl-cone)" stroke="url(#rl-gold)" strokeWidth={1.6} />
      {/* koni üzerindeki ince halkalar */}
      <circle r={44} fill="none" stroke="#000" strokeOpacity={0.25} strokeWidth={0.6} />
      <circle r={30} fill="none" stroke="#fff" strokeOpacity={0.08} strokeWidth={0.6} />
      {/* göbek haçı */}
      {[0, 90].map((d) => (
        <rect key={d} x={-2.4} y={-38} width={4.8} height={76} rx={2.4} fill="url(#rl-gold)" transform={`rotate(${d})`} />
      ))}
      {[0, 90, 180, 270].map((d) => (
        <circle key={`k${d}`} cx={0} cy={-39} r={4.4} fill="url(#rl-knob)" transform={`rotate(${d})`} />
      ))}
      <circle r={11} fill="url(#rl-knob)" />
      <circle r={5} cx={-2.5} cy={-3} fill="#fff" opacity={0.35} />
    </>
  );
}

/* ================================================================
   MASA
   ================================================================ */

/** Masaya konmış jeton: tutara göre en yakın jetonun rengi, kenarda şeritler. */
function TableChip({ amount, at }: { amount: number; at: "center" | "right" }) {
  const c = [...CHIPS].reverse().find((x) => amount >= x.amount) ?? CHIPS[0]!;
  const v = amount / COIN;
  const text = v >= 1000 ? `${Math.round(v / 100) / 10}k` : String(v);
  return (
    <span
      className={`pointer-events-none absolute z-10 grid size-[26px] place-items-center rounded-full shadow-[0_3px_6px_rgba(0,0,0,0.65)] ${
        at === "center" ? "left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2" : "right-1.5 top-1/2 -translate-y-1/2"
      }`}
      style={{ background: `repeating-conic-gradient(${c.face} 0deg 30deg, #ffffff 30deg 45deg)` }}
    >
      <span
        className="grid size-[19px] place-items-center rounded-full font-display text-[8.5px] font-black leading-none"
        style={{ background: c.face, color: c.ink, boxShadow: `inset 0 0 0 1px ${c.edge}` }}
      >
        {text}
      </span>
    </span>
  );
}

/**
 * Masadaki tek alan. Bileşen dışında tanımlı: içeride tanımlanınca her
 * çizimde React onu yeni bir bileşen sanıp masadaki bütün düğmeleri söküp
 * yeniden kuruyordu — hem gereksiz iş, hem de telefonda çevirince çarka
 * kaydırmayı tarayıcının kaydırma sabitlemesi iptal ediyordu.
 */
function Spot({
  kind,
  n,
  name,
  children,
  className = "",
  style,
  amount,
  chipAt = "center",
  hit,
  dim,
  disabled,
  onPlace,
}: {
  kind: RouletteBetKind;
  n?: number;
  /** Ekran okuyucu / test adı: "KIRMIZI alanına bahis" gibi. */
  name: string;
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
  amount?: number;
  chipAt?: "center" | "right";
  hit: boolean;
  dim: boolean;
  disabled: boolean;
  onPlace: (kind: RouletteBetKind, n?: number) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onPlace(kind, n)}
      disabled={disabled}
      aria-label={`${name} alanına bahis`}
      style={style}
      className={`relative grid place-items-center font-display font-black text-white transition
        enabled:hover:brightness-125 active:scale-[0.97] disabled:active:scale-100
        ${hit ? "z-10 shadow-[0_0_0_2px_#ffe89a,0_0_18px_rgba(255,232,154,0.85)]" : ""}
        ${dim ? "opacity-40" : ""} ${className}`}
    >
      {children}
      {amount ? <TableChip amount={amount} at={chipAt} /> : null}
    </button>
  );
}

type SpotProps = Omit<React.ComponentProps<typeof Spot>, "children" | "className" | "style" | "name" | "chipAt">;

/** Kırmızı/siyah alanlarındaki eşkenar dörtgen — gerçek masalardaki gibi. */
function Diamond({ color }: { color: "red" | "black" }) {
  return (
    <span className="block drop-shadow-[0_0_1.5px_rgba(243,227,179,0.9)]">
    <span
      className="block h-[22px] w-[40px]"
      style={{
        background: color === "red" ? "linear-gradient(180deg,#e2263f,#a10c22)" : "linear-gradient(180deg,#2c313d,#0d0f15)",
        clipPath: "polygon(50% 0, 100% 50%, 50% 100%, 0 50%)",
      }}
    />
    </span>
  );
}

const FELT = "bg-[radial-gradient(130%_120%_at_50%_0%,#1f7a4b_0%,#0f4a2d_55%,#07251a_100%)]";
/** Masadaki çizgi: keçenin üstünde ince krem hat. */
const LINE = "ring-1 ring-inset ring-[#f3e3b3]/35";

/** Geniş ekran: klasik yatay Amerikan masası — solda 0/00, üç sıra × on iki sayı, sağda 2:1. */
function WideTable({ spot }: { spot: (kind: RouletteBetKind, n?: number) => SpotProps }) {
  const outside: { kind: RouletteBetKind; name: string; body: React.ReactNode }[] = [
    { kind: "low", name: "1–18", body: "1–18" },
    { kind: "even", name: "ÇİFT", body: "ÇİFT" },
    { kind: "red", name: "KIRMIZI", body: <Diamond color="red" /> },
    { kind: "black", name: "SİYAH", body: <Diamond color="black" /> },
    { kind: "odd", name: "TEK", body: "TEK" },
    { kind: "high", name: "19–36", body: "19–36" },
  ];
  return (
    <div className={`rounded-[28px] p-[3px] bg-gradient-to-b from-[#ffe7a3] via-[#b8862a] to-[#6e4c0a] shadow-[0_18px_40px_rgba(0,0,0,0.55)]`}>
      <div className={`relative overflow-hidden rounded-[25px] ${FELT} px-5 pb-5 pt-4`}>
        <div className="pointer-events-none absolute inset-0 opacity-[0.07] [background-image:radial-gradient(#fff_0.6px,transparent_0.6px)] [background-size:4px_4px]" />
        <div className="relative mb-3 flex items-center justify-between text-[10px] font-black uppercase tracking-[0.25em] text-[#f3e3b3]/70">
          <span>Amerikan ruleti · 0 · 00</span>
          <span>
            masa limiti {coins(MIN_BET)} – {coins(MAX_BET)}
          </span>
        </div>
        <div
          className="relative grid"
          style={{
            gridTemplateColumns: "58px repeat(12, minmax(0, 1fr)) 58px",
            gridTemplateRows: "repeat(3, 50px) 40px 40px",
            gap: "3px",
          }}
        >
          {/* 0 / 00 */}
          <div className="flex flex-col gap-[3px]" style={{ gridColumn: 1, gridRow: "1 / 4" }}>
            <Spot {...spot("straight", 37)} name="00" className={`flex-1 rounded-tl-[22px] text-lg ${LINE}`} style={{ background: CELL_BG.green }}>
              00
            </Spot>
            <Spot {...spot("straight", 0)} name="0" className={`flex-1 rounded-bl-[22px] text-lg ${LINE}`} style={{ background: CELL_BG.green }}>
              0
            </Spot>
          </div>

          {/* sayılar: üst sıra 3,6,…,36 · orta 2,5,…,35 · alt 1,4,…,34 */}
          {[0, 1, 2].flatMap((r) =>
            Array.from({ length: 12 }, (_, k) => {
              const n = 3 * k + (3 - r);
              return (
                <Spot
                  key={n}
                  {...spot("straight", n)}
                  name={String(n)}
                  className={`rounded-[4px] text-[15px] ${LINE}`}
                  style={{ gridColumn: k + 2, gridRow: r + 1, background: CELL_BG[colorOf(n)] }}
                >
                  {n}
                </Spot>
              );
            }),
          )}

          {/* 2:1 sütunlar (üst sıra = 3. sütun) */}
          {[0, 1, 2].map((r) => (
            <Spot
              key={`c${r}`}
              {...spot("column", 3 - r)}
              name={`${3 - r}. sütun 2:1`}
              className={`text-xs text-[#f3e3b3] ${LINE} ${r === 0 ? "rounded-tr-[14px]" : ""} ${r === 2 ? "rounded-br-[14px]" : ""}`}
              style={{ gridColumn: 14, gridRow: r + 1 }}
            >
              2:1
            </Spot>
          ))}

          {/* düzineler */}
          {[1, 2, 3].map((d) => (
            <Spot
              key={`d${d}`}
              {...spot("dozen", d)}
              name={`${(d - 1) * 12 + 1}–${d * 12}`}
              className={`rounded-[4px] text-[13px] tracking-wide text-[#f3e3b3] ${LINE}`}
              style={{ gridColumn: `${2 + (d - 1) * 4} / span 4`, gridRow: 4 }}
            >
              {d === 1 ? "1. 12" : d === 2 ? "2. 12" : "3. 12"}
            </Spot>
          ))}

          {/* dış bahisler */}
          {outside.map((o, i) => (
            <Spot
              key={o.kind}
              {...spot(o.kind)}
              name={o.name}
              className={`rounded-[4px] text-[13px] tracking-wide text-[#f3e3b3] ${LINE} ${i === 0 ? "rounded-bl-[14px]" : ""} ${i === 5 ? "rounded-br-[14px]" : ""}`}
              style={{ gridColumn: `${2 + i * 2} / span 2`, gridRow: 5 }}
            >
              {o.body}
            </Spot>
          ))}
        </div>
      </div>
    </div>
  );
}

/** Telefon: aynı masa dikey — üç sütun, yukarıdan aşağı 1'den 36'ya. */
function NarrowTable({ spot }: { spot: (kind: RouletteBetKind, n?: number) => SpotProps }) {
  return (
    <div className="rounded-[22px] p-[2px] bg-gradient-to-b from-[#ffe7a3] via-[#b8862a] to-[#6e4c0a] shadow-[0_14px_30px_rgba(0,0,0,0.5)]">
      <div className={`rounded-[20px] ${FELT} p-2.5`}>
        <div className="mb-1 grid grid-cols-2 gap-1">
          <Spot {...spot("straight", 0)} name="0" chipAt="right" className={`h-9 rounded-t-[14px] rounded-b-md text-sm ${LINE}`} style={{ background: CELL_BG.green }}>
            0
          </Spot>
          <Spot {...spot("straight", 37)} name="00" chipAt="right" className={`h-9 rounded-t-[14px] rounded-b-md text-sm ${LINE}`} style={{ background: CELL_BG.green }}>
            00
          </Spot>
        </div>
        <div className="grid grid-cols-3 gap-1">
          {Array.from({ length: 36 }, (_, i) => i + 1).map((n) => (
            <Spot key={n} {...spot("straight", n)} name={String(n)} chipAt="right" className={`h-8 rounded-md text-sm ${LINE}`} style={{ background: CELL_BG[colorOf(n)] }}>
              {n}
            </Spot>
          ))}
          {[1, 2, 3].map((c) => (
            <Spot key={`c${c}`} {...spot("column", c)} name={`${c}. sütun 2:1`} chipAt="right" className={`h-8 rounded-md text-[11px] text-[#f3e3b3] ${LINE}`}>
              2:1
            </Spot>
          ))}
        </div>
        <div className="mt-1 grid grid-cols-3 gap-1">
          {[1, 2, 3].map((d) => (
            <Spot key={`d${d}`} {...spot("dozen", d)} name={`${(d - 1) * 12 + 1}–${d * 12}`} chipAt="right" className={`h-9 rounded-md text-xs text-[#f3e3b3] ${LINE}`}>
              {`${(d - 1) * 12 + 1}–${d * 12}`}
            </Spot>
          ))}
        </div>
        <div className="mt-1 grid grid-cols-3 gap-1">
          <Spot {...spot("low")} name="1–18" chipAt="right" className={`h-9 rounded-md text-xs text-[#f3e3b3] ${LINE}`}>1–18</Spot>
          <Spot {...spot("even")} name="ÇİFT" chipAt="right" className={`h-9 rounded-md text-xs text-[#f3e3b3] ${LINE}`}>ÇİFT</Spot>
          <Spot {...spot("red")} name="KIRMIZI" chipAt="right" className={`h-9 rounded-md text-xs ${LINE}`} style={{ background: CELL_BG.red }}>KIRMIZI</Spot>
          <Spot {...spot("black")} name="SİYAH" chipAt="right" className={`h-9 rounded-md text-xs ${LINE}`} style={{ background: CELL_BG.black }}>SİYAH</Spot>
          <Spot {...spot("odd")} name="TEK" chipAt="right" className={`h-9 rounded-md text-xs text-[#f3e3b3] ${LINE}`}>TEK</Spot>
          <Spot {...spot("high")} name="19–36" chipAt="right" className={`h-9 rounded-md text-xs text-[#f3e3b3] ${LINE}`}>19–36</Spot>
        </div>
      </div>
    </div>
  );
}

/* ================================================================
   OYUN
   ================================================================ */

export function RouletteGame({
  balance,
  onSettled,
  onReload,
}: {
  balance: number;
  onSettled: (b: number) => void;
  onReload: () => Promise<void>;
}) {
  const [chip, setChip] = useState(CHIPS[1]!.amount);
  const [bets, setBets] = useState<Map<Key, number>>(new Map());
  /** Geri alma için sırayla konan jetonlar. */
  const [placed, setPlaced] = useState<{ key: Key; amount: number }[]>([]);
  const [lastBets, setLastBets] = useState<Map<Key, number> | null>(null);
  const [spinning, setSpinning] = useState(false);
  const [result, setResult] = useState<(SpinResponse & { stake: number }) | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<number[]>([]);

  const rotorRef = useRef<SVGGElement | null>(null);
  const ballRef = useRef<SVGCircleElement | null>(null);
  const boxRef = useRef<HTMLDivElement | null>(null);
  const angle = useRef(0);
  /** Topun ekran açısı (0 = tepe, saat yönü) ve merkeze uzaklığı. */
  const ball = useRef({ a: 0, r: BALL_POCKET });
  const raf = useRef<number | null>(null);
  useEffect(() => () => {
    if (raf.current != null) cancelAnimationFrame(raf.current);
  }, []);
  const paint = () => {
    rotorRef.current?.setAttribute("transform", `rotate(${angle.current.toFixed(3)})`);
    const b = ballRef.current;
    if (b) {
      const t = (ball.current.a * Math.PI) / 180;
      b.setAttribute("cx", (ball.current.r * Math.sin(t)).toFixed(3));
      b.setAttribute("cy", (-ball.current.r * Math.cos(t)).toFixed(3));
    }
  };

  // Telefonda masa aşağıdayken çark ekran dışında kalır: çevirince ona
  // kaydır. Çizim tamamlandıktan sonra (effect) — tıklama anında başlatılan
  // kaydırmayı hemen ardından gelen yeniden çizim bölebiliyordu.
  useEffect(() => {
    if (!spinning) return;
    const box = boxRef.current?.getBoundingClientRect();
    if (box && (box.top < 0 || box.bottom > window.innerHeight)) {
      boxRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [spinning]);

  const total = [...bets.values()].reduce((a, b) => a + b, 0);
  const wins = result && !spinning ? winningKeys(result.result.pocket) : null;

  function place(kind: RouletteBetKind, n?: number) {
    if (spinning) return;
    sfx.prime();
    const k = keyOf(kind, n);
    if (total + chip > MAX_BET) {
      setError(`Bir çevirmede en fazla ${coins(MAX_BET)} coin`);
      return;
    }
    if (total + chip > balance) {
      setError("Bakiye yetmiyor");
      return;
    }
    setError(null);
    if (result) setResult(null);
    sfx.chip();
    setBets((m) => new Map(m).set(k, (m.get(k) ?? 0) + chip));
    setPlaced((p) => [...p, { key: k, amount: chip }]);
  }

  function undo() {
    const last = placed.at(-1);
    if (!last || spinning) return;
    sfx.click();
    setPlaced((p) => p.slice(0, -1));
    setBets((m) => {
      const next = new Map(m);
      const v = (next.get(last.key) ?? 0) - last.amount;
      if (v > 0) next.set(last.key, v);
      else next.delete(last.key);
      return next;
    });
  }

  function clear() {
    if (spinning) return;
    sfx.click();
    setBets(new Map());
    setPlaced([]);
    setError(null);
  }

  function repeat() {
    if (!lastBets || spinning) return;
    const t = [...lastBets.values()].reduce((a, b) => a + b, 0);
    if (t > balance) {
      setError("Önceki bahisler için bakiye yetmiyor");
      return;
    }
    sfx.chip();
    setError(null);
    setResult(null);
    setBets(new Map(lastBets));
    setPlaced([...lastBets.entries()].map(([key, amount]) => ({ key, amount })));
  }

  async function spin() {
    if (spinning || total < MIN_BET) return;
    sfx.prime();
    sfx.click();
    setError(null);
    setResult(null);
    setSpinning(true);

    const stake = total;
    const snapshot = new Map(bets);
    const apiBets: RouletteBet[] = [...bets.entries()].map(([k, amount]) => ({ ...parseKey(k), amount }));

    const started = performance.now();
    let last = started;
    const launchR = ball.current.r;
    type BallPlan = { rel0: number; dist: number };
    let landing: { from: number; distance: number; at: number; duration: number; ball: BallPlan | null } | null = null;
    let onLanded: (() => void) | null = null;
    let pending: { target: number } | null = null;

    const frame = (now: number) => {
      if (landing) {
        const u = Math.min(1, (now - landing.at) / landing.duration);
        angle.current = landing.from + landing.distance * easeOutCubic(u);
        if (landing.ball) {
          // Top çarka göre konumlanır: pistte yavaşlar, cebe düşer, sonra
          // cebiyle birlikte döner. Bitişte cep (ve top) tam tepede.
          const v = Math.min(1, u / BALL_SETTLE);
          const rel = landing.ball.rel0 - landing.ball.dist * easeOutCubic(v);
          ball.current.a = angle.current + rel;
          const p = Math.max(0, (v - BALL_DROP) / (1 - BALL_DROP));
          ball.current.r = BALL_TRACK + (BALL_POCKET - BALL_TRACK) * (p > 0 ? easeOutBounce(p) : 0);
        } else {
          // Hata: top pistte yavaşlayıp durur.
          ball.current.a -= BALL_DEG_S * (1 - u) * ((now - last) / 1000);
        }
        paint();
        if (u >= 1) {
          raf.current = null;
          onLanded?.();
          return;
        }
      } else {
        const dt = (now - last) / 1000;
        const ramp = Math.min(1, (now - started) / RAMP_MS);
        angle.current += CRUISE_DEG_S * ramp * dt;
        ball.current.a -= BALL_DEG_S * ramp * dt;
        ball.current.r = launchR + (BALL_TRACK - launchR) * ramp;
        paint();
        if (pending && ramp >= 1) {
          const current = ((angle.current % 360) + 360) % 360;
          let distance = (((360 - pending.target - current) % 360) + 360) % 360;
          const minDistance = (CRUISE_DEG_S * MIN_DECEL_MS) / 3000;
          while (distance < minDistance) distance += 360;
          const duration = (3000 * distance) / CRUISE_DEG_S;
          // Topun çarka göreli yolu: bitişte hedef cebin ortasında olmalı.
          // Başlangıç hızı pistteki hızla uyuşsun diye tur sayısı seçilir.
          const rel0 = ball.current.a - angle.current;
          const rem = ((((rel0 - pending.target) % 360) + 360) % 360);
          const want = ((BALL_DEG_S + CRUISE_DEG_S) * BALL_SETTLE * duration) / 3000;
          const dist = rem + 360 * Math.max(0, Math.round((want - rem) / 360));
          landing = { from: angle.current, distance, at: now, duration, ball: { rel0, dist } };
        }
      }
      last = now;
      raf.current = requestAnimationFrame(frame);
    };
    raf.current = requestAnimationFrame(frame);

    try {
      const res = await post<SpinResponse>("/api/games/roulette/bet", {
        bets: apiBets,
        idempotencyKey: newKey("roulette"),
      });
      onLanded = () => {
        setResult({ ...res, stake });
        setSpinning(false);
        onSettled(res.balance);
        setHistory((h) => [res.result.pocket, ...h].slice(0, 14));
        setLastBets(snapshot);
        if (res.payout > stake) sfx.win(res.mult);
        else sfx.lose();
        if (res.newBadges.length > 0) setTimeout(() => sfx.badge(), 450);
        void onReload();
      };
      const idx = WHEEL_ORDER.indexOf(res.result.pocket);
      pending = { target: idx * STEP + STEP / 2 };
    } catch (e) {
      const message = e instanceof Error ? e.message : "Bir hata oldu";
      onLanded = () => {
        setSpinning(false);
        setError(message);
        ball.current.r = BALL_POCKET;
      };
      const now = performance.now();
      landing = { from: angle.current, distance: CRUISE_DEG_S * 0.25, at: now, duration: 750, ball: null };
    }
  }

  const landed = result && !spinning ? result.result : null;
  const showBall = spinning || !!landed;

  /** Masadaki alanın ortak özellikleri. */
  const spot = (kind: RouletteBetKind, n?: number): SpotProps => {
    const k = keyOf(kind, n);
    const hit = !!wins?.has(k);
    return { kind, n, amount: bets.get(k), hit, dim: !!wins && !hit, disabled: spinning, onPlace: place };
  };

  const spinLabel = spinning
    ? "Dönüyor…"
    : total === 0
      ? "Masaya jeton koy"
      : total > balance
        ? "Bakiye yetersiz"
        : `ÇEVİR · ${coins(total)}`;
  const spinDisabled = spinning || total < MIN_BET || total > balance;

  return (
    <div className="space-y-5">
      {/* ================= ÜST: çark + kontrol ================= */}
      <div className="space-y-4 lg:grid lg:grid-cols-[340px_minmax(0,1fr)] lg:items-center lg:gap-10 lg:space-y-0">
        {/* --- ÇARK --- */}
        <div ref={boxRef} className="relative mx-auto aspect-square w-full max-w-[330px] scroll-mt-20">
          <div
            className={`pointer-events-none absolute -inset-6 rounded-full bg-[radial-gradient(circle,rgba(200,16,46,0.35),transparent_65%)] blur-2xl transition-opacity duration-700 ${spinning ? "opacity-100" : "opacity-50"}`}
          />
          <svg viewBox="-122 -124 244 246" className="relative size-full drop-shadow-[0_24px_40px_rgba(0,0,0,0.7)]" aria-hidden>
            <defs>
              <radialGradient id="rl-bowl" cx="50%" cy="45%" r="55%">
                <stop offset="70%" stopColor="#6b3818" />
                <stop offset="88%" stopColor="#4a240d" />
                <stop offset="100%" stopColor="#2a1206" />
              </radialGradient>
              <radialGradient id="rl-track" cx="50%" cy="50%" r="50%">
                <stop offset="84%" stopColor="#1c0d05" />
                <stop offset="93%" stopColor="#5b3417" />
                <stop offset="100%" stopColor="#2e1608" />
              </radialGradient>
              <radialGradient id="rl-cone" cx="42%" cy="38%" r="65%">
                <stop offset="0%" stopColor="#b07a42" />
                <stop offset="55%" stopColor="#6e3f1c" />
                <stop offset="100%" stopColor="#341909" />
              </radialGradient>
              <radialGradient id="rl-pocketShade" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="#000" stopOpacity="0" />
                <stop offset="100%" stopColor="#000" stopOpacity="0.45" />
              </radialGradient>
              <linearGradient id="rl-gold" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#fff2c2" />
                <stop offset="45%" stopColor="#e0ac48" />
                <stop offset="100%" stopColor="#8a5f0c" />
              </linearGradient>
              <radialGradient id="rl-knob" cx="38%" cy="32%" r="70%">
                <stop offset="0%" stopColor="#fff6d6" />
                <stop offset="45%" stopColor="#f0c060" />
                <stop offset="100%" stopColor="#7a5204" />
              </radialGradient>
              <radialGradient id="rl-ball" cx="35%" cy="30%" r="70%">
                <stop offset="0%" stopColor="#ffffff" />
                <stop offset="55%" stopColor="#e6e9f0" />
                <stop offset="100%" stopColor="#8b91a1" />
              </radialGradient>
              <linearGradient id="rl-shine" x1="0.15" y1="0" x2="0.6" y2="0.7">
                <stop offset="0%" stopColor="#fff" stopOpacity="0.2" />
                <stop offset="45%" stopColor="#fff" stopOpacity="0" />
              </linearGradient>
            </defs>

            {/* ahşap kase + altın kenar */}
            <circle r={R_BOWL} fill="url(#rl-bowl)" />
            <circle r={R_BOWL - 1} fill="none" stroke="url(#rl-gold)" strokeWidth={2.2} />
            {/* top pisti */}
            <circle r={R_TRACK_OUT} fill="url(#rl-track)" stroke="url(#rl-gold)" strokeWidth={1.1} />
            <circle r={R_TRACK_IN} fill="#120803" />

            {/* dönen rotor */}
            <g ref={rotorRef}>
              <Rotor />
            </g>

            {/* pistteki saptırıcılar */}
            {Array.from({ length: 8 }, (_, k) => (
              <polygon
                key={k}
                points="0,-3.4 2.1,0 0,3.4 -2.1,0"
                fill="url(#rl-gold)"
                transform={`rotate(${k * 45 + 22.5}) translate(0 ${-(R_TRACK_OUT + R_TRACK_IN) / 2 - 1})`}
              />
            ))}

            {/* kazanan cep: tepede parlayan dilim */}
            {landed ? (
              <path d={ringSlice(-0.5, R_NUM_OUT, R_POCKET_IN)} fill="#fff6c9" fillOpacity={0.55} stroke="#ffd062" strokeWidth={1.2} className="animate-pulse" />
            ) : null}

            {/* top */}
            <circle
              ref={ballRef}
              r={BALL_R}
              cx={0}
              cy={-BALL_POCKET}
              fill="url(#rl-ball)"
              style={{ opacity: showBall ? 1 : 0, transition: "opacity 200ms", filter: "drop-shadow(0 1px 1.2px rgba(0,0,0,0.7))" }}
            />

            {/* işaretçi */}
            <path d="M-7 -123 L7 -123 L0 -110 Z" fill="url(#rl-gold)" stroke="#6e4c0a" strokeWidth={0.8} />

            {/* cam parlaklığı */}
            <circle r={R_BOWL} fill="url(#rl-shine)" pointerEvents="none" />
          </svg>

          {/* göbekte son sonuç */}
          {landed ? (
            <div
              className="animate-pop absolute left-1/2 top-1/2 grid size-[21%] -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full font-display text-2xl font-black text-white ring-2 ring-[#ffd062] shadow-[0_6px_16px_rgba(0,0,0,0.6)]"
              style={{ background: COLOR_BG[landed.color] }}
            >
              {landed.label}
            </div>
          ) : null}
        </div>

        {/* --- KONTROL --- */}
        <div className="space-y-3">
          <div className="grid min-h-[64px] place-items-center">
            {error ? (
              <p className="rounded-2xl bg-lose/15 px-4 py-2.5 text-sm text-lose">{error}</p>
            ) : result && !spinning ? (
              <ResultFlash payout={result.payout} stake={result.stake} mult={result.mult} badges={result.newBadges} />
            ) : spinning ? (
              <p className="animate-pulse text-sm text-muted">top dönüyor…</p>
            ) : (
              <p className="text-sm text-muted">Jetonunu seç, masaya koy ve çevir</p>
            )}
          </div>

          {/* son sayılar tabelası */}
          <div className="rounded-2xl bg-black/35 px-3 py-2 ring-1 ring-white/10">
            <div className="mb-1.5 text-[10px] font-black uppercase tracking-widest text-muted">Son sayılar</div>
            {history.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {history.map((p, i) => (
                  <span
                    key={i}
                    className={`tabular grid place-items-center rounded-full font-display font-black text-white ring-1 ring-white/20 ${
                      i === 0 ? "size-8 text-sm ring-2 ring-gold" : "size-7 text-[11px] opacity-85"
                    }`}
                    style={{ background: COLOR_BG[colorOf(p)] }}
                  >
                    {label(p)}
                  </span>
                ))}
              </div>
            ) : (
              <div className="text-xs text-white/40">Henüz çevirme yok</div>
            )}
          </div>

          {/* jetonlar */}
          <div className="gold-hairline rounded-3xl bg-gradient-to-b from-surface-2/80 to-surface/90 p-3">
            <div className="mb-2.5 flex items-center justify-between">
              <span className="text-[11px] font-black uppercase tracking-widest text-muted">Jeton</span>
              <span className="tabular text-xs font-bold text-white/70">
                masada <strong className="font-display text-base text-gold">{coins(total)}</strong>
              </span>
            </div>
            <div className="mb-2.5 flex justify-between gap-1.5 lg:justify-start lg:gap-3">
              {CHIPS.map((c) => {
                const active = chip === c.amount;
                return (
                  <button
                    key={c.v}
                    type="button"
                    disabled={spinning}
                    onClick={() => {
                      sfx.prime();
                      sfx.click();
                      setChip(c.amount);
                    }}
                    aria-label={`${c.v} coin jeton`}
                    aria-pressed={active}
                    className={`relative grid size-12 shrink-0 place-items-center rounded-full transition disabled:opacity-40 ${
                      active ? "-translate-y-1 scale-110" : "active:scale-95"
                    }`}
                    style={{
                      background: `repeating-conic-gradient(${c.face} 0deg 30deg, #ffffff 30deg 45deg)`,
                      boxShadow: active
                        ? "0 0 0 2.5px #ffd062, 0 8px 16px rgba(0,0,0,0.6)"
                        : "0 4px 10px rgba(0,0,0,0.5)",
                    }}
                  >
                    <span
                      className="grid size-[34px] place-items-center rounded-full font-display text-[11px] font-black"
                      style={{
                        background: `radial-gradient(circle at 50% 35%, ${c.face} 0 60%, ${c.edge} 100%)`,
                        color: c.ink,
                        boxShadow: `inset 0 0 0 1.5px rgba(255,255,255,0.55), inset 0 2px 3px rgba(255,255,255,0.25)`,
                      }}
                    >
                      {c.v}
                    </span>
                  </button>
                );
              })}
            </div>
            <div className="grid grid-cols-3 gap-1.5">
              {[
                { label: "↶ geri al", fn: undo, off: placed.length === 0 },
                { label: "temizle", fn: clear, off: bets.size === 0 },
                { label: "↻ aynısı", fn: repeat, off: !lastBets },
              ].map((b) => (
                <button
                  key={b.label}
                  type="button"
                  onClick={b.fn}
                  disabled={spinning || b.off}
                  className="rounded-xl bg-white/6 py-2 text-xs font-black text-white/75 ring-1 ring-white/10 transition active:bg-white/14 disabled:opacity-30"
                >
                  {b.label}
                </button>
              ))}
            </div>
          </div>

          {/* geniş ekranda çevir düğmesi burada — masanın hemen üstünde, kaydırmadan görünür */}
          <div className="hidden lg:block">
            <Button onClick={spin} disabled={spinDisabled} tone="gold" className="w-full !py-4 !text-lg">
              {spinLabel}
            </Button>
          </div>
        </div>
      </div>

      {/* ================= MASA: çarkın altında ================= */}
      <div className="lg:hidden">
        <NarrowTable spot={spot} />
      </div>
      <div className="hidden lg:block">
        <WideTable spot={spot} />
      </div>

      {/* telefonda çevir düğmesi ekranın altına sabit */}
      <div className="lg:hidden">
        <ActionDock>
          <Button onClick={spin} disabled={spinDisabled} tone="gold" className="w-full !py-4 !text-lg">
            {spinLabel}
          </Button>
        </ActionDock>
      </div>

      <Card>
        <SectionTitle right="RTP %94,7">Ödemeler</SectionTitle>
        <div className="lg:grid lg:grid-cols-2 lg:gap-8">
          <ul className="space-y-1 text-xs text-white/80">
            <li className="flex justify-between"><span>Tek sayı (0 ve 00 dahil)</span><strong className="text-gold">35:1</strong></li>
            <li className="flex justify-between"><span>Düzine · sütun (2:1)</span><strong className="text-gold">2:1</strong></li>
            <li className="flex justify-between"><span>Kırmızı/siyah · tek/çift · 1–18/19–36</span><strong className="text-gold">1:1</strong></li>
          </ul>
          <p className="mt-3 text-[11px] leading-relaxed text-muted lg:mt-0">
            Amerikan masası: 38 cep, 0 ve 00 yeşil. Top 0 ya da 00&apos;a düşerse dış bahislerin hepsi kaybeder —
            ev avantajı buradan gelir ve her bahiste aynıdır (36/38 = %94,7). Bir çevirmede istediğin kadar alana
            jeton koyabilirsin; toplam en fazla {coins(MAX_BET)} coin.
          </p>
        </div>
      </Card>

      <div className="flex justify-center">
        <Pill tone="info">top sunucuda atılır</Pill>
      </div>
    </div>
  );
}

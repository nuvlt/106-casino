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
const CRUISE_DEG_S = 540;
const RAMP_MS = 300;
const MIN_DECEL_MS = 3400;
const R = 100;

const CHIPS = [
  { v: 10, face: "#2f80ed", edge: "#1d5fae" },
  { v: 50, face: "#1f8b4c", edge: "#0b3d22" },
  { v: 100, face: "#e01e37", edge: "#7a0d1d" },
  { v: 250, face: "#9d5cff", edge: "#4a0d8a" },
  { v: 500, face: "#ffc94a", edge: "#8d6205" },
].map((c) => ({ ...c, amount: c.v * COIN }));

const label = (p: number) => (p === ROULETTE_DOUBLE_ZERO ? "00" : String(p));
const colorOf = (p: number) =>
  p === 0 || p === ROULETTE_DOUBLE_ZERO ? "green" : ROULETTE_RED.has(p) ? "red" : "black";
const COLOR_BG = { green: "#1f8b4c", red: "#c8102e", black: "#14171f" } as const;

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

function sector(i: number) {
  const a0 = ((i * STEP - 90) * Math.PI) / 180;
  const a1 = (((i + 1) * STEP - 90) * Math.PI) / 180;
  const f = (v: number) => Number(v.toFixed(3));
  return `M0 0 L${f(R * Math.cos(a0))} ${f(R * Math.sin(a0))} A${R} ${R} 0 0 1 ${f(R * Math.cos(a1))} ${f(R * Math.sin(a1))} Z`;
}

function ChipBadge({ amount }: { amount: number }) {
  return (
    <span className="pointer-events-none absolute -right-1 -top-1 z-10 grid min-w-[20px] place-items-center rounded-full bg-gradient-to-b from-[#fff3cc] to-[#d9a13a] px-1 text-[9px] font-black leading-[18px] text-[#3a2500] shadow-[0_2px_4px_rgba(0,0,0,0.6)] ring-1 ring-[#7a5804]">
      {amount / COIN >= 1000 ? `${Math.round(amount / COIN / 100) / 10}k` : amount / COIN}
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
  children,
  className = "",
  style,
  amount,
  hit,
  dim,
  disabled,
  onPlace,
}: {
  kind: RouletteBetKind;
  n?: number;
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
  amount?: number;
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
      aria-label={`${children} alanına bahis`}
      style={style}
      className={`relative grid place-items-center rounded-md font-display font-black text-white ring-1 transition
        active:scale-95 disabled:active:scale-100
        ${hit ? "z-10 ring-2 ring-[#ffe89a] shadow-[0_0_14px_rgba(255,232,154,0.8)]" : "ring-white/15"}
        ${dim ? "opacity-45" : ""} ${className}`}
    >
      {children}
      {amount ? <ChipBadge amount={amount} /> : null}
    </button>
  );
}

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

  const wheelRef = useRef<HTMLDivElement | null>(null);
  const boxRef = useRef<HTMLDivElement | null>(null);
  const angle = useRef(0);
  const raf = useRef<number | null>(null);
  useEffect(() => () => {
    if (raf.current != null) cancelAnimationFrame(raf.current);
  }, []);
  const paint = () => {
    if (wheelRef.current) wheelRef.current.style.transform = `rotate(${angle.current}deg) translateZ(0)`;
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
    let landing: { from: number; distance: number; at: number; duration: number } | null = null;
    let onLanded: (() => void) | null = null;
    let pending: { target: number } | null = null;

    const frame = (now: number) => {
      if (landing) {
        const u = Math.min(1, (now - landing.at) / landing.duration);
        angle.current = landing.from + landing.distance * (1 - Math.pow(1 - u, 3));
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
        paint();
        if (pending && ramp >= 1) {
          const current = ((angle.current % 360) + 360) % 360;
          let distance = (((360 - pending.target - current) % 360) + 360) % 360;
          const minDistance = (CRUISE_DEG_S * MIN_DECEL_MS) / 3000;
          while (distance < minDistance) distance += 360;
          landing = { from: angle.current, distance, at: now, duration: (3000 * distance) / CRUISE_DEG_S };
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
        setHistory((h) => [res.result.pocket, ...h].slice(0, 16));
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
      };
      const now = performance.now();
      landing = { from: angle.current, distance: CRUISE_DEG_S * 0.25, at: now, duration: 750 };
    }
  }

  const landed = result && !spinning ? result.result : null;

  /** Masadaki alanın ortak özellikleri. */
  const spot = (kind: RouletteBetKind, n?: number) => {
    const k = keyOf(kind, n);
    const hit = !!wins?.has(k);
    return { kind, n, amount: bets.get(k), hit, dim: !!wins && !hit, disabled: spinning, onPlace: place };
  };

  return (
    <div className="space-y-4 lg:grid lg:grid-cols-[minmax(0,1.05fr)_minmax(0,360px)] lg:items-start lg:gap-6 lg:space-y-0">
      <div className="space-y-4">
        {/* --- ÇARK --- */}
        <div ref={boxRef} className="relative mx-auto aspect-square w-full max-w-[330px] scroll-mt-20">
          <div className={`pointer-events-none absolute -inset-5 rounded-full bg-[#c8102e]/25 blur-3xl transition-opacity duration-700 ${spinning ? "opacity-90" : "opacity-40"}`} />

          {/* top işaretçisi */}
          <div className="absolute left-1/2 top-[-4px] z-20 -translate-x-1/2">
            <svg width="26" height="30" viewBox="0 0 26 30" className="drop-shadow-[0_3px_6px_rgba(0,0,0,0.7)]">
              <path d="M3 2 L23 2 L13 26 Z" fill="#ffd062" stroke="#7a5804" strokeWidth="1.2" />
            </svg>
          </div>

          <div className="absolute inset-0 rounded-full bg-gradient-to-b from-[#fff0bf] via-[#d9a13a] to-[#8d6205] p-[8px] shadow-[0_22px_60px_rgba(0,0,0,0.65)]">
            <div className="relative size-full overflow-hidden rounded-full bg-[#3b1d0e] shadow-[inset_0_0_30px_rgba(0,0,0,0.9)]">
              <div ref={wheelRef} className="size-full" style={{ willChange: "transform" }}>
                <svg viewBox="-105 -105 210 210" className="size-full">
                  {WHEEL_ORDER.map((p, i) => (
                    <path key={p} d={sector(i)} fill={COLOR_BG[colorOf(p)]} stroke="#d9a13a" strokeWidth={0.5} strokeOpacity={0.6} />
                  ))}
                  {WHEEL_ORDER.map((p, i) => {
                    const mid = i * STEP + STEP / 2;
                    const rad = ((mid - 90) * Math.PI) / 180;
                    const rr = R * 0.84;
                    const tx = Number((rr * Math.cos(rad)).toFixed(3));
                    const ty = Number((rr * Math.sin(rad)).toFixed(3));
                    return (
                      <text
                        key={`t${p}`}
                        x={tx}
                        y={ty}
                        fill="#ffffff"
                        fontSize={8}
                        fontWeight={800}
                        textAnchor="middle"
                        dominantBaseline="middle"
                        transform={`rotate(${mid.toFixed(3)} ${tx} ${ty})`}
                      >
                        {label(p)}
                      </text>
                    );
                  })}
                  <circle r={R * 0.66} fill="#5a2d12" stroke="#d9a13a" strokeWidth={1.4} />
                  <circle r={R * 0.52} fill="#3b1d0e" />
                  {[0, 45, 90, 135].map((d) => (
                    <rect key={d} x={-2} y={-R * 0.5} width={4} height={R} rx={2} fill="#d9a13a" opacity={0.85} transform={`rotate(${d})`} />
                  ))}
                  <circle r={R * 0.14} fill="#ffd062" />
                </svg>
              </div>

              {/* top: dönerken yörüngede, durunca işaretçinin altında */}
              {spinning ? (
                <div className="pointer-events-none absolute inset-[6%] animate-[spin_0.9s_linear_infinite_reverse]">
                  <span className="absolute left-1/2 top-0 size-3 -translate-x-1/2 rounded-full bg-white shadow-[0_0_6px_rgba(255,255,255,0.9)]" />
                </div>
              ) : landed ? (
                <span className="pointer-events-none absolute left-1/2 top-[11%] size-3 -translate-x-1/2 rounded-full bg-white shadow-[0_0_8px_rgba(255,255,255,1)]" />
              ) : null}

              <div className="pointer-events-none absolute inset-0 rounded-full bg-[linear-gradient(200deg,rgba(255,255,255,0.18)_0%,transparent_40%)]" />

              {/* göbekte son sonuç */}
              {landed ? (
                <div
                  className="animate-pop absolute left-1/2 top-1/2 grid size-[24%] -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full font-display text-2xl font-black text-white ring-2 ring-[#ffd062]"
                  style={{ background: COLOR_BG[landed.color] }}
                >
                  {landed.label}
                </div>
              ) : null}
            </div>
          </div>
        </div>

        {/* --- SONUÇ --- */}
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

        {history.length > 0 ? (
          <div className="flex flex-wrap justify-center gap-1.5">
            {history.map((p, i) => (
              <span
                key={i}
                className={`tabular grid h-7 min-w-7 place-items-center rounded-full px-1.5 text-[11px] font-black text-white ring-1 ring-white/20 ${i === 0 ? "ring-2 ring-gold" : ""}`}
                style={{ background: COLOR_BG[colorOf(p)] }}
              >
                {label(p)}
              </span>
            ))}
          </div>
        ) : null}
      </div>

      {/* Geniş ekranda çevir düğmesi masanın ÜSTÜNDE (order): masa uzun, altta
          kalsaydı laptop ekranında düğmeye ulaşmak için kaydırmak gerekirdi.
          Telefonda düğme zaten alta sabit (ActionDock). */}
      <div className="flex flex-col gap-3">
        {/* --- JETON --- */}
        <div className="gold-hairline rounded-3xl lg:order-1 bg-gradient-to-b from-surface-2/80 to-surface/90 p-3">
          <div className="mb-2.5 flex items-center justify-between">
            <span className="text-[11px] font-black uppercase tracking-widest text-muted">Jeton</span>
            <span className="tabular text-xs font-bold text-white/70">
              masada <strong className="font-display text-base text-gold">{coins(total)}</strong>
            </span>
          </div>
          <div className="mb-2.5 flex justify-between gap-1.5">
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
                  className={`relative grid size-11 shrink-0 place-items-center rounded-full font-display text-[11px] font-black transition disabled:opacity-40 ${
                    active ? "-translate-y-0.5 scale-110" : "active:scale-95"
                  }`}
                  style={{
                    background: `radial-gradient(circle at 50% 35%, ${c.face} 0 54%, ${c.edge} 55% 100%)`,
                    boxShadow: active
                      ? "0 0 0 2.5px #ffd062, 0 6px 14px rgba(0,0,0,0.55)"
                      : "0 4px 10px rgba(0,0,0,0.5), inset 0 1px 2px rgba(255,255,255,0.35)",
                    color: c.v === 500 ? "#3a2500" : "#ffffff",
                  }}
                >
                  {c.v}
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

        {/* --- MASA --- */}
        <div className="rounded-3xl lg:order-3 bg-[radial-gradient(120%_100%_at_50%_0%,#1d6a42_0%,#0d3b25_60%,#061a12_100%)] p-2.5 ring-1 ring-gold/30">
          <div className="mb-1 grid grid-cols-2 gap-1">
            <Spot {...spot("straight", 0)} className="h-9 text-sm" style={{ background: COLOR_BG.green }}>0</Spot>
            <Spot {...spot("straight", 37)} className="h-9 text-sm" style={{ background: COLOR_BG.green }}>00</Spot>
          </div>
          <div className="grid grid-cols-3 gap-1">
            {Array.from({ length: 36 }, (_, i) => i + 1).map((n) => (
              <Spot key={n} {...spot("straight", n)} className="h-8 text-sm" style={{ background: COLOR_BG[colorOf(n)] }}>
                {n}
              </Spot>
            ))}
            {[1, 2, 3].map((c) => (
              <Spot key={`c${c}`} {...spot("column", c)} className="h-8 bg-black/30 text-[11px]">
                2:1
              </Spot>
            ))}
          </div>
          <div className="mt-1 grid grid-cols-3 gap-1">
            {[1, 2, 3].map((d) => (
              <Spot key={`d${d}`} {...spot("dozen", d)} className="h-9 bg-black/30 text-xs">
                {`${(d - 1) * 12 + 1}–${d * 12}`}
              </Spot>
            ))}
          </div>
          <div className="mt-1 grid grid-cols-3 gap-1">
            <Spot {...spot("low")} className="h-9 bg-black/30 text-xs">1–18</Spot>
            <Spot {...spot("even")} className="h-9 bg-black/30 text-xs">ÇİFT</Spot>
            <Spot {...spot("red")} className="h-9 text-xs" style={{ background: COLOR_BG.red }}>KIRMIZI</Spot>
            <Spot {...spot("black")} className="h-9 text-xs" style={{ background: COLOR_BG.black }}>SİYAH</Spot>
            <Spot {...spot("odd")} className="h-9 bg-black/30 text-xs">TEK</Spot>
            <Spot {...spot("high")} className="h-9 bg-black/30 text-xs">19–36</Spot>
          </div>
        </div>

        <div className="lg:order-2">
        <ActionDock>
          <Button onClick={spin} disabled={spinning || total < MIN_BET || total > balance} tone="gold" className="w-full !py-4 !text-lg">
            {spinning ? "Dönüyor…" : total === 0 ? "Masaya jeton koy" : total > balance ? "Bakiye yetersiz" : `ÇEVİR · ${coins(total)}`}
          </Button>
        </ActionDock>
        </div>

        <div className="lg:order-4">
        <Card>
          <SectionTitle right="RTP %94,7">Ödemeler</SectionTitle>
          <ul className="space-y-1 text-xs text-white/80">
            <li className="flex justify-between"><span>Tek sayı (0 ve 00 dahil)</span><strong className="text-gold">35:1</strong></li>
            <li className="flex justify-between"><span>Düzine · sütun (2:1)</span><strong className="text-gold">2:1</strong></li>
            <li className="flex justify-between"><span>Kırmızı/siyah · tek/çift · 1–18/19–36</span><strong className="text-gold">1:1</strong></li>
          </ul>
          <p className="mt-3 text-[11px] leading-relaxed text-muted">
            Amerikan masası: 38 cep, 0 ve 00 yeşil. Top 0 ya da 00&apos;a düşerse dış bahislerin hepsi kaybeder —
            ev avantajı buradan gelir ve her bahiste aynıdır (36/38 = %94,7). Bir çevirmede istediğin kadar alana
            jeton koyabilirsin; toplam en fazla {coins(MAX_BET)} coin.
          </p>
        </Card>
        </div>

        <div className="flex justify-center lg:order-5">
          <Pill tone="info">top sunucuda atılır</Pill>
        </div>
      </div>
    </div>
  );
}

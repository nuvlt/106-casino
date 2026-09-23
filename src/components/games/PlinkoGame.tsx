"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button, Card, Pill, SectionTitle } from "@/components/ui";
import { BetControls } from "@/components/games/BetControls";
import { newKey, post } from "@/hooks/useApi";
import { COIN, MIN_BET, PLINKO_BALL_CHOICES, PLINKO_TABLES } from "@/lib/games/config";
import { coins, mult as fmtMult } from "@/lib/format";
import { sfx } from "@/lib/sound";
import { ResultFlash } from "@/components/games/ResultFlash";

interface BallResult {
  roundId: string;
  payout: number;
  mult: number;
  result: { path: number[]; bucket: number; risk: string; rows: number };
}

interface PlinkoResponse {
  balls: BallResult[];
  totalStake: number;
  totalPayout: number;
  mult: number;
  balance: number;
  newBadges: { id: string; title: string; icon: string; reward: number }[];
}

type Risk = "low" | "medium" | "high";
type Rows = 8 | 12 | 16;

const RISKS: { key: Risk; label: string }[] = [
  { key: "low", label: "düşük" },
  { key: "medium", label: "orta" },
  { key: "high", label: "yüksek" },
];

/** Kova rengi — çarpan büyüdükçe soğuktan sıcağa. */
function bucketColor(m: number): string {
  if (m >= 50) return "#ffc94a";
  if (m >= 10) return "#ff8c1a";
  if (m >= 3) return "#e01e37";
  if (m >= 1.2) return "#9d5cff";
  if (m >= 0.6) return "#2f80ed";
  return "#1f3a5c";
}

const STEP_MS = 95; // topun bir sıra inme süresi

export function PlinkoGame({
  balance,
  onSettled,
  onReload,
}: {
  balance: number;
  onSettled: (b: number) => void;
  onReload: () => Promise<void>;
}) {
  const [bet, setBet] = useState(50 * COIN);
  const [risk, setRisk] = useState<Risk>("medium");
  const [rows, setRows] = useState<Rows>(12);
  const [balls, setBalls] = useState<number>(1);
  const [dropping, setDropping] = useState(false);
  /** Her topun o an indiği sıra. Uzunluğu = atılan top sayısı. */
  const [depths, setDepths] = useState<number[]>([]);
  const [paths, setPaths] = useState<number[][]>([]);
  const [result, setResult] = useState<PlinkoResponse | null>(null);
  /** Kovalara düşmüş topların sayısı — kova vurgusu için. */
  const [landed, setLanded] = useState<number[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<number[]>([]);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const table = PLINKO_TABLES[`${risk}_${rows}`] ?? [];

  const clearTimers = useCallback(() => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  }, []);
  useEffect(() => clearTimers, [clearTimers]);

  async function drop() {
    if (dropping) return;
    sfx.prime();
    sfx.click();
    setError(null);
    setResult(null);
    setDepths(Array.from({ length: balls }, () => 0));
    setPaths([]);
    setLanded([]);
    setDropping(true);

    try {
      const res = await post<PlinkoResponse>("/api/games/plinko/balls", {
        bet,
        balls,
        idempotencyKey: newKey("plinko"),
        risk,
        rows,
      });
      setPaths(res.balls.map((b) => b.result.path));

      // Toplar hafif kaydırılarak bırakılır — hepsi üst üste inseydi
      // tek top gibi görünür, çoklu atışın anlamı kalmazdı.
      const stagger = balls > 1 ? Math.min(140, 420 / balls) : 0;

      res.balls.forEach((ball, bi) => {
        const start = bi * stagger;
        for (let r = 1; r <= rows; r++) {
          timers.current.push(
            setTimeout(
              () => {
                setDepths((prev) => {
                  const next = [...prev];
                  next[bi] = r;
                  return next;
                });
                // Her çivide ses çalmak kalabalıkta gürültü olur;
                // yalnızca ilk top tıklar.
                if (bi === 0) sfx.tick();
              },
              start + r * STEP_MS,
            ),
          );
        }
        timers.current.push(
          setTimeout(
            () => setLanded((prev) => [...prev, ball.result.bucket]),
            start + rows * STEP_MS + 40,
          ),
        );
      });

      const total = (balls - 1) * stagger + rows * STEP_MS + 150;
      timers.current.push(
        setTimeout(() => {
          setResult(res);
          setDropping(false);
          onSettled(res.balance);
          setHistory((h) => [...res.balls.map((b) => b.mult), ...h].slice(0, 14));
          if (res.totalPayout > res.totalStake) sfx.win(res.mult);
          else sfx.lose();
          if (res.newBadges.length > 0) setTimeout(() => sfx.badge(), 450);
          void onReload();
        }, total),
      );
    } catch (e) {
      setDropping(false);
      setDepths([]);
      setError(e instanceof Error ? e.message : "Bir hata oldu");
    }
  }

  const W = 100;
  const pegGap = W / (rows + 2);

  /** Bir topun ekrandaki yeri: sağa sapma sayısı kadar kayar. */
  function ballPos(path: number[], depth: number) {
    const rights = path.slice(0, depth).reduce((a, b) => a + b, 0);
    const col = depth === 0 ? 0 : rights - depth / 2;
    return { x: 50 + col * pegGap, y: 8 + (depth / rows) * 74 };
  }

  /** Toplam bahis — top sayısıyla çarpılır. */
  const totalStake = bet * balls;
  const tooExpensive = totalStake > balance;

  return (
    <div className="space-y-4 lg:grid lg:grid-cols-[minmax(0,1.05fr)_minmax(0,360px)] lg:items-start lg:gap-6 lg:space-y-0">
      {/* Geniş ekranda tahta solda kalır, kontroller sağa geçer. */}
      <div className="space-y-4">
      {/* --- TAHTA --- */}
      <div className="gold-hairline relative overflow-hidden rounded-3xl bg-[radial-gradient(120%_100%_at_50%_0%,#2a1550_0%,#150a2b_45%,#090515_100%)] p-3">
        <div className="relative mx-auto aspect-[4/5] w-full lg:max-w-[400px]">
          <svg viewBox="0 0 100 100" className="absolute inset-0 size-full">
            {/* çiviler */}
            {Array.from({ length: rows }, (_, r) =>
              Array.from({ length: r + 3 }, (_, c) => {
                const y = 8 + ((r + 1) / rows) * 74;
                const x = 50 + (c - (r + 2) / 2) * pegGap;
                const hit = depths.some((d) => d === r + 1);
                return (
                  <circle
                    key={`${r}-${c}`}
                    cx={x.toFixed(2)}
                    cy={y.toFixed(2)}
                    r={rows > 12 ? 0.9 : 1.2}
                    fill={hit ? "#ffd062" : "#b9a6e8"}
                    opacity={hit ? 1 : 0.55}
                  />
                );
              }),
            )}

            {/* toplar */}
            {paths.map((path, i) => {
              const d = depths[i] ?? 0;
              const { x, y } = ballPos(path, d);
              return (
                <circle
                  key={i}
                  cx={x.toFixed(2)}
                  cy={y.toFixed(2)}
                  r={balls > 5 ? 1.9 : 2.4}
                  fill="#ffd062"
                  stroke="#fff3cc"
                  strokeWidth={0.6}
                  style={{ transition: `cx ${STEP_MS}ms linear, cy ${STEP_MS}ms linear` }}
                />
              );
            })}
          </svg>

          {/* kovalar */}
          <div className="absolute inset-x-0 bottom-0 flex gap-[2px]">
            {table.map((m100, i) => {
              const m = m100 / 100;
              const hits = landed.filter((b) => b === i).length;
              return (
                <div
                  key={i}
                  className={`relative flex-1 rounded-md py-1 text-center text-[8px] font-black transition ${
                    hits > 0 ? "scale-110 ring-2 ring-white" : ""
                  }`}
                  style={{
                    background: bucketColor(m),
                    color: m >= 10 ? "#3a2500" : "#ffffff",
                    fontSize: rows > 12 ? 6 : 8,
                  }}
                >
                  {m >= 10 ? Math.round(m) : m.toFixed(m < 1 ? 2 : 1)}
                  {hits > 1 ? (
                    <span
                      className="absolute -top-2 left-1/2 -translate-x-1/2 rounded-full bg-black/80
                                 px-1.5 text-[8px] font-black text-gold ring-1 ring-gold/40"
                    >
                      ×{hits}
                    </span>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* --- SONUÇ --- */}
      <div className="grid min-h-[56px] place-items-center">
        {error ? (
          <p className="rounded-2xl bg-lose/15 px-4 py-2.5 text-sm text-lose">{error}</p>
        ) : result ? (
          <ResultFlash
            payout={result.totalPayout}
            stake={result.totalStake}
            mult={result.mult}
            badges={result.newBadges}
          />
        ) : dropping ? (
          <p className="animate-pulse text-sm text-muted">
            {balls > 1 ? "toplar düşüyor…" : "top düşüyor…"}
          </p>
        ) : (
          <p className="text-sm text-muted">Riski seç ve topu bırak</p>
        )}
      </div>

      {result && result.newBadges.length > 0 ? (
        <div className="flex flex-wrap justify-center gap-2">
          {result.newBadges.map((b) => (
            <span key={b.id} className="animate-pop rounded-full bg-gold/15 px-3 py-1.5 text-xs font-black text-gold ring-1 ring-gold/30">
              {b.icon} {b.title} +{coins(b.reward)}
            </span>
          ))}
        </div>
      ) : null}

      </div>

      <div className="space-y-4 lg:sticky lg:top-20">
      {/* --- AYARLAR --- */}
      <div className="gold-hairline space-y-2.5 rounded-3xl bg-gradient-to-b from-surface-2/80 to-surface/90 p-3">
        <div>
          <span className="mb-1.5 block text-[11px] font-black uppercase tracking-widest text-muted">Risk</span>
          <div className="flex gap-1.5">
            {RISKS.map((r) => (
              <button
                key={r.key}
                disabled={dropping}
                onClick={() => {
                  setRisk(r.key);
                  sfx.click();
                }}
                className={`flex-1 rounded-xl py-2 text-xs font-black transition disabled:opacity-40 ${
                  risk === r.key ? "gold-metal text-[#3a2500]" : "bg-white/6 text-white/70 ring-1 ring-white/10"
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>
        <div>
          <span className="mb-1.5 block text-[11px] font-black uppercase tracking-widest text-muted">
            Top sayısı
          </span>
          <div className="flex gap-1.5">
            {PLINKO_BALL_CHOICES.map((n) => {
              // Yalnızca en küçük bahisle bile karşılanamıyorsa kapalı.
              const affordable = MIN_BET * n <= balance;
              return (
                <button
                  key={n}
                  disabled={dropping || !affordable}
                  onClick={() => {
                    setBalls(n);
                    // Mevcut bahis bu top sayısıyla bakiyeyi aşıyorsa
                    // oyuncuyu bahsi elle düşürmeye zorlamak yerine
                    // kendiliğinden kısıyoruz.
                    if (bet * n > balance) {
                      setBet(Math.max(MIN_BET, Math.floor(balance / n / COIN) * COIN));
                    }
                    sfx.chip();
                  }}
                  className={`flex-1 rounded-xl py-2 text-xs font-black transition disabled:opacity-30 ${
                    balls === n
                      ? "gold-metal text-[#3a2500]"
                      : "bg-white/6 text-white/70 ring-1 ring-white/10"
                  }`}
                >
                  {n}
                </button>
              );
            })}
          </div>
          {balls > 1 ? (
            <p className="tabular mt-1.5 text-[10px] text-muted">
              her top ayrı bir tur — toplam {coins(totalStake)}
            </p>
          ) : null}
        </div>

        <div>
          <span className="mb-1.5 block text-[11px] font-black uppercase tracking-widest text-muted">Sıra</span>
          <div className="flex gap-1.5">
            {([8, 12, 16] as Rows[]).map((r) => (
              <button
                key={r}
                disabled={dropping}
                onClick={() => {
                  setRows(r);
                  sfx.click();
                }}
                className={`flex-1 rounded-xl py-2 text-xs font-black transition disabled:opacity-40 ${
                  rows === r ? "gold-metal text-[#3a2500]" : "bg-white/6 text-white/70 ring-1 ring-white/10"
                }`}
              >
                {r}
              </button>
            ))}
          </div>
        </div>
      </div>

      <BetControls
        bet={bet}
        setBet={setBet}
        balance={Math.floor(balance / balls)}
        disabled={dropping}
      />

      <Button
        onClick={drop}
        disabled={dropping || tooExpensive}
        tone="gold"
        className="w-full !py-4 !text-lg"
      >
        {dropping
          ? "Düşüyor…"
          : tooExpensive
            ? "Bakiye yetersiz"
            : balls > 1
              ? `${balls} TOP BIRAK`
              : "TOPU BIRAK"}
      </Button>

      {history.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {history.map((m, i) => (
            <span
              key={i}
              className="tabular rounded-lg px-2 py-1 text-[11px] font-black"
              style={{ background: `${bucketColor(m)}33`, color: bucketColor(m) }}
            >
              {fmtMult(m)}
            </span>
          ))}
        </div>
      ) : null}

      <Card>
        <SectionTitle right="RTP %95">Nasıl çalışır</SectionTitle>
        <p className="text-xs leading-relaxed text-muted">
          Top her çivide %50 sola, %50 sağa sapar; kovaya düşme olasılığı binom dağılımıdır —
          ortadakiler sık, kenardakiler çok seyrek. Dokuz tablonun{" "}
          <strong className="text-white/80">hepsi tam %95</strong>&apos;e kalibre edilmiştir; risk
          ve sıra sayısı yalnızca oynaklığı değiştirir, beklenen getiriyi değil.
        </p>
        <p className="mt-2 text-xs leading-relaxed text-muted">
          Birden fazla top attığında her top{" "}
          <strong className="text-white/80">ayrı bir tur</strong> olarak oynanır: kendi bahsi, kendi
          ve kendi defter kaydı olur. Yani on top atmak, tek tek on tur
          oynamakla birebir aynı — beklenen getiri değişmez, yalnızca sonuç daha çabuk ortalamaya
          yaklaşır.
        </p>
      </Card>

      <div className="flex justify-center">
        <Pill tone="info">yol sunucuda üretilir</Pill>
      </div>
      </div>
    </div>
  );
}

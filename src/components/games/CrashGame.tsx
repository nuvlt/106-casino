"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button, Card, Pill, SectionTitle } from "@/components/ui";
import { BetControls } from "@/components/games/BetControls";
import { newKey, post } from "@/hooks/useApi";
import { COIN } from "@/lib/games/config";
import { coins, mult as fmtMult } from "@/lib/format";

interface StartResponse {
  roundId: string;
  bet: number;
  balance: number;
  startedAt: string;
  serverNow: string;
  lambda: number;
  autoCashout: number | null;
}

interface CashoutResponse {
  roundId: string;
  payout: number;
  mult: number;
  balance: number;
  result: { crashPoint: number; cashedOutAt: number | null; auto: boolean };
  newBadges: { id: string; title: string; icon: string; reward: number }[];
}

type Phase = "idle" | "flying" | "done";

/** Eğri: m(t) = e^(λt). Sunucu da aynı formülü kullanır. */
const multAt = (lambda: number, seconds: number) => Math.exp(lambda * seconds);

/** Arka plandaki yıldızlar — sabit tohumlu, her açılışta aynı gökyüzü. */
const STARS = Array.from({ length: 46 }, (_, i) => {
  const a = Math.sin(i * 12.9898) * 43758.5453;
  const b = Math.sin(i * 78.233) * 12345.6789;
  return {
    x: ((a - Math.floor(a)) * 100).toFixed(2),
    y: ((b - Math.floor(b)) * 100).toFixed(2),
    r: i % 7 === 0 ? 0.55 : 0.32,
    o: i % 5 === 0 ? 0.75 : 0.35,
  };
});

export function CrashGame({
  balance,
  onSettled,
  onReload,
}: {
  balance: number;
  onSettled: (balance: number) => void;
  onReload: () => Promise<void>;
}) {
  const [bet, setBet] = useState(50 * COIN);
  const [autoCashout, setAutoCashout] = useState<number | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [live, setLive] = useState(1);
  const [round, setRound] = useState<StartResponse | null>(null);
  const [outcome, setOutcome] = useState<CashoutResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<number[]>([]);

  const raf = useRef<number | null>(null);
  const cashingOut = useRef(false);
  // Sunucu ile istemci saatleri arasındaki fark — eğri sunucuya göre çizilsin.
  const clockSkew = useRef(0);

  const stopLoop = () => {
    if (raf.current !== null) cancelAnimationFrame(raf.current);
    raf.current = null;
  };

  const finish = useCallback(
    async (roundId: string) => {
      if (cashingOut.current) return;
      cashingOut.current = true;
      stopLoop();
      try {
        const res = await post<CashoutResponse>("/api/games/crash/cashout", { roundId });
        setOutcome(res);
        setPhase("done");
        setLive(res.result.crashPoint);
        onSettled(res.balance);
        setHistory((h) => [res.result.crashPoint, ...h].slice(0, 14));
        void onReload();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Çekim yapılamadı");
        setPhase("done");
      } finally {
        cashingOut.current = false;
      }
    },
    [onReload, onSettled],
  );

  async function start() {
    if (phase === "flying") return;
    setError(null);
    setOutcome(null);
    setLive(1);

    try {
      const res = await post<StartResponse>("/api/games/crash/start", {
        bet,
        idempotencyKey: newKey("crash"),
        autoCashout: autoCashout ?? undefined,
      });
      clockSkew.current = Date.parse(res.serverNow) - Date.now();
      setRound(res);
      setPhase("flying");
      onSettled(res.balance);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Tur başlatılamadı");
    }
  }

  // Uçuş animasyonu — çarpan sunucunun başlangıç zamanından hesaplanır.
  useEffect(() => {
    if (phase !== "flying" || !round) return;
    const startedAt = Date.parse(round.startedAt);

    const tick = () => {
      const serverNow = Date.now() + clockSkew.current;
      const seconds = Math.max(0, (serverNow - startedAt) / 1000);
      const m = multAt(round.lambda, seconds);
      setLive(m);

      // Otomatik çekim hedefine ulaşıldıysa turu kapat.
      if (round.autoCashout && m >= round.autoCashout / 100) {
        void finish(round.roundId);
        return;
      }
      // Güvenlik ağı: tur çok uzadıysa kapat (sunucu zaten süre sınırı koyuyor).
      if (seconds > 115) {
        void finish(round.roundId);
        return;
      }
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return stopLoop;
  }, [phase, round, finish]);

  useEffect(() => stopLoop, []);

  const crashed = outcome ? outcome.result.cashedOutAt === null : false;
  const displayMult = phase === "done" && outcome ? outcome.result.crashPoint : live;

  /**
   * Eğri çizimi.
   *
   * Yatay eksen GEÇEN ZAMAN, dikey eksen çarpan. Çarpan zamanla üstel
   * arttığı için eğri ilerledikçe dikleşir — roketin hızlandığı hissi
   * buradan gelir. İki eksen de anlık değerin biraz üstüne ölçeklenir,
   * böylece eğri kadrajdan taşmaz ama sürekli büyümeye devam eder.
   */
  const lambda = round?.lambda ?? Math.LN2 / 5;
  const elapsed = Math.max(0, Math.log(Math.max(1, displayMult)) / lambda);

  const curve = (() => {
    if (phase === "idle" || elapsed <= 0.01) return "";
    const tMax = Math.max(3, elapsed * 1.12);
    const mMax = Math.max(1.8, Math.exp(lambda * tMax));
    const steps = 48;
    const pts: string[] = [];
    for (let i = 0; i <= steps; i++) {
      const t = (elapsed * i) / steps;
      const m = Math.exp(lambda * t);
      const x = (t / tMax) * 100;
      const y = 100 - ((m - 1) / (mMax - 1)) * 86;
      pts.push(`${x.toFixed(2)},${y.toFixed(2)}`);
    }
    return pts.join(" ");
  })();

  const curveEnd = (() => {
    if (!curve) return null;
    const last = curve.split(" ").at(-1)!.split(",");
    return { x: Number(last[0]), y: Number(last[1]) };
  })();

  return (
    <div className="space-y-4">
      {/* --- UÇUŞ EKRANI --- */}
      <div
        className={`gold-hairline relative aspect-[4/3] w-full overflow-hidden rounded-3xl
          shadow-[0_16px_44px_rgba(0,0,0,0.6)] transition-colors duration-500 ${
          crashed
            ? "bg-[radial-gradient(130%_100%_at_50%_0%,#5e0f24_0%,#2a0713_45%,#0a0510_100%)]"
            : phase === "done" && outcome
              ? "bg-[radial-gradient(130%_100%_at_50%_0%,#0d5c38_0%,#07331f_45%,#04140f_100%)]"
              : "bg-[radial-gradient(130%_100%_at_50%_0%,#123b6b_0%,#0a1d3c_45%,#050a16_100%)]"
        }`}
      >
        {/* yıldızlar */}
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 size-full">
          {STARS.map((s, i) => (
            <circle key={i} cx={s.x} cy={s.y} r={s.r} fill="#ffffff" opacity={s.o} />
          ))}
        </svg>

        {/* ızgara */}
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 size-full opacity-[0.13]">
          {[20, 40, 60, 80].map((y) => (
            <line key={`h${y}`} x1="0" y1={y} x2="100" y2={y} stroke="#ffffff" strokeWidth="0.3" />
          ))}
          {[20, 40, 60, 80].map((x) => (
            <line key={`v${x}`} x1={x} y1="0" x2={x} y2="100" stroke="#ffffff" strokeWidth="0.3" />
          ))}
        </svg>

        {/* eğri */}
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 size-full">
          <defs>
            <linearGradient id="crashFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={crashed ? "#ff5470" : "#21d4fd"} stopOpacity="0.45" />
              <stop offset="100%" stopColor={crashed ? "#ff5470" : "#21d4fd"} stopOpacity="0" />
            </linearGradient>
          </defs>
          {curve ? (
            <>
              <polygon points={`0,100 ${curve} ${curveEnd!.x},100`} fill="url(#crashFill)" />
              <polyline
                points={curve}
                fill="none"
                stroke={crashed ? "#ff5470" : "#21d4fd"}
                strokeWidth="2"
                strokeLinejoin="round"
                strokeLinecap="round"
                vectorEffect="non-scaling-stroke"
              />
            </>
          ) : null}
        </svg>

        {/* eğrinin ucundaki roket — alev ve parlama ile */}
        {curveEnd && phase === "flying" ? (
          <div
            className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2"
            style={{ left: `${curveEnd.x}%`, top: `${curveEnd.y}%` }}
          >
            <div className="absolute -inset-5 rounded-full bg-neon/35 blur-xl" />
            <svg width="34" height="34" viewBox="-16 -16 32 32" className="relative rotate-45">
              <defs>
                <linearGradient id="rkt" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#fff3cc" />
                  <stop offset="55%" stopColor="#ffd062" />
                  <stop offset="100%" stopColor="#b5830e" />
                </linearGradient>
              </defs>
              <path d="M0 -13 C6 -6 7 4 0 12 C-7 4 -6 -6 0 -13 Z" fill="url(#rkt)" />
              <circle cx="0" cy="-3" r="3.2" fill="#0a1420" />
              <path d="M-6 5 L-11 13 L-2 9 Z" fill="#e01e37" />
              <path d="M6 5 L11 13 L2 9 Z" fill="#e01e37" />
              <path d="M0 12 L-3.5 22 L0 18 L3.5 22 Z" fill="#ffb020" className="animate-glow" />
            </svg>
          </div>
        ) : null}

        {crashed ? (
          <div
            className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 text-4xl"
            style={{ left: `${curveEnd?.x ?? 50}%`, top: `${curveEnd?.y ?? 50}%` }}
          >
            💥
          </div>
        ) : null}

        {/* çarpan */}
        <div className="absolute inset-0 grid place-items-center px-6">
          <div className="rounded-3xl bg-black/25 px-5 py-3 text-center backdrop-blur-[2px]">
            <div
              className={`font-display tabular text-6xl font-black drop-shadow-lg transition-colors ${
                crashed ? "text-lose" : phase === "done" ? "text-win" : "text-white"
              }`}
            >
              {fmtMult(displayMult)}
            </div>
            {phase === "flying" ? (
              <div className="mt-1 text-xs font-semibold text-white/60">
                {round?.autoCashout
                  ? `otomatik çekim ${fmtMult(round.autoCashout / 100)}`
                  : "çekmek için bas"}
              </div>
            ) : crashed ? (
              <div className="mt-1 text-sm font-bold text-lose">patladı 💥</div>
            ) : outcome ? (
              <div className="mt-1 text-sm font-bold text-win">
                +{coins(outcome.payout)} · {fmtMult(outcome.mult)} ile çıktın
              </div>
            ) : (
              <div className="mt-1 text-xs text-white/50">roket bekliyor 🚀</div>
            )}
          </div>
        </div>

        {phase === "done" && outcome && !crashed ? (
          <div className="absolute inset-x-0 bottom-2 text-center text-[11px] text-white/45">
            tur {fmtMult(outcome.result.crashPoint)} noktasında patladı
          </div>
        ) : null}
      </div>

      {outcome && outcome.newBadges.length > 0 ? (
        <div className="flex flex-wrap justify-center gap-2">
          {outcome.newBadges.map((b) => (
            <span
              key={b.id}
              className="animate-pop rounded-full bg-gold/15 px-3 py-1.5 text-xs font-bold text-gold"
            >
              {b.icon} {b.title} +{coins(b.reward)}
            </span>
          ))}
        </div>
      ) : null}

      {error ? (
        <p className="rounded-2xl bg-lose/15 px-4 py-2.5 text-center text-sm text-lose">
          {error}
        </p>
      ) : null}

      {/* --- KONTROLLER --- */}
      {phase === "flying" ? (
        <Button
          onClick={() => round && void finish(round.roundId)}
          tone="felt"
          className="w-full !py-5 !text-xl"
          disabled={!!round?.autoCashout}
        >
          {round?.autoCashout ? "otomatik çekim bekleniyor…" : `ÇEK · ${coins(Math.floor(bet * live))}`}
        </Button>
      ) : (
        <>
          <BetControls bet={bet} setBet={setBet} balance={balance} />

          <div className="rounded-3xl border border-white/8 bg-surface/70 p-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-semibold text-muted">Otomatik çekim</span>
              <span className="tabular text-sm font-bold text-neon">
                {autoCashout ? fmtMult(autoCashout / 100) : "kapalı"}
              </span>
            </div>
            <div className="flex gap-1.5">
              <button
                onClick={() => setAutoCashout(null)}
                className={`flex-1 rounded-xl py-2 text-xs font-bold ${
                  autoCashout === null ? "bg-neon text-[#04222b]" : "bg-white/6 text-white/70"
                }`}
              >
                kapalı
              </button>
              {[150, 200, 300, 500, 1000].map((v) => (
                <button
                  key={v}
                  onClick={() => setAutoCashout(v)}
                  className={`flex-1 rounded-xl py-2 text-xs font-bold ${
                    autoCashout === v ? "bg-neon text-[#04222b]" : "bg-white/6 text-white/70"
                  }`}
                >
                  {v / 100}x
                </button>
              ))}
            </div>
            <p className="mt-2 text-[11px] leading-relaxed text-muted">
              Hedef tur başında yazılır; sonuç zamandan bağımsız hesaplanır, ağ gecikmesinden
              etkilenmez. Manuel çekimde ise sunucunun isteği aldığı an geçerlidir.
            </p>
          </div>

          <Button
            onClick={start}
            disabled={bet > balance}
            tone="gold"
            className="w-full !py-4 !text-lg"
          >
            {bet > balance ? "Bakiye yetersiz" : "KALKIŞ 🚀"}
          </Button>
        </>
      )}

      {history.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {history.map((h, i) => (
            <span
              key={i}
              className={`tabular rounded-lg px-2 py-1 text-[11px] font-bold ${
                h >= 10
                  ? "bg-gold/20 text-gold"
                  : h >= 2
                    ? "bg-win/15 text-win"
                    : "bg-white/6 text-white/50"
              }`}
            >
              {fmtMult(h)}
            </span>
          ))}
        </div>
      ) : null}

      <Card>
        <SectionTitle right="RTP %95">Nasıl çalışır</SectionTitle>
        <p className="text-xs leading-relaxed text-muted">
          Çöküş noktası tur başlarken üretilir ve kapanana kadar sunucuda gizli kalır.{" "}
          <strong className="text-white/75">Hangi çarpanda çekersen çek</strong> beklenen getiri
          aynıdır — dağılım öyle kurulmuştur ki 1.01x de 100x de aynı RTP&apos;yi verir. Tur
          bittikten sonra çöküş noktası ekranda gösterilir ve tohumunu döndürerek doğrulayabilirsin.
        </p>
      </Card>

      <div className="flex justify-center">
        <Pill tone="info">çarpanı sunucu hesaplar · provably fair</Pill>
      </div>
    </div>
  );
}

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
        className={`relative aspect-[4/3] w-full overflow-hidden rounded-3xl border transition-colors duration-300 ${
          crashed
            ? "border-lose/40 bg-gradient-to-b from-[#3d0d18] to-[#120a12]"
            : phase === "done" && outcome
              ? "border-win/40 bg-gradient-to-b from-[#06331f] to-[#0a1420]"
              : "border-white/10 bg-gradient-to-b from-[#0b3b5c] to-[#070c17]"
        }`}
      >
        {/* ızgara */}
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 size-full opacity-20">
          {[20, 40, 60, 80].map((y) => (
            <line key={y} x1="0" y1={y} x2="100" y2={y} stroke="#ffffff" strokeWidth="0.3" />
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

        {curveEnd && phase === "flying" ? (
          <div
            className="pointer-events-none absolute size-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-neon shadow-[0_0_16px_6px_rgba(33,212,253,0.55)]"
            style={{ left: `${curveEnd.x}%`, top: `${curveEnd.y}%` }}
          />
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

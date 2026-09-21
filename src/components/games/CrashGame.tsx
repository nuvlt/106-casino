"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button, Card, Pill, SectionTitle } from "@/components/ui";
import { BetControls } from "@/components/games/BetControls";
import { newKey, post } from "@/hooks/useApi";
import { COIN } from "@/lib/games/config";
import { coins, mult as fmtMult } from "@/lib/format";
import { sfx } from "@/lib/sound";

interface StartResponse {
  roundId: string;
  bet: number;
  balance: number;
  startedAt: string;
  serverNow: string;
  lambda: number;
  autoCashout: number | null;
}

interface Ended {
  roundId: string;
  crashPoint: number;
  cashedOutAt: number | null;
  payout: number;
  mult: number;
  balance: number;
  newBadges: { id: string; title: string; icon: string; reward: number }[];
}

interface StateResponse {
  alive: boolean;
  serverNow: string;
  ended?: Ended;
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

/**
 * Sunucuya "tur yaşıyor mu?" sorma aralığı.
 *
 * Çöküş noktası istemciye verilemez (verilse oyuncu hep kazanırdı), bu
 * yüzden patlamayı ancak sorarak öğrenebiliriz. İki yoklama arasında
 * ekran, çoktan patlamış bir turu en fazla bir aralık boyunca yükseliyor
 * gösterebilir — 250 ms'de bu, çarpanın yaklaşık %3,5'i kadar bir pay.
 * Ölçüldü: 5.53x'te biten bir turda ekranda görülen en yüksek değer
 * 5.80x idi. Daha sık sormak 25 kişilik bir ortamda gereksiz yük.
 */
const POLL_MS = 250;

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
  const [ended, setEnded] = useState<Ended | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<number[]>([]);

  const raf = useRef<number | null>(null);
  const poll = useRef<ReturnType<typeof setInterval> | null>(null);
  const closing = useRef(false);
  // Sunucu ile istemci saatleri arasındaki fark — eğri sunucuya göre çizilsin.
  const clockSkew = useRef(0);

  const stopLoops = useCallback(() => {
    if (raf.current !== null) cancelAnimationFrame(raf.current);
    raf.current = null;
    if (poll.current !== null) clearInterval(poll.current);
    poll.current = null;
  }, []);

  /** Tur bitti: animasyonu durdur, gerçek çöküş noktasına otur. */
  const finish = useCallback(
    (e: Ended) => {
      stopLoops();
      setEnded(e);
      setPhase("done");
      setLive(e.crashPoint);
      onSettled(e.balance);
      setHistory((h) => [e.crashPoint, ...h].slice(0, 14));

      if (e.cashedOutAt !== null) sfx.cashout(e.mult);
      else sfx.explode();
      if (e.newBadges.length > 0) setTimeout(() => sfx.badge(), 400);

      void onReload();
    },
    [onReload, onSettled, stopLoops],
  );

  /** Oyuncu ÇEK'e bastı. */
  const cashout = useCallback(
    async (roundId: string) => {
      if (closing.current) return;
      closing.current = true;
      try {
        const res = await post<CashoutResponse>("/api/games/crash/cashout", { roundId });
        finish({
          roundId: res.roundId,
          crashPoint: res.result.crashPoint,
          cashedOutAt: res.result.cashedOutAt,
          payout: res.payout,
          mult: res.mult,
          balance: res.balance,
          newBadges: res.newBadges,
        });
      } catch {
        // Aynı anda sunucu turu kapatmış olabilir — son durumu sor.
        try {
          const s = await post<StateResponse>("/api/games/crash/state", { roundId });
          if (s.ended) finish(s.ended);
          else setError("Çekim yapılamadı");
        } catch {
          setError("Çekim yapılamadı");
        }
      } finally {
        closing.current = false;
      }
    },
    [finish],
  );

  async function start() {
    if (phase === "flying") return;
    setError(null);
    setEnded(null);
    setLive(1);
    sfx.prime();

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
      sfx.launch();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Tur başlatılamadı");
    }
  }

  // Uçuş: çarpanı çiz + sunucuya turun yaşayıp yaşamadığını sor.
  useEffect(() => {
    if (phase !== "flying" || !round) return;
    const startedAt = Date.parse(round.startedAt);

    const tick = () => {
      const serverNow = Date.now() + clockSkew.current;
      setLive(multAt(round.lambda, Math.max(0, (serverNow - startedAt) / 1000)));
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);

    // Patlama anı YALNIZCA buradan öğrenilir.
    poll.current = setInterval(async () => {
      try {
        const s = await post<StateResponse>("/api/games/crash/state", { roundId: round.roundId });
        if (!s.alive && s.ended) finish(s.ended);
      } catch {
        /* geçici ağ hatası — bir sonraki yoklamada tekrar denenir */
      }
    }, POLL_MS);

    return stopLoops;
  }, [phase, round, finish, stopLoops]);

  useEffect(() => stopLoops, [stopLoops]);

  const crashed = ended ? ended.cashedOutAt === null : false;

  /**
   * Büyük rakam SENİN çarpanındır.
   *
   * Kazanarak çıktığında turun çöküş noktası (nereye kadar gidecekti)
   * ayrı bir bilgidir ve aşağıda küçük yazıyla gösterilir. İkisini
   * karıştırmak "7,38x" yazıp "2,06x ile çıktın" demek gibi çelişkili
   * bir ekran üretiyordu.
   */
  const displayMult =
    phase === "done" && ended ? (crashed ? ended.crashPoint : ended.mult) : live;

  /**
   * Eğri çizimi. Yatay eksen GEÇEN ZAMAN, dikey eksen çarpan. Çarpan
   * zamanla üstel arttığı için eğri ilerledikçe dikleşir — roketin
   * hızlandığı hissi buradan gelir.
   */
  const lambda = round?.lambda ?? Math.LN2 / 5;
  const elapsed = Math.max(0, Math.log(Math.max(1, displayMult)) / lambda);

  const curve = (() => {
    if (phase === "idle" || elapsed <= 0.01) return "";
    const tMax = Math.max(3, elapsed * 1.12);
    const mMax = Math.max(1.8, Math.exp(lambda * tMax));
    const pts: string[] = [];
    for (let i = 0; i <= 48; i++) {
      const t = (elapsed * i) / 48;
      const m = Math.exp(lambda * t);
      pts.push(`${((t / tMax) * 100).toFixed(2)},${(100 - ((m - 1) / (mMax - 1)) * 86).toFixed(2)}`);
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
              : phase === "done" && ended
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

        {/* eğrinin ucundaki roket */}
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

        {crashed && curveEnd ? (
          <div
            className="animate-pop pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 text-5xl"
            style={{ left: `${curveEnd.x}%`, top: `${curveEnd.y}%` }}
          >
            💥
          </div>
        ) : null}

        {/* Kazanarak çıkıldıysa eğrinin ucuna yeşil bayrak — ayrıldığın nokta. */}
        {!crashed && ended && curveEnd ? (
          <div
            className="animate-pop pointer-events-none absolute -translate-x-1/2 -translate-y-1/2"
            style={{ left: `${curveEnd.x}%`, top: `${curveEnd.y}%` }}
          >
            <div className="absolute -inset-4 rounded-full bg-win/30 blur-lg" />
            <div className="relative size-3.5 rounded-full bg-win shadow-[0_0_12px_4px_rgba(47,224,138,0.6)]" />
          </div>
        ) : null}

        {/* çarpan */}
        <div className="absolute inset-0 grid place-items-center px-6">
          <div
            data-phase={phase}
            data-outcome={ended ? (crashed ? "crashed" : "cashed") : ""}
            data-crash-point={ended ? ended.crashPoint : ""}
            data-paid-mult={ended ? ended.mult : ""}
            data-payout={ended ? ended.payout : ""}
            className="rounded-3xl bg-black/30 px-5 py-3 text-center backdrop-blur-[2px]"
          >
            <div
              className={`font-display tabular text-6xl font-black drop-shadow-lg transition-colors ${
                crashed ? "text-lose" : phase === "done" ? "text-win" : "text-white"
              }`}
            >
              {fmtMult(displayMult)}
            </div>
            {phase === "flying" ? (
              <div className="mt-1 text-xs font-semibold text-white/65">
                {round?.autoCashout
                  ? `otomatik çekim ${fmtMult(round.autoCashout / 100)}`
                  : "çekmek için bas"}
              </div>
            ) : crashed ? (
              <div className="mt-1 text-sm font-black text-lose">patladı</div>
            ) : ended ? (
              <div className="mt-1 text-sm font-black text-win">
                çıktın · +{coins(ended.payout)} coin
              </div>
            ) : (
              <div className="mt-1 text-xs text-white/50">roket bekliyor</div>
            )}
          </div>
        </div>

        {/* Turun nereye kadar gittiği ayrı bir bilgi — büyük rakamla karıştırılmaz. */}
        {phase === "done" && ended && !crashed ? (
          <div className="absolute inset-x-0 bottom-2 text-center text-[11px] text-white/45">
            tur {fmtMult(ended.crashPoint)} noktasında patladı
          </div>
        ) : null}
      </div>

      {ended && ended.newBadges.length > 0 ? (
        <div className="flex flex-wrap justify-center gap-2">
          {ended.newBadges.map((b) => (
            <span
              key={b.id}
              className="animate-pop rounded-full bg-gold/15 px-3 py-1.5 text-xs font-black text-gold ring-1 ring-gold/30"
            >
              {b.icon} {b.title} +{coins(b.reward)}
            </span>
          ))}
        </div>
      ) : null}

      {error ? (
        <p className="rounded-2xl bg-lose/15 px-4 py-2.5 text-center text-sm text-lose">{error}</p>
      ) : null}

      {/* --- KONTROLLER --- */}
      {phase === "flying" ? (
        <Button
          onClick={() => round && void cashout(round.roundId)}
          tone="felt"
          className="w-full !py-5 !text-xl"
          disabled={!!round?.autoCashout}
        >
          {round?.autoCashout ? "otomatik çekim bekleniyor…" : `ÇEK · ${coins(Math.floor(bet * live))}`}
        </Button>
      ) : (
        <>
          <BetControls bet={bet} setBet={setBet} balance={balance} />

          <div className="gold-hairline rounded-3xl bg-gradient-to-b from-surface-2/80 to-surface/90 p-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-[11px] font-black uppercase tracking-widest text-muted">
                Otomatik çekim
              </span>
              <span className="tabular text-sm font-black text-neon">
                {autoCashout ? fmtMult(autoCashout / 100) : "kapalı"}
              </span>
            </div>
            <div className="flex gap-1.5">
              <button
                onClick={() => {
                  setAutoCashout(null);
                  sfx.click();
                }}
                className={`flex-1 rounded-xl py-2 text-xs font-black ${
                  autoCashout === null ? "bg-neon text-[#04222b]" : "bg-white/6 text-white/70"
                }`}
              >
                kapalı
              </button>
              {[150, 200, 300, 500, 1000].map((v) => (
                <button
                  key={v}
                  onClick={() => {
                    setAutoCashout(v);
                    sfx.click();
                  }}
                  className={`flex-1 rounded-xl py-2 text-xs font-black ${
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

          <Button onClick={start} disabled={bet > balance} tone="gold" className="w-full !py-4 !text-lg">
            {bet > balance ? "Bakiye yetersiz" : "KALKIŞ"}
          </Button>
        </>
      )}

      {history.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {history.map((h, i) => (
            <span
              key={i}
              className={`tabular rounded-lg px-2 py-1 text-[11px] font-black ${
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
          <strong className="text-white/80">Hangi çarpanda çekersen çek</strong> beklenen getiri
          aynıdır — dağılım öyle kurulmuştur ki 1.01x de 100x de aynı RTP&apos;yi verir. Ekrandaki
          çarpan sunucunun saatine bağlıdır; tur patladığı anda animasyon durur ve gerçek çöküş
          noktası gösterilir.
        </p>
      </Card>

      <div className="flex justify-center">
        <Pill tone="info">çarpanı sunucu hesaplar · provably fair</Pill>
      </div>
    </div>
  );
}

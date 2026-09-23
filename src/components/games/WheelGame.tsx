"use client";

import { useEffect, useRef, useState } from "react";
import { Button, Card, Pill, SectionTitle } from "@/components/ui";
import { ActionDock } from "@/components/games/ActionDock";
import { BetControls } from "@/components/games/BetControls";
import { ResultFlash } from "@/components/games/ResultFlash";
import { newKey, post } from "@/hooks/useApi";
import { COIN } from "@/lib/games/config";
import {
  EMPTY_ALT,
  PRIZE_TABLE,
  SECTORS,
  TIER_STYLE,
  landingAngle,
  sectorPath,
  styleFor,
} from "@/lib/wheel-layout";
import { mult as fmtMult } from "@/lib/format";
import { sfx } from "@/lib/sound";

interface SpinResponse {
  roundId: string;
  payout: number;
  mult: number;
  balance: number;
  result: { segment: number; label: string; spinOffset: number };
  newBadges: { id: string; title: string; icon: string; reward: number }[];
}

/** Tıklar sesinin yavaşlama eğrisi için yaklaşık toplam dönüş süresi. */
const SPIN_MS = 4200;
/** Sunucu yanıtını beklerken çarkın sabit hızı (derece/sn). */
const CRUISE_DEG_S = 720;
/** Tıklamadan sonra tam hıza çıkma süresi. */
const RAMP_MS = 350;
/** Sonuç gelince yavaşlama en az bu kadar sürer — "hemen durdu" hissi olmasın. */
const MIN_DECEL_MS = 3200;
const R = 100; // SVG yarıçapı (viewBox birimi)

export function WheelGame({
  balance,
  onSettled,
  onReload,
}: {
  balance: number;
  onSettled: (balance: number) => void;
  onReload: () => Promise<void>;
}) {
  const [bet, setBet] = useState(50 * COIN);
  const [spinning, setSpinning] = useState(false);
  const [result, setResult] = useState<(SpinResponse & { stake: number }) | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<{ mult: number; tier: number }[]>([]);
  // Çarkın açısı React state'i yerine ref'te tutulur ve her karede doğrudan
  // yazılır: 60 kare/sn'de koca bir SVG'yi yeniden çizdirmemek için.
  //
  // Döndürülen şey SVG'nin kendisi değil, onu saran bir div'dir ve bu div
  // `will-change: transform` ile ayrı bir GPU katmanına alınır. SVG'yi
  // doğrudan döndürmek iOS Safari'de her karede 25 degradeli dilimi ve
  // yazıları yeniden rasterleştirtiyordu — mobilde "kasma" hissinin sebebi
  // buydu. Katman bir kez çizilir, sonra yalnızca GPU'da döndürülür.
  const wheelRef = useRef<HTMLDivElement | null>(null);
  const angle = useRef(0);
  const raf = useRef<number | null>(null);

  useEffect(() => () => {
    if (raf.current != null) cancelAnimationFrame(raf.current);
  }, []);

  const paint = () => {
    if (wheelRef.current) {
      wheelRef.current.style.transform = `rotate(${angle.current}deg) translateZ(0)`;
    }
  };

  // Çark dönerken yavaşlayan çıtçıt sesi — gerçek çarkın mandalı gibi.
  useEffect(() => {
    if (!spinning) return;
    let stopped = false;
    let t = 0;
    const tickOnce = () => {
      if (stopped) return;
      sfx.tick();
      t += 1;
      // Aralık dönüş sonuna doğru açılır: hızlı başla, yavaşlayarak bit.
      const progress = Math.min(1, (t * 70) / SPIN_MS);
      const gap = 45 + Math.pow(progress, 3) * 320;
      setTimeout(tickOnce, gap);
    };
    tickOnce();
    return () => {
      stopped = true;
    };
  }, [spinning]);

  /**
   * Tıklandığı an çark dönmeye başlar; sunucu yanıtı gelene kadar sabit
   * hızda döner. Yanıt gelince, o anki hızından yumuşakça yavaşlayarak
   * sunucunun belirlediği dilimde durur. Sonuç yine tamamen sunucuda
   * üretilir — ekrandaki dönüş yalnızca bekleme süresini gizler.
   */
  async function spin() {
    if (spinning) return;
    sfx.prime();
    sfx.click();
    setError(null);
    setResult(null);
    setSpinning(true);

    const started = performance.now();
    let last = started;
    // Sunucu yanıtı gelince doldurulur; döngü yavaşlama evresine geçer.
    let landing: { from: number; distance: number; at: number; duration: number } | null = null;
    let onLanded: (() => void) | null = null;
    let pending: { target: number } | null = null;

    const frame = (now: number) => {
      if (landing) {
        const u = Math.min(1, (now - landing.at) / landing.duration);
        // Kübik yavaşlama: başlangıç eğimi = sabit dönüş hızı, kesintisiz geçiş.
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

        // Yanıt geldi ve tam hıza ulaşıldıysa yavaşlamayı planla.
        if (pending && ramp >= 1) {
          const current = ((angle.current % 360) + 360) % 360;
          let distance = (((360 - pending.target - current) % 360) + 360) % 360;
          // Yavaşlama süresi = 3 × mesafe / hız; en az MIN_DECEL_MS olsun.
          const minDistance = (CRUISE_DEG_S * MIN_DECEL_MS) / 3000;
          while (distance < minDistance) distance += 360;
          landing = {
            from: angle.current,
            distance,
            at: now,
            duration: (3000 * distance) / CRUISE_DEG_S,
          };
        }
      }
      last = now;
      raf.current = requestAnimationFrame(frame);
    };
    raf.current = requestAnimationFrame(frame);

    try {
      const res = await post<SpinResponse>("/api/games/wheel/bet", {
        bet,
        idempotencyKey: newKey("wheel"),
      });

      onLanded = () => {
        setResult({ ...res, stake: bet });
        setSpinning(false);
        onSettled(res.balance);
        setHistory((h) => [{ mult: res.mult, tier: res.result.segment }, ...h].slice(0, 12));

        if (res.payout > bet) sfx.win(res.mult);
        else sfx.lose();
        if (res.newBadges.length > 0) setTimeout(() => sfx.badge(), 500);

        void onReload();
      };
      // Sunucunun verdiği noktayı çarkın tepesine getir.
      pending = { target: landingAngle(res.result.segment, res.result.spinOffset) };
    } catch (e) {
      // Tur oynanmadı: çark bir anda donmasın, kısa bir yavaşlamayla dursun.
      const message = e instanceof Error ? e.message : "Bir hata oldu";
      onLanded = () => {
        setSpinning(false);
        setError(message);
      };
      const now = performance.now();
      const speed = CRUISE_DEG_S * Math.min(1, (now - started) / RAMP_MS);
      landing = { from: angle.current, distance: speed * 0.25, at: now, duration: 750 };
    }
  }

  return (
    <div className="space-y-4 lg:grid lg:grid-cols-[minmax(0,1.05fr)_minmax(0,360px)] lg:items-start lg:gap-6 lg:space-y-0">
      {/* Geniş ekranda tahta solda kalır, kontroller sağa geçer. */}
      <div className="space-y-4">
      {/* --- ÇARK --- */}
      <div className="relative mx-auto aspect-square w-full max-w-[340px]">
        {/* arkadan sıcak ışık */}
        <div
          className={`pointer-events-none absolute -inset-6 rounded-full bg-gold/25 blur-3xl transition-opacity duration-700 ${
            spinning ? "opacity-90" : "opacity-40"
          }`}
        />

        {/* tepe işaretçisi — pirinç ok, ucunda yakut */}
        <div className="absolute left-1/2 top-[-6px] z-20 -translate-x-1/2">
          <svg width="30" height="36" viewBox="0 0 30 36" className="drop-shadow-[0_3px_6px_rgba(0,0,0,0.7)]">
            <defs>
              <linearGradient id="ptrG" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#fff3cc" />
                <stop offset="50%" stopColor="#ffd062" />
                <stop offset="100%" stopColor="#a9760a" />
              </linearGradient>
            </defs>
            <circle cx="15" cy="9" r="8" fill="url(#ptrG)" />
            <circle cx="15" cy="9" r="3.4" fill="#e01e37" />
            <path d="M6 14 L24 14 L15 34 Z" fill="url(#ptrG)" />
          </svg>
        </div>

        {/* dış pirinç çember + perçinler */}
        <div className="absolute inset-0 rounded-full bg-gradient-to-b from-[#fff0bf] via-[#d9a13a] to-[#8d6205] p-[9px] shadow-[0_22px_60px_rgba(0,0,0,0.65)]">
          <div className="relative size-full overflow-hidden rounded-full bg-[#07120c] shadow-[inset_0_0_30px_rgba(0,0,0,0.9)]">
            <div ref={wheelRef} className="size-full" style={{ willChange: "transform" }}>
            <svg viewBox="-105 -105 210 210" className="size-full">
              {/* Her ödül için bir degrade: göbekte koyu, kenarda parlak. */}
              <defs>
                {TIER_STYLE.map((t, i) => (
                  <radialGradient key={i} id={`wg-${i}`} cx="0" cy="0" r={R} gradientUnits="userSpaceOnUse">
                    <stop offset="0%" stopColor={t.dark} />
                    <stop offset="62%" stopColor={t.dark} />
                    <stop offset="100%" stopColor={t.light} />
                  </radialGradient>
                ))}
                <radialGradient id="wg-alt" cx="0" cy="0" r={R} gradientUnits="userSpaceOnUse">
                  <stop offset="0%" stopColor={EMPTY_ALT.dark} />
                  <stop offset="62%" stopColor={EMPTY_ALT.dark} />
                  <stop offset="100%" stopColor={EMPTY_ALT.light} />
                </radialGradient>
              </defs>

              {SECTORS.map((s, i) => (
                <path
                  key={i}
                  d={sectorPath(s.start, s.angle, R)}
                  fill={styleFor(s) === EMPTY_ALT ? "url(#wg-alt)" : `url(#wg-${s.tier})`}
                  stroke="#ffd062"
                  strokeOpacity={0.35}
                  strokeWidth={0.5}
                />
              ))}

              {/* Yalnızca sığan dilimlere yazı; incelerinin ödülü listede. */}
              {SECTORS.map((s, i) => {
                if (s.angle < 9) return null;
                const mid = s.start + s.angle / 2;
                const rad = ((mid - 90) * Math.PI) / 180;
                const rr = R * 0.7;
                // Koordinatlar yuvarlanmadan basılırsa sunucu ve tarayıcının
                // Math.cos sonuçları son bitte ayrışıp hydration uyarısı üretir.
                const tx = Number((rr * Math.cos(rad)).toFixed(3));
                const ty = Number((rr * Math.sin(rad)).toFixed(3));
                return (
                  <text
                    key={`t-${i}`}
                    x={tx}
                    y={ty}
                    fill={styleFor(s).text}
                    fontSize={s.angle > 16 ? 9 : 7}
                    fontWeight={800}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    transform={`rotate(${mid.toFixed(3)} ${tx} ${ty})`}
                  >
                    {s.label}
                  </text>
                );
              })}
              {/* kazanan dilimin üstüne altın parlama */}
              {result ? (
                (() => {
                  const target = landingAngle(result.result.segment, result.result.spinOffset);
                  const won = SECTORS.find(
                    (x) => target >= x.start && target < x.start + x.angle,
                  );
                  if (!won) return null;
                  return (
                    <path
                      d={sectorPath(won.start, won.angle, R)}
                      fill="#ffffff"
                      opacity={0.22}
                      stroke="#fff3cc"
                      strokeWidth={1.4}
                    />
                  );
                })()
              ) : null}

              {/* iç altın halka ve perçinler */}
              <circle r={R} fill="none" stroke="#ffd062" strokeWidth={2} opacity={0.75} />
              <circle r={R * 0.34} fill="none" stroke="#ffd062" strokeWidth={1.2} opacity={0.45} />
              {Array.from({ length: 24 }, (_, i) => {
                const a = ((i * 15 - 90) * Math.PI) / 180;
                return (
                  <circle
                    key={`rivet-${i}`}
                    cx={Number((R * 0.93 * Math.cos(a)).toFixed(3))}
                    cy={Number((R * 0.93 * Math.sin(a)).toFixed(3))}
                    r={1.5}
                    fill="#fff3cc"
                    opacity={0.85}
                  />
                );
              })}
            </svg>
            </div>

            {/* cam yansıması — çarkın üstünde sabit durur, dönmez */}
            <div className="pointer-events-none absolute inset-0 rounded-full bg-[linear-gradient(200deg,rgba(255,255,255,0.22)_0%,transparent_38%)]" />

            {/* göbek */}
            <div className="absolute left-1/2 top-1/2 grid size-[27%] -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-gradient-to-b from-[#fff3cc] via-[#ffd062] to-[#8d6205] shadow-[0_6px_16px_rgba(0,0,0,0.6),inset_0_2px_6px_rgba(255,255,255,0.6)]">
              <div className="grid size-[76%] place-items-center rounded-full bg-gradient-to-b from-[#1a3325] to-[#07120c] ring-1 ring-[#ffd062]/50">
                <span className="gold-text font-display text-[13px] font-black">106</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* --- SONUÇ --- */}
      <div className="grid min-h-[64px] place-items-center">
        {error ? (
          <p className="rounded-2xl bg-lose/15 px-4 py-2.5 text-sm text-lose">
            {error}
          </p>
        ) : result ? (
          <ResultFlash
            payout={result.payout}
            stake={result.stake}
            mult={result.mult}
            badges={result.newBadges}
          />
        ) : spinning ? (
          <p className="animate-pulse text-sm text-muted">çark dönüyor…</p>
        ) : (
          <p className="text-sm text-muted">Bahsini seç ve çevir</p>
        )}
      </div>

      </div>

      <div className="space-y-4 lg:sticky lg:top-20">
      <BetControls bet={bet} setBet={setBet} balance={balance} disabled={spinning} />

      <ActionDock>
        <Button
          onClick={spin}
          disabled={spinning || bet > balance}
          tone="gold"
          className="w-full !py-4 !text-lg"
        >
          {spinning ? "Dönüyor…" : bet > balance ? "Bakiye yetersiz" : "ÇEVİR 🎡"}
        </Button>
      </ActionDock>

      {history.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {history.map((h, i) => (
            <span
              key={i}
              className="tabular rounded-lg px-2 py-1 text-[11px] font-bold"
              style={{ background: TIER_STYLE[h.tier]!.light, color: TIER_STYLE[h.tier]!.text }}
            >
              {fmtMult(h.mult)}
            </span>
          ))}
        </div>
      ) : null}

      <Card>
        <SectionTitle right="RTP %95">Ödül Tablosu</SectionTitle>
        <ul className="space-y-1.5">
          {PRIZE_TABLE.map((p) => (
            <li key={p.tier} className="flex items-center gap-3 text-sm">
              <span
                className="size-3.5 shrink-0 rounded"
                style={{ background: p.style.light }}
                aria-hidden
              />
              <span className="font-bold text-white/85">{p.label}</span>
              <span className="tabular ml-auto text-muted">
                %{p.chance.toFixed(2).replace(".", ",")}
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-[11px] leading-relaxed text-muted">
          Dilimler <strong className="text-white/70">gerçek olasılıkla orantılı</strong> çizilir.
          100x dilimi bu yüzden kıl kadar incedir — on binde 5 ihtimal, çizimde de tam olarak o
          kadar yer kaplıyor. Çevirmelerin yaklaşık üçte biri kârla biter.
        </p>
      </Card>

      <div className="flex justify-center">
        <Pill tone="info">sonuç sunucuda üretilir</Pill>
      </div>
      </div>
    </div>
  );
}

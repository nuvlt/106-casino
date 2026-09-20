"use client";

import { useRef, useState } from "react";
import { Button, Card, Pill, SectionTitle } from "@/components/ui";
import { BetControls } from "@/components/games/BetControls";
import { ResultFlash } from "@/components/games/ResultFlash";
import { newKey, post } from "@/hooks/useApi";
import { COIN } from "@/lib/games/config";
import { PRIZE_TABLE, SECTORS, TIER_STYLE, landingAngle, sectorPath } from "@/lib/wheel-layout";
import { mult as fmtMult } from "@/lib/format";

interface SpinResponse {
  roundId: string;
  payout: number;
  mult: number;
  balance: number;
  result: { segment: number; label: string; spinOffset: number };
  newBadges: { id: string; title: string; icon: string; reward: number }[];
}

const SPIN_MS = 4200;
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
  const [rotation, setRotation] = useState(0);
  const [result, setResult] = useState<SpinResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<{ mult: number; tier: number }[]>([]);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  async function spin() {
    if (spinning) return;
    setError(null);
    setResult(null);
    setSpinning(true);

    try {
      const res = await post<SpinResponse>("/api/games/wheel/bet", {
        bet,
        idempotencyKey: newKey("wheel"),
      });

      // Sunucunun verdiği noktayı çarkın tepesine getir; üstüne birkaç tam tur ekle.
      const target = landingAngle(res.result.segment, res.result.spinOffset);
      const current = ((rotation % 360) + 360) % 360;
      const delta = (360 - target - current + 360) % 360;
      setRotation((r) => r + 360 * 5 + delta);

      timer.current = setTimeout(() => {
        setResult(res);
        setSpinning(false);
        onSettled(res.balance);
        setHistory((h) => [{ mult: res.mult, tier: res.result.segment }, ...h].slice(0, 12));
        void onReload();
      }, SPIN_MS);
    } catch (e) {
      setSpinning(false);
      setError(e instanceof Error ? e.message : "Bir hata oldu");
    }
  }

  return (
    <div className="space-y-4">
      {/* --- ÇARK --- */}
      <div className="relative mx-auto aspect-square w-full max-w-[340px]">
        {/* tepe işaretçisi */}
        <div className="absolute left-1/2 top-0 z-20 -translate-x-1/2 -translate-y-1">
          <div
            className="size-0 border-x-[11px] border-t-[20px] border-x-transparent border-t-gold
                       drop-shadow-[0_2px_4px_rgba(0,0,0,0.6)]"
          />
        </div>

        <div className="absolute inset-0 rounded-full bg-gradient-to-b from-[#f7d774] to-[#9a6c05] p-[6px] shadow-[0_18px_50px_rgba(0,0,0,0.55)]">
          <div className="relative size-full overflow-hidden rounded-full bg-[#0b1220]">
            <svg
              viewBox="-105 -105 210 210"
              className="size-full"
              style={{
                transform: `rotate(${rotation}deg)`,
                transition: spinning ? `transform ${SPIN_MS}ms cubic-bezier(0.12, 0.7, 0.12, 1)` : "none",
              }}
            >
              {SECTORS.map((s, i) => (
                <path
                  key={i}
                  d={sectorPath(s.start, s.angle, R)}
                  fill={TIER_STYLE[s.tier]!.fill}
                  stroke="#0b1220"
                  strokeWidth={0.6}
                />
              ))}

              {/* Yalnızca sığan dilimlere yazı; incelerinin ödülü listede. */}
              {SECTORS.map((s, i) => {
                if (s.angle < 9) return null;
                const mid = s.start + s.angle / 2;
                const rad = ((mid - 90) * Math.PI) / 180;
                const rr = R * 0.7;
                return (
                  <text
                    key={`t-${i}`}
                    x={rr * Math.cos(rad)}
                    y={rr * Math.sin(rad)}
                    fill={TIER_STYLE[s.tier]!.text}
                    fontSize={s.angle > 16 ? 9 : 7}
                    fontWeight={800}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    transform={`rotate(${mid} ${rr * Math.cos(rad)} ${rr * Math.sin(rad)})`}
                  >
                    {s.label}
                  </text>
                );
              })}
              <circle r={R} fill="none" stroke="#f5b921" strokeWidth={1.5} opacity={0.5} />
            </svg>

            {/* göbek */}
            <div className="absolute left-1/2 top-1/2 grid size-[26%] -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-gradient-to-b from-[#f7d774] to-[#9a6c05] shadow-inner">
              <span className="font-display text-[11px] font-black text-[#3a2500]">106</span>
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
          <ResultFlash payout={result.payout} mult={result.mult} badges={result.newBadges} />
        ) : spinning ? (
          <p className="animate-pulse text-sm text-muted">çark dönüyor…</p>
        ) : (
          <p className="text-sm text-muted">Bahsini seç ve çevir</p>
        )}
      </div>

      <BetControls bet={bet} setBet={setBet} balance={balance} disabled={spinning} />

      <Button
        onClick={spin}
        disabled={spinning || bet > balance}
        tone="gold"
        className="w-full !py-4 !text-lg"
      >
        {spinning ? "Dönüyor…" : bet > balance ? "Bakiye yetersiz" : "ÇEVİR 🎡"}
      </Button>

      {history.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {history.map((h, i) => (
            <span
              key={i}
              className="tabular rounded-lg px-2 py-1 text-[11px] font-bold"
              style={{ background: `${TIER_STYLE[h.tier]!.fill}`, color: TIER_STYLE[h.tier]!.text }}
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
                style={{ background: p.style.fill }}
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
          50x dilimi bu yüzden kıl kadar incedir — binde 2 ihtimal, çizimde de tam olarak o kadar
          yer kaplıyor.
        </p>
      </Card>

      <div className="flex justify-center">
        <Pill tone="info">sonuç sunucuda üretilir · provably fair</Pill>
      </div>
    </div>
  );
}

"use client";

import { useEffect, useRef, useState } from "react";
import { Button, Card, Pill, SectionTitle } from "@/components/ui";
import { ActionDock } from "@/components/games/ActionDock";
import { BetControls } from "@/components/games/BetControls";
import { Reel } from "@/components/games/Reel";
import { ResultFlash } from "@/components/games/ResultFlash";
import { newKey, post } from "@/hooks/useApi";
import { CLASSIC_SYMBOLS, CLASSIC_TABLE, COIN, type ClassicSymbol } from "@/lib/games/config";
import { mult as fmtMult } from "@/lib/format";
import { sfx } from "@/lib/sound";

interface SpinResponse {
  payout: number;
  mult: number;
  balance: number;
  result: { cls: string; label: string; line: ClassicSymbol[]; reels: ClassicSymbol[][] };
  newBadges: { id: string; title: string; icon: string; reward: number }[];
}

/** Makaralar soldan sağa bu aralıkla durur. */
const STOP_GAP_MS = 380;
/** Sunucu ne kadar hızlı dönerse dönsün makaralar en az bu kadar döner. */
const MIN_SPIN_MS = 650;

const START: ClassicSymbol[][] = [
  ["🍒", "7", "🍋"],
  ["🔔", "7", "🍉"],
  ["🍋", "7", "BAR"],
];

function Symbol({ s }: { s: ClassicSymbol }) {
  if (s === "7")
    return (
      <span className="font-display text-[34px] font-black leading-none text-[#c8102e] drop-shadow-[0_2px_0_#7a0d1d]">
        7
      </span>
    );
  if (s === "BAR")
    return (
      <span className="rounded-md bg-[#12161f] px-1.5 py-0.5 font-display text-[13px] font-black tracking-wider text-[#ffd062] ring-1 ring-[#ffd062]/60">
        BAR
      </span>
    );
  return <span className="text-[30px] leading-none">{s}</span>;
}

const totalWeight = CLASSIC_TABLE.reduce((a, t) => a + t.weight, 0);

export function ClassicSlotGame({
  balance,
  onSettled,
  onReload,
}: {
  balance: number;
  onSettled: (b: number) => void;
  onReload: () => Promise<void>;
}) {
  const [bet, setBet] = useState(50 * COIN);
  const [reels, setReels] = useState<ClassicSymbol[][]>(START);
  /** Kaç makara durdu (0–3). Dönmüyorken 3. */
  const [stopped, setStopped] = useState(3);
  const [result, setResult] = useState<(SpinResponse & { stake: number }) | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<number[]>([]);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  const spinning = stopped < 3;
  const won = !spinning && result && result.payout > 0;

  async function spin() {
    if (spinning) return;
    sfx.prime();
    sfx.click();
    setError(null);
    setResult(null);
    setStopped(0);
    const started = performance.now();
    try {
      const res = await post<SpinResponse>("/api/games/slot/bet", { bet, idempotencyKey: newKey("slot") });
      const wait = Math.max(0, MIN_SPIN_MS - (performance.now() - started));
      setReels(res.result.reels);
      for (let i = 1; i <= 3; i++) {
        timers.current.push(
          setTimeout(() => {
            setStopped(i);
            sfx.tick();
            if (i === 3) {
              setResult({ ...res, stake: bet });
              onSettled(res.balance);
              setHistory((h) => [res.mult, ...h].slice(0, 14));
              if (res.payout > bet) sfx.win(res.mult);
              else sfx.lose();
              if (res.newBadges.length > 0) setTimeout(() => sfx.badge(), 450);
              void onReload();
            }
          }, wait + (i - 1) * STOP_GAP_MS),
        );
      }
    } catch (e) {
      setStopped(3);
      setError(e instanceof Error ? e.message : "Bir hata oldu");
    }
  }

  return (
    <div className="space-y-4 lg:grid lg:grid-cols-[minmax(0,1.05fr)_minmax(0,360px)] lg:items-start lg:gap-6 lg:space-y-0">
      <div className="space-y-4">
        {/* --- MAKİNE --- */}
        <div className="mx-auto w-full max-w-[380px]">
          <div className="relative rounded-[30px] bg-gradient-to-b from-[#fff0bf] via-[#d9a13a] to-[#8d6205] p-[7px] shadow-[0_22px_60px_rgba(0,0,0,0.65)]">
            <div className="rounded-[24px] bg-[radial-gradient(120%_90%_at_50%_0%,#b3121f_0%,#6d0a12_60%,#3a0509_100%)] px-4 pb-5 pt-3">
              {/* ışıklı tabela */}
              <div className="mb-3 flex items-center justify-center gap-1.5">
                {Array.from({ length: 5 }, (_, i) => (
                  <span
                    key={i}
                    className={`size-1.5 rounded-full bg-[#ffe89a] ${spinning || won ? "animate-glow" : "opacity-50"}`}
                    style={{ animationDelay: `${i * 120}ms` }}
                  />
                ))}
                <span className="gold-text mx-2 font-display text-lg font-black tracking-widest">777</span>
                {Array.from({ length: 5 }, (_, i) => (
                  <span
                    key={i}
                    className={`size-1.5 rounded-full bg-[#ffe89a] ${spinning || won ? "animate-glow" : "opacity-50"}`}
                    style={{ animationDelay: `${(5 - i) * 120}ms` }}
                  />
                ))}
              </div>

              {/* makaralar */}
              <div
                className="relative grid grid-cols-3 gap-2 rounded-2xl bg-[#1a0306] p-2 shadow-[inset_0_4px_16px_rgba(0,0,0,0.8)]"
                style={{ ["--cell" as string]: "66px" }}
              >
                {reels.map((col, i) => (
                  <div
                    key={i}
                    className="overflow-hidden rounded-xl bg-gradient-to-b from-[#d9dde6] via-white to-[#d9dde6] shadow-[inset_0_0_12px_rgba(0,0,0,0.35)]"
                  >
                    <Reel
                      symbols={col}
                      spinning={i >= stopped}
                      pool={CLASSIC_SYMBOLS}
                      render={(s) => <Symbol s={s} />}
                      highlight={won ? [false, true, false] : undefined}
                      cellClass="grid place-items-center rounded-lg"
                      seed={i + 1}
                    />
                  </div>
                ))}
                {/* ödeme çizgisi */}
                <div className="pointer-events-none absolute inset-x-1 top-1/2 h-[3px] -translate-y-1/2 rounded-full bg-[#c8102e]/70 shadow-[0_0_8px_#ff3d5a]" />
                <span className="absolute -left-2 top-1/2 -translate-y-1/2 text-[10px] text-[#ffd062]">▶</span>
                <span className="absolute -right-2 top-1/2 -translate-y-1/2 text-[10px] text-[#ffd062]">◀</span>
              </div>
            </div>
          </div>
        </div>

        {/* --- SONUÇ --- */}
        <div className="grid min-h-[72px] place-items-center">
          {error ? (
            <p className="rounded-2xl bg-lose/15 px-4 py-2.5 text-sm text-lose">{error}</p>
          ) : result && !spinning ? (
            <div className="text-center">
              {result.payout > 0 ? (
                <div className="mb-1 text-xs font-black uppercase tracking-widest text-gold">{result.result.label}</div>
              ) : null}
              <ResultFlash payout={result.payout} stake={result.stake} mult={result.mult} badges={result.newBadges} />
            </div>
          ) : spinning ? (
            <p className="animate-pulse text-sm text-muted">makaralar dönüyor…</p>
          ) : (
            <p className="text-sm text-muted">Bahsini seç ve kolu çek</p>
          )}
        </div>
      </div>

      <div className="space-y-4 lg:sticky lg:top-20">
        <BetControls bet={bet} setBet={setBet} balance={balance} disabled={spinning} />

        <ActionDock>
          <Button onClick={spin} disabled={spinning || bet > balance} tone="gold" className="w-full !py-4 !text-lg">
            {spinning ? "Dönüyor…" : bet > balance ? "Bakiye yetersiz" : "ÇEVİR 🍒"}
          </Button>
        </ActionDock>

        {history.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {history.map((m, i) => (
              <span
                key={i}
                className={`tabular rounded-lg px-2 py-1 text-[11px] font-black ${
                  m >= 10 ? "bg-gold/20 text-gold" : m > 0 ? "bg-win/15 text-win" : "bg-white/6 text-white/45"
                }`}
              >
                {m > 0 ? fmtMult(m) : "×"}
              </span>
            ))}
          </div>
        ) : null}

        <Card>
          <SectionTitle right="RTP %95">Ödeme Tablosu</SectionTitle>
          <ul className="space-y-1.5">
            {[...CLASSIC_TABLE].reverse().filter((t) => t.mult > 0).map((t) => (
              <li key={t.cls} className="flex items-center gap-3 text-sm">
                <span className="w-28 shrink-0 font-bold text-white/85">{t.label}</span>
                <span className="tabular font-display font-black text-gold">{fmtMult(t.mult / 100)}</span>
                <span className="tabular ml-auto text-xs text-muted">
                  %{((t.weight / totalWeight) * 100).toFixed(2).replace(".", ",")}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-[11px] leading-relaxed text-muted">
            Yalnız ortadaki çizgi öder. &quot;Karışık meyve&quot;: çizgideki üç sembolün hepsi meyve (🍒🍋🍉) ama
            aynı değil. &quot;İki 🍒&quot;: çizgide tam iki kiraz, üçüncüsü meyve değil. En küçük kazanç 1,5x;
            çevirmelerin yaklaşık üçte biri kazançlı.
          </p>
        </Card>

        <div className="flex justify-center">
          <Pill tone="info">sonuç sunucuda belirlenir</Pill>
        </div>
      </div>
    </div>
  );
}

"use client";

import { useEffect, useRef, useState } from "react";
import { Button, Card, Pill, SectionTitle } from "@/components/ui";
import { BetControls } from "@/components/games/BetControls";
import { newKey, post } from "@/hooks/useApi";
import { COIN, DICE_MAX_WIN_OUTCOMES, DICE_MIN_WIN_OUTCOMES, RTP_BPS } from "@/lib/games/config";
import { coins, mult as fmtMult } from "@/lib/format";
import { sfx } from "@/lib/sound";
import { outcomeOf } from "@/lib/outcome";

interface DiceResponse {
  payout: number;
  mult: number;
  balance: number;
  result: { roll: number; threshold: number; mode: "under" | "over"; winChance: number };
  newBadges: { id: string; title: string; icon: string; reward: number }[];
}

/**
 * Tek bir zar küpü. Sonuç 0,00–99,99 arası olduğu için klasik noktalı
 * zar kullanılmıyor — iki küp sonucun onlar ve birler basamağını
 * gösteriyor, ondalık kısım altta yazılıyor. Böylece görsel, oyunun
 * gerçekten ürettiği sayıyla birebir uyuşuyor.
 */
function Die({
  digit,
  rolling,
  tone,
}: {
  digit: string;
  rolling: boolean;
  tone: "win" | "lose" | "idle";
}) {
  const face =
    tone === "win"
      ? { bg: "linear-gradient(160deg,#ffffff,#eafff3 55%,#bff0d6)", ink: "#0b6b3a" }
      : tone === "lose"
        ? { bg: "linear-gradient(160deg,#ffffff,#fff0f2 55%,#ffd2da)", ink: "#a11026" }
        : { bg: "linear-gradient(160deg,#ffffff,#f4f7ff 55%,#dbe4f5)", ink: "#1b2a44" };

  return (
    <div
      className={`grid size-[72px] place-items-center rounded-[18px] sm:size-20 ${
        rolling ? "animate-tumble" : "animate-settle"
      }`}
      style={{
        background: face.bg,
        boxShadow:
          "0 10px 22px rgba(0,0,0,0.55), inset 0 -4px 0 rgba(0,0,0,0.16), inset 0 3px 0 rgba(255,255,255,0.95)",
      }}
    >
      <span
        className="font-display text-4xl font-black leading-none sm:text-[2.6rem]"
        style={{ color: face.ink }}
      >
        {digit}
      </span>
    </div>
  );
}

export function DiceGame({
  balance,
  onSettled,
  onReload,
}: {
  balance: number;
  onSettled: (b: number) => void;
  onReload: () => Promise<void>;
}) {
  const [bet, setBet] = useState(50 * COIN);
  const [winOutcomes, setWinOutcomes] = useState(4750); // %47,50
  const [mode, setMode] = useState<"under" | "over">("under");
  const [rolling, setRolling] = useState(false);
  const [result, setResult] = useState<(DiceResponse & { stake: number }) | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<{ roll: number; won: boolean }[]>([]);

  // Çarpan doğrudan kazanma şansından türer: 9500 / W. Sunucu da böyle hesaplar.
  const payoutMult = RTP_BPS / winOutcomes;
  const chance = winOutcomes / 100;
  const threshold = mode === "under" ? winOutcomes / 100 : (10_000 - winOutcomes) / 100;

  async function roll() {
    if (rolling) return;
    sfx.prime();
    sfx.click();
    setError(null);
    setRolling(true);

    try {
      const res = await post<DiceResponse>("/api/games/dice/bet", {
        bet,
        idempotencyKey: newKey("dice"),
        winOutcomes,
        mode,
      });
      // Zar yuvarlanma hissi için kısa bir gecikme.
      setTimeout(() => {
        setResult({ ...res, stake: bet });
        setRolling(false);
        onSettled(res.balance);
        setHistory((h) => [{ roll: res.result.roll, won: res.payout > 0 }, ...h].slice(0, 14));
        if (res.payout > bet) sfx.win(res.mult);
        else sfx.lose();
        if (res.newBadges.length > 0) setTimeout(() => sfx.badge(), 450);
        void onReload();
      }, 520);
    } catch (e) {
      setRolling(false);
      setError(e instanceof Error ? e.message : "Bir hata oldu");
    }
  }

  const roll100 = result ? result.result.roll : null;

  /** Atış sürerken küplerde dönen sahte basamaklar. */
  const [spinDigits, setSpinDigits] = useState("00");
  const spinTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    if (rolling) {
      spinTimer.current = setInterval(() => {
        setSpinDigits(String(Math.floor(Math.random() * 100)).padStart(2, "0"));
      }, 70);
    } else if (spinTimer.current) {
      clearInterval(spinTimer.current);
      spinTimer.current = null;
    }
    return () => {
      if (spinTimer.current) clearInterval(spinTimer.current);
    };
  }, [rolling]);

  const shown = rolling
    ? spinDigits
    : roll100 !== null
      ? String(Math.floor(roll100)).padStart(2, "0")
      : "--";
  const outcome = result ? outcomeOf(result.payout, result.stake, result.mult) : null;
  const won = outcome?.kind === "win";
  const dieTone: "win" | "lose" | "idle" = rolling || !result ? "idle" : won ? "win" : "lose";

  return (
    <div className="space-y-4 lg:grid lg:grid-cols-[minmax(0,1.05fr)_minmax(0,360px)] lg:items-start lg:gap-6 lg:space-y-0">
      {/* Geniş ekranda tahta solda kalır, kontroller sağa geçer. */}
      <div className="space-y-4">
      {/* --- ZAR ŞERİDİ --- */}
      <div className="gold-hairline relative overflow-hidden rounded-3xl bg-gradient-to-b from-surface-2/80 to-surface/90 p-4 pb-6">
        <div className="mb-6 text-center">
          <div className="mb-3 flex items-end justify-center gap-3">
            <Die digit={shown[0]!} rolling={rolling} tone={dieTone} />
            <Die digit={shown[1]!} rolling={rolling} tone={dieTone} />
          </div>
          <div
            className={`font-display tabular text-3xl font-black transition-colors ${
              rolling ? "animate-pulse text-white/40" : won ? "text-win" : result ? "text-lose" : "text-white"
            }`}
          >
            {rolling ? "…" : roll100 !== null ? roll100.toFixed(2).replace(".", ",") : "—"}
          </div>
          <div className="mt-1 text-xs text-muted">
            {outcome
              ? outcome.numeric
                ? `${outcome.headline} · ${outcome.note}`
                : outcome.headline
              : "0,00 – 99,99 arası atılır"}
          </div>
        </div>

        {/* kazanç aralığı çubuğu */}
        <div className="relative h-6">
          <div className="absolute inset-x-0 top-1/2 h-3 -translate-y-1/2 overflow-hidden rounded-full bg-black/55 ring-1 ring-white/10">
            <div
              className="absolute inset-y-0 bg-gradient-to-r from-[#1f8b4c] to-[#2fe08a]"
              style={
                mode === "under"
                  ? { left: 0, width: `${chance}%` }
                  : { right: 0, width: `${chance}%` }
              }
            />
          </div>

          {/* eşik işareti */}
          <div
            className="absolute top-1/2 h-6 w-0.5 -translate-x-1/2 -translate-y-1/2 bg-gold shadow-[0_0_8px_rgba(255,201,74,0.9)]"
            style={{ left: `${threshold}%` }}
          />

          {/* atılan zarın yeri */}
          {roll100 !== null && !rolling ? (
            <div
              className="animate-pop absolute top-1/2 -translate-x-1/2 -translate-y-1/2"
              style={{ left: `${roll100}%` }}
            >
              <div
                className={`size-5 rounded-full ring-2 ring-white/70 ${won ? "bg-win" : "bg-lose"}`}
              />
            </div>
          ) : null}
        </div>

        <div className="mt-2 flex justify-between text-[10px] text-muted">
          <span>0</span>
          <span className="tabular text-gold">eşik {threshold.toFixed(2).replace(".", ",")}</span>
          <span>100</span>
        </div>
      </div>

      </div>

      <div className="space-y-4 lg:sticky lg:top-20">
      {/* --- AYARLAR --- */}
      <div className="gold-hairline space-y-3 rounded-3xl bg-gradient-to-b from-surface-2/80 to-surface/90 p-3">
        <div className="flex gap-1.5">
          {(["under", "over"] as const).map((m) => (
            <button
              key={m}
              onClick={() => {
                setMode(m);
                sfx.click();
              }}
              className={`flex-1 rounded-xl py-2.5 text-xs font-black transition ${
                mode === m ? "gold-metal text-[#3a2500]" : "bg-white/6 text-white/70 ring-1 ring-white/10"
              }`}
            >
              {m === "under" ? "ALTINDA" : "ÜSTÜNDE"}
            </button>
          ))}
        </div>

        <div>
          <div className="mb-1.5 flex items-center justify-between text-[11px]">
            <span className="font-black uppercase tracking-widest text-muted">Kazanma şansı</span>
            <span className="tabular font-black text-win">%{chance.toFixed(2).replace(".", ",")}</span>
          </div>
          <input
            type="range"
            min={DICE_MIN_WIN_OUTCOMES}
            max={DICE_MAX_WIN_OUTCOMES}
            step={25}
            value={winOutcomes}
            disabled={rolling}
            onChange={(e) => setWinOutcomes(Number(e.target.value))}
            className="h-2 w-full cursor-pointer appearance-none rounded-full bg-black/55
                       accent-[#ffc94a] outline-none ring-1 ring-white/10"
            aria-label="Kazanma şansı"
          />
          <div className="mt-2 flex items-center justify-between">
            <span className="text-[11px] text-muted">Ödeme</span>
            <span className="tabular font-display text-lg font-black text-gold">
              {fmtMult(payoutMult)}
            </span>
          </div>
        </div>
      </div>

      <BetControls bet={bet} setBet={setBet} balance={balance} disabled={rolling} />

      {error ? (
        <p className="rounded-2xl bg-lose/15 px-4 py-2.5 text-center text-sm text-lose">{error}</p>
      ) : null}

      {result && result.newBadges.length > 0 ? (
        <div className="flex flex-wrap justify-center gap-2">
          {result.newBadges.map((b) => (
            <span
              key={b.id}
              className="animate-pop rounded-full bg-gold/15 px-3 py-1.5 text-xs font-black text-gold ring-1 ring-gold/30"
            >
              {b.icon} {b.title} +{coins(b.reward)}
            </span>
          ))}
        </div>
      ) : null}

      <Button onClick={roll} disabled={rolling || bet > balance} tone="gold" className="w-full !py-4 !text-lg">
        {rolling ? "Atılıyor…" : bet > balance ? "Bakiye yetersiz" : "ZAR AT"}
      </Button>

      {history.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {history.map((h, i) => (
            <span
              key={i}
              className={`tabular rounded-lg px-2 py-1 text-[11px] font-black ${
                h.won ? "bg-win/15 text-win" : "bg-white/6 text-white/45"
              }`}
            >
              {h.roll.toFixed(2).replace(".", ",")}
            </span>
          ))}
        </div>
      ) : null}

      <Card>
        <SectionTitle right="RTP %95">Nasıl çalışır</SectionTitle>
        <p className="text-xs leading-relaxed text-muted">
          0,00–99,99 arasında 10.000 eşit olasılıklı sonuç var. Kazanma şansını sen belirliyorsun;
          ödeme doğrudan ondan türüyor: <strong className="text-white/80">9500 ÷ kazanan sonuç sayısı</strong>.
          Şansı %1&apos;e indirirsen 95x, %95&apos;e çıkarırsan 1x ödüyor — hangi noktayı seçersen
          seç beklenen getiri aynı.
        </p>
      </Card>

      <div className="flex justify-center">
        <Pill tone="info">zar sunucuda atılır</Pill>
      </div>
      </div>
    </div>
  );
}

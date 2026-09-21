"use client";

import { useState } from "react";
import { Button, Card, Pill, SectionTitle } from "@/components/ui";
import { BetControls } from "@/components/games/BetControls";
import { newKey, post } from "@/hooks/useApi";
import { COIN, GUESS_MAX_PICKS, GUESS_RANGE, RTP_BPS } from "@/lib/games/config";
import { coins, mult as fmtMult } from "@/lib/format";
import { sfx } from "@/lib/sound";
import { outcomeOf } from "@/lib/outcome";

interface GuessResponse {
  payout: number;
  mult: number;
  balance: number;
  result: { drawn: number; picks: number[] };
  newBadges: { id: string; title: string; icon: string; reward: number }[];
}

const BALL_COLORS = [
  "#e01e37", "#2f80ed", "#1f8b4c", "#9d5cff", "#ff8c1a",
  "#2ee6ff", "#ff3d9a", "#ffc94a", "#8b5cf6", "#22c55e",
];

export function GuessGame({
  balance,
  onSettled,
  onReload,
}: {
  balance: number;
  onSettled: (b: number) => void;
  onReload: () => Promise<void>;
}) {
  const [bet, setBet] = useState(50 * COIN);
  const [picks, setPicks] = useState<number[]>([7]);
  const [drawing, setDrawing] = useState(false);
  const [spinNum, setSpinNum] = useState(1);
  const [result, setResult] = useState<(GuessResponse & { stake: number }) | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<{ drawn: number; won: boolean }[]>([]);

  const payoutMult = picks.length > 0 ? RTP_BPS / (1000 * picks.length) : 0;

  function toggle(n: number) {
    if (drawing) return;
    sfx.chip();
    setPicks((p) =>
      p.includes(n) ? p.filter((x) => x !== n) : p.length >= GUESS_MAX_PICKS ? p : [...p, n].sort((a, b) => a - b),
    );
  }

  async function draw() {
    if (drawing || picks.length === 0) return;
    sfx.prime();
    sfx.click();
    setError(null);
    setResult(null);
    setDrawing(true);

    // Çekiliş hissi: rakamlar hızla dönsün.
    const spin = setInterval(() => setSpinNum(1 + Math.floor(Math.random() * GUESS_RANGE)), 70);

    try {
      const res = await post<GuessResponse>("/api/games/guess/bet", {
        bet,
        idempotencyKey: newKey("guess"),
        picks,
      });
      setTimeout(() => {
        clearInterval(spin);
        setSpinNum(res.result.drawn);
        setResult({ ...res, stake: bet });
        setDrawing(false);
        onSettled(res.balance);
        setHistory((h) => [{ drawn: res.result.drawn, won: res.payout > 0 }, ...h].slice(0, 14));
        if (res.payout > bet) sfx.win(res.mult);
        else sfx.lose();
        if (res.newBadges.length > 0) setTimeout(() => sfx.badge(), 450);
        void onReload();
      }, 900);
    } catch (e) {
      clearInterval(spin);
      setDrawing(false);
      setError(e instanceof Error ? e.message : "Bir hata oldu");
    }
  }

  const shown = result ? result.result.drawn : spinNum;
  const outcome = result ? outcomeOf(result.payout, result.stake, result.mult) : null;
  const won = outcome?.kind === "win";

  return (
    <div className="space-y-4 lg:grid lg:grid-cols-[minmax(0,1.05fr)_minmax(0,360px)] lg:items-start lg:gap-6 lg:space-y-0">
      {/* Geniş ekranda tahta solda kalır, kontroller sağa geçer. */}
      <div className="space-y-4">
      {/* --- ÇEKİLİŞ TOPU --- */}
      <div className="gold-hairline grid place-items-center rounded-3xl bg-[radial-gradient(120%_100%_at_50%_0%,#0c2d6b_0%,#08193c_50%,#040a18_100%)] py-8">
        <div
          className={`relative grid size-28 place-items-center rounded-full transition-transform ${
            drawing ? "animate-pulse" : result ? "animate-pop" : ""
          }`}
          style={{
            background: `radial-gradient(circle at 38% 30%, #ffffff 0 12%, ${BALL_COLORS[shown - 1]} 13% 62%, rgba(0,0,0,0.5) 63% 100%)`,
            boxShadow: "0 14px 34px rgba(0,0,0,0.6)",
          }}
        >
          <div className="grid size-16 place-items-center rounded-full bg-white shadow-inner">
            <span className="font-display tabular text-3xl font-black text-[#12263d]">{shown}</span>
          </div>
        </div>

        <div className="mt-4 text-center">
          {result ? (
            <>
              <div
                className={`font-display font-black ${outcome!.tone} ${
                  outcome!.numeric ? "tabular text-2xl" : "text-xl"
                }`}
              >
                {outcome!.headline}
              </div>
              <div className={`text-xs font-black ${won ? "text-gold" : "text-white/40"}`}>
                {outcome!.note}
              </div>
            </>
          ) : drawing ? (
            <p className="animate-pulse text-sm text-muted">çekiliyor…</p>
          ) : (
            <p className="text-sm text-muted">1–10 arasından seç</p>
          )}
        </div>
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
      {/* --- SAYILAR --- */}
      <div className="gold-hairline rounded-3xl bg-gradient-to-b from-surface-2/80 to-surface/90 p-3">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-[11px] font-black uppercase tracking-widest text-muted">
            {picks.length} sayı seçili
          </span>
          <span className="tabular font-display text-lg font-black text-gold">
            {picks.length > 0 ? fmtMult(payoutMult) : "—"}
          </span>
        </div>

        <div className="grid grid-cols-5 gap-2">
          {Array.from({ length: GUESS_RANGE }, (_, i) => i + 1).map((n) => {
            const on = picks.includes(n);
            const isDrawn = result?.result.drawn === n;
            return (
              <button
                key={n}
                onClick={() => toggle(n)}
                disabled={drawing}
                className={`relative grid aspect-square place-items-center rounded-full font-display
                  text-base font-black transition disabled:opacity-50
                  ${on ? "scale-105" : "active:scale-95"}
                  ${isDrawn ? "ring-2 ring-white" : ""}`}
                style={{
                  background: on
                    ? `radial-gradient(circle at 38% 30%, #ffffff 0 14%, ${BALL_COLORS[n - 1]} 15% 64%, rgba(0,0,0,0.45) 65% 100%)`
                    : "rgba(255,255,255,0.06)",
                  color: on ? "#ffffff" : "rgba(255,255,255,0.6)",
                  boxShadow: on ? "0 0 0 2px #ffd062, 0 6px 14px rgba(0,0,0,0.5)" : "none",
                }}
              >
                {n}
              </button>
            );
          })}
        </div>

        <p className="mt-2 text-[11px] text-muted">
          Ne kadar çok sayı seçersen kazanma şansın artar, ödeme o kadar düşer — beklenen getiri
          değişmez.
        </p>
      </div>

      <BetControls bet={bet} setBet={setBet} balance={balance} disabled={drawing} />

      {error ? (
        <p className="rounded-2xl bg-lose/15 px-4 py-2.5 text-center text-sm text-lose">{error}</p>
      ) : null}

      <Button
        onClick={draw}
        disabled={drawing || picks.length === 0 || bet > balance}
        tone="gold"
        className="w-full !py-4 !text-lg"
      >
        {drawing ? "Çekiliyor…" : picks.length === 0 ? "Sayı seç" : bet > balance ? "Bakiye yetersiz" : "ÇEKİLİŞ"}
      </Button>

      {history.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {history.map((h, i) => (
            <span
              key={i}
              className={`tabular grid size-7 place-items-center rounded-lg text-[11px] font-black ${
                h.won ? "bg-win/20 text-win" : "bg-white/6 text-white/45"
              }`}
            >
              {h.drawn}
            </span>
          ))}
        </div>
      ) : null}

      <Card>
        <SectionTitle right="RTP %95">Nasıl çalışır</SectionTitle>
        <p className="text-xs leading-relaxed text-muted">
          1–10 arasından bir sayı çekilir. k tane sayı seçersen ödeme{" "}
          <strong className="text-white/80">9,5 ÷ k</strong> olur: tek sayıda 9,50x, üç sayıda
          3,17x, dokuz sayıda 1,06x. Kazanma şansın da aynı oranda arttığı için beklenen getiri
          her seçimde aynı kalır.
        </p>
      </Card>

      <div className="flex justify-center">
        <Pill tone="info">çekiliş sunucuda yapılır · provably fair</Pill>
      </div>
      </div>
    </div>
  );
}

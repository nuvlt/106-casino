"use client";

import { useState } from "react";
import { Button, Card, Pill, SectionTitle } from "@/components/ui";
import { BetControls } from "@/components/games/BetControls";
import { newKey, post } from "@/hooks/useApi";
import { COIN, SCRATCH_PRIZES } from "@/lib/games/config";
import { coins, mult as fmtMult } from "@/lib/format";
import { sfx } from "@/lib/sound";
import { ResultFlash } from "@/components/games/ResultFlash";

interface ScratchResponse {
  payout: number;
  mult: number;
  balance: number;
  result: { prizeIndex: number; symbol: string; grid: string[] };
  newBadges: { id: string; title: string; icon: string; reward: number }[];
}

export function ScratchGame({
  balance,
  onSettled,
  onReload,
}: {
  balance: number;
  onSettled: (b: number) => void;
  onReload: () => Promise<void>;
}) {
  const [bet, setBet] = useState(50 * COIN);
  const [card, setCard] = useState<(ScratchResponse & { stake: number }) | null>(null);
  const [revealed, setRevealed] = useState<boolean[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [history, setHistory] = useState<number[]>([]);

  const allOpen = revealed.length === 9 && revealed.every(Boolean);

  async function buy() {
    if (busy) return;
    sfx.prime();
    sfx.click();
    setError(null);
    setBusy(true);
    try {
      const res = await post<ScratchResponse>("/api/games/scratch/bet", {
        bet,
        idempotencyKey: newKey("scratch"),
      });
      setCard({ ...res, stake: bet });
      setRevealed(Array(9).fill(false));
      // Kazanç kazınmadan bakiyeye yazılırsa üst şerit sonucu ele verir.
      // Sunucu turu çoktan kapattı; burada yalnızca gösterimi geciktiriyoruz.
      const withheld = res.payout + res.newBadges.reduce((sum, b) => sum + b.reward, 0);
      onSettled(res.balance - withheld);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Bir hata oldu");
    } finally {
      setBusy(false);
    }
  }

  /** Bir hücreyi aç. Sonuç zaten sunucuda belli — bu yalnızca gösterim. */
  function scratch(i: number) {
    if (!card || revealed[i]) return;
    sfx.tick();
    const next = [...revealed];
    next[i] = true;
    setRevealed(next);
    if (next.every(Boolean)) finish();
  }

  function revealAll() {
    if (!card) return;
    setRevealed(Array(9).fill(true));
    finish();
  }

  function finish() {
    if (!card) return;
    // Kart bitti — saklanan kazanç artık bakiyeye yansıyabilir.
    onSettled(card.balance);
    void onReload();
    setHistory((h) => [card.mult, ...h].slice(0, 14));
    setTimeout(() => {
      if (card.payout > card.stake) sfx.win(card.mult);
      else sfx.lose();
      if (card.newBadges.length > 0) setTimeout(() => sfx.badge(), 450);
    }, 180);
  }

  return (
    <div className="space-y-4 lg:grid lg:grid-cols-[minmax(0,1.05fr)_minmax(0,360px)] lg:items-start lg:gap-6 lg:space-y-0">
      {/* Geniş ekranda tahta solda kalır, kontroller sağa geçer. */}
      <div className="space-y-4">
      {/* --- KART --- */}
      <div
        className="gloss relative overflow-hidden rounded-3xl p-[3px]
                   bg-gradient-to-b from-[#ffd977] via-[#a9760a] to-[#7a5804]
                   shadow-[0_16px_44px_rgba(0,0,0,0.55)]"
      >
        <div className="rounded-[22px] bg-[radial-gradient(120%_120%_at_50%_0%,#7c2d12_0%,#3d1408_55%,#1a0904_100%)] p-4">
          <div className="mb-3 text-center">
            <div className="font-display text-sm font-black uppercase tracking-[0.25em] text-gold">
              106 Kazı Kazan
            </div>
            <div className="text-[11px] text-white/55">üç aynı sembol = ödül</div>
          </div>

          <div className="grid grid-cols-3 gap-2">
            {Array.from({ length: 9 }, (_, i) => {
              const open = revealed[i];
              const symbol = card?.result.grid[i] ?? "";
              const isWinner = allOpen && card && symbol === card.result.symbol && card.payout > 0;
              return (
                <button
                  key={i}
                  onClick={() => scratch(i)}
                  disabled={!card || open}
                  className={`relative grid aspect-square place-items-center overflow-hidden rounded-xl
                    text-3xl transition ${open ? "" : "active:scale-95"}
                    ${isWinner ? "ring-2 ring-gold shadow-[0_0_18px_rgba(255,201,74,0.7)]" : ""}`}
                  style={{
                    background: open
                      ? "linear-gradient(180deg,#fff6e6,#e8d8bd)"
                      : "linear-gradient(145deg,#c9ced8,#8e97a6 55%,#b6bdc9)",
                  }}
                  aria-label={open ? symbol : "kazı"}
                >
                  {open ? (
                    <span className="animate-pop">{symbol}</span>
                  ) : (
                    <span className="text-[10px] font-black uppercase tracking-wider text-black/35">
                      kazı
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {card && !allOpen ? (
            <button
              onClick={revealAll}
              className="mt-3 w-full rounded-xl bg-white/10 py-2 text-xs font-black text-white/80 ring-1 ring-white/15 active:bg-white/16"
            >
              hepsini aç
            </button>
          ) : null}
        </div>
      </div>

      {/* --- SONUÇ --- */}
      <div className="grid min-h-[56px] place-items-center">
        {error ? (
          <p className="rounded-2xl bg-lose/15 px-4 py-2.5 text-sm text-lose">{error}</p>
        ) : allOpen && card ? (
          <ResultFlash
            payout={card.payout}
            stake={card.stake}
            mult={card.mult}
            badges={card.newBadges}
          />
        ) : card ? (
          <p className="text-sm text-muted">Hücrelere dokunup kazı</p>
        ) : (
          <p className="text-sm text-muted">Bahsini seç ve kart al</p>
        )}
      </div>

      {allOpen && card && card.newBadges.length > 0 ? (
        <div className="flex flex-wrap justify-center gap-2">
          {card.newBadges.map((b) => (
            <span key={b.id} className="animate-pop rounded-full bg-gold/15 px-3 py-1.5 text-xs font-black text-gold ring-1 ring-gold/30">
              {b.icon} {b.title} +{coins(b.reward)}
            </span>
          ))}
        </div>
      ) : null}

      </div>

      <div className="space-y-4 lg:sticky lg:top-20">
      <BetControls bet={bet} setBet={setBet} balance={balance} disabled={!!card && !allOpen} />

      <Button
        onClick={buy}
        disabled={busy || bet > balance || (!!card && !allOpen)}
        tone="gold"
        className="w-full !py-4 !text-lg"
      >
        {bet > balance ? "Bakiye yetersiz" : card && !allOpen ? "Önce kartı bitir" : "KART AL"}
      </Button>

      {history.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {history.map((m, i) => (
            <span
              key={i}
              className={`tabular rounded-lg px-2 py-1 text-[11px] font-black ${
                m >= 10 ? "bg-gold/20 text-gold" : m > 0 ? "bg-win/15 text-win" : "bg-white/6 text-white/45"
              }`}
            >
              {fmtMult(m)}
            </span>
          ))}
        </div>
      ) : null}

      <Card>
        <SectionTitle right="RTP %95">Ödül Tablosu</SectionTitle>
        <ul className="grid grid-cols-2 gap-x-4 gap-y-1.5">
          {SCRATCH_PRIZES.filter((p) => p.mult > 0).map((p) => (
            <li key={p.symbol} className="flex items-center gap-2 text-sm">
              <span className="text-base">{p.symbol}</span>
              <span className="font-black text-white/85">{p.mult / 100}x</span>
              <span className="tabular ml-auto text-[11px] text-muted">
                %{(p.weight / 100).toFixed(2).replace(".", ",")}
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-[11px] leading-relaxed text-muted">
          Sonuç kart alındığı anda sunucuda belirlenir; kazıma sırası hiçbir şeyi değiştirmez.
          Hangi hücreyi önce açtığın ödülü etkilemez.
        </p>
      </Card>

      <div className="flex justify-center">
        <Pill tone="info">sonuç kart alınırken belirlenir · provably fair</Pill>
      </div>
      </div>
    </div>
  );
}

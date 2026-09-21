"use client";

import { useState } from "react";
import { Button, Card, Pill, SectionTitle } from "@/components/ui";
import { BetControls } from "@/components/games/BetControls";
import { newKey, post } from "@/hooks/useApi";
import { COIN } from "@/lib/games/config";
import { coins, mult as fmtMult } from "@/lib/format";
import { sfx } from "@/lib/sound";
import { outcomeOf } from "@/lib/outcome";

interface HiloState {
  cards: { value: number; label: string }[];
  mult: number;
  step: number;
  odds: { higher: number; lower: number };
  nextMult: { higher: number | null; lower: number | null };
}

interface StartResponse {
  roundId: string;
  bet: number;
  balance: number;
  state: HiloState;
}

interface StepResponse {
  won: boolean;
  roundId: string;
  state?: HiloState;
  cashoutValue?: number;
  payout?: number;
  mult?: number;
  balance?: number;
  result?: HiloState & { lost?: boolean };
  newBadges?: { id: string; title: string; icon: string; reward: number }[];
}

interface CashoutResponse {
  payout: number;
  mult: number;
  balance: number;
  newBadges: { id: string; title: string; icon: string; reward: number }[];
}

/** Kartın rengi: karo/kupa kırmızı, sinek/maça siyah. */
const isRed = (label: string) => label.includes("♦") || label.includes("♥");

function PlayingCard({ label, big }: { label: string; big?: boolean }) {
  const red = isRed(label);
  const rank = label.slice(0, -1);
  const suit = label.slice(-1);
  return (
    <div
      className={`relative shrink-0 rounded-xl bg-gradient-to-b from-white to-[#e9edf5]
        shadow-[0_6px_16px_rgba(0,0,0,0.45)] ring-1 ring-black/20
        ${big ? "h-32 w-24" : "h-12 w-9"}`}
    >
      <span
        className={`absolute left-1.5 top-1 font-display font-black leading-none ${
          big ? "text-xl" : "text-[11px]"
        }`}
        style={{ color: red ? "#e01e37" : "#12263d" }}
      >
        {rank}
      </span>
      <span
        className={`absolute inset-0 grid place-items-center ${big ? "text-5xl" : "text-lg"}`}
        style={{ color: red ? "#e01e37" : "#12263d" }}
      >
        {suit}
      </span>
    </div>
  );
}

export function HiloGame({
  balance,
  onSettled,
  onReload,
}: {
  balance: number;
  onSettled: (b: number) => void;
  onReload: () => Promise<void>;
}) {
  const [bet, setBet] = useState(50 * COIN);
  const [roundId, setRoundId] = useState<string | null>(null);
  /** Turun açıldığı andaki bahis — zincir sürerken `bet` değişebilir. */
  const [roundStake, setRoundStake] = useState(0);
  const [state, setState] = useState<HiloState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [finished, setFinished] = useState<{
    payout: number;
    mult: number;
    lost: boolean;
    stake: number;
  } | null>(null);
  const [badges, setBadges] = useState<{ id: string; title: string; icon: string; reward: number }[]>([]);
  const [history, setHistory] = useState<number[]>([]);

  const current = state?.cards.at(-1);
  const cashoutValue = state ? Math.floor(bet * state.mult) : 0;

  async function start() {
    if (busy) return;
    sfx.prime();
    sfx.click();
    setError(null);
    setFinished(null);
    setBadges([]);
    setBusy(true);
    try {
      const res = await post<StartResponse>("/api/games/hilo/start", {
        bet,
        idempotencyKey: newKey("hilo"),
      });
      setRoundId(res.roundId);
      setRoundStake(bet);
      setState(res.state);
      onSettled(res.balance);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Tur başlatılamadı");
    } finally {
      setBusy(false);
    }
  }

  async function step(guess: "higher" | "lower") {
    if (!roundId || busy) return;
    sfx.tick();
    setBusy(true);
    try {
      const res = await post<StepResponse>("/api/games/hilo/step", { roundId, guess });
      if (res.won && res.state) {
        setState(res.state);
        sfx.cashout(res.state.mult);
      } else {
        // Kaybedildi — tur aynı istekte kapandı.
        setState(res.result ?? null);
        setFinished({ payout: 0, mult: 0, lost: true, stake: roundStake });
        setBadges(res.newBadges ?? []);
        setRoundId(null);
        if (res.balance !== undefined) onSettled(res.balance);
        setHistory((h) => [0, ...h].slice(0, 14));
        sfx.lose();
        void onReload();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Bir hata oldu");
    } finally {
      setBusy(false);
    }
  }

  async function cashout() {
    if (!roundId || busy) return;
    setBusy(true);
    try {
      const res = await post<CashoutResponse>("/api/games/hilo/cashout", { roundId });
      setFinished({ payout: res.payout, mult: res.mult, lost: false, stake: roundStake });
      setBadges(res.newBadges);
      setRoundId(null);
      onSettled(res.balance);
      setHistory((h) => [res.mult, ...h].slice(0, 14));
      if (res.payout > roundStake) sfx.win(res.mult);
      else sfx.lose();
      if (res.newBadges.length > 0) setTimeout(() => sfx.badge(), 450);
      void onReload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Çekim yapılamadı");
    } finally {
      setBusy(false);
    }
  }

  const playing = roundId !== null && state !== null;

  return (
    <div className="space-y-4 lg:grid lg:grid-cols-[minmax(0,1.05fr)_minmax(0,360px)] lg:items-start lg:gap-6 lg:space-y-0">
      {/* Geniş ekranda tahta solda kalır, kontroller sağa geçer. */}
      <div className="space-y-4">
      {/* --- MASA --- */}
      <div className="gold-hairline rounded-3xl bg-[radial-gradient(120%_100%_at_50%_0%,#1d5a39_0%,#0d3b25_45%,#061a12_100%)] p-4">
        <div className="grid place-items-center py-2">
          {current ? (
            <PlayingCard label={current.label} big />
          ) : (
            <div className="grid h-32 w-24 place-items-center rounded-xl bg-gradient-to-br from-[#1b3b6f] to-[#0d1f3d] text-4xl text-white/25 ring-1 ring-white/15">
              ?
            </div>
          )}
        </div>

        {state ? (
          <div className="mt-3 text-center">
            <div className="tabular font-display text-2xl font-black text-gold">
              {fmtMult(state.mult)}
            </div>
            <div className="text-[11px] text-white/60">
              {state.step === 0 ? "ilk tahminini yap" : `${state.step} adım · şu an ${coins(cashoutValue)} coin`}
            </div>
          </div>
        ) : null}

        {/* açılmış kartlar */}
        {state && state.cards.length > 1 ? (
          <div className="mt-3 flex flex-wrap justify-center gap-1.5">
            {state.cards.slice(0, -1).map((c, i) => (
              <PlayingCard key={i} label={c.label} />
            ))}
          </div>
        ) : null}
      </div>

      {/* --- SONUÇ --- */}
      <div className="grid min-h-[52px] place-items-center">
        {error ? (
          <p className="rounded-2xl bg-lose/15 px-4 py-2.5 text-sm text-lose">{error}</p>
        ) : finished ? (
          (() => {
            // Yanlış tahminde de, bahsin altında çekişte de tek kelime.
            const o = finished.lost
              ? null
              : outcomeOf(finished.payout, finished.stake, finished.mult);
            return (
              <div className="animate-pop text-center">
                <div
                  className={`font-display font-black ${o ? o.tone : "text-lose"} ${
                    o?.numeric ? "tabular text-3xl" : "text-xl"
                  }`}
                >
                  {o ? o.headline : "kaybettin"}
                </div>
                {o?.numeric ? (
                  <div className="text-xs font-black text-gold">
                    {fmtMult(finished.mult)} ile çektin
                  </div>
                ) : null}
              </div>
            );
          })()
        ) : playing ? (
          <p className="text-sm text-muted">Sıradaki kart yüksek mi alçak mı?</p>
        ) : (
          <p className="text-sm text-muted">Bahsini seç ve desteyi aç</p>
        )}
      </div>

      {badges.length > 0 ? (
        <div className="flex flex-wrap justify-center gap-2">
          {badges.map((b) => (
            <span key={b.id} className="animate-pop rounded-full bg-gold/15 px-3 py-1.5 text-xs font-black text-gold ring-1 ring-gold/30">
              {b.icon} {b.title} +{coins(b.reward)}
            </span>
          ))}
        </div>
      ) : null}

      </div>

      <div className="space-y-4 lg:sticky lg:top-20">
      {/* --- KONTROLLER --- */}
      {playing ? (
        <>
          <div className="flex gap-2">
            <Button
              onClick={() => step("higher")}
              disabled={busy || state!.odds.higher === 0}
              tone="felt"
              className="flex-1 !py-4"
            >
              <span className="block text-sm">▲ YÜKSEK</span>
              <span className="block text-[11px] font-bold opacity-80">
                {state!.odds.higher === 0 ? "imkânsız" : `%${(state!.odds.higher * 100).toFixed(0)} · ${fmtMult(state!.nextMult.higher ?? 0)}`}
              </span>
            </Button>
            <Button
              onClick={() => step("lower")}
              disabled={busy || state!.odds.lower === 0}
              tone="ruby"
              className="flex-1 !py-4"
            >
              <span className="block text-sm">▼ ALÇAK</span>
              <span className="block text-[11px] font-bold opacity-80">
                {state!.odds.lower === 0 ? "imkânsız" : `%${(state!.odds.lower * 100).toFixed(0)} · ${fmtMult(state!.nextMult.lower ?? 0)}`}
              </span>
            </Button>
          </div>

          <Button
            onClick={cashout}
            disabled={busy || state!.step === 0}
            tone="gold"
            className="w-full !py-3.5"
          >
            {state!.step === 0 ? "önce bir tahmin yap" : `ÇEK · ${coins(cashoutValue)}`}
          </Button>
        </>
      ) : (
        <>
          <BetControls bet={bet} setBet={setBet} balance={balance} disabled={busy} />
          <Button onClick={start} disabled={busy || bet > balance} tone="gold" className="w-full !py-4 !text-lg">
            {bet > balance ? "Bakiye yetersiz" : "DESTEYİ AÇ"}
          </Button>
        </>
      )}

      {history.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {history.map((m, i) => (
            <span
              key={i}
              className={`tabular rounded-lg px-2 py-1 text-[11px] font-black ${
                m >= 5 ? "bg-gold/20 text-gold" : m > 0 ? "bg-win/15 text-win" : "bg-white/6 text-white/45"
              }`}
            >
              {m > 0 ? fmtMult(m) : "×"}
            </span>
          ))}
        </div>
      ) : null}

      <Card>
        <SectionTitle right="RTP %95">Nasıl çalışır</SectionTitle>
        <p className="text-xs leading-relaxed text-muted">
          52 kartlık karılmış deste, beraberlik yok. Ev avantajı{" "}
          <strong className="text-white/80">yalnızca ilk adımda</strong> uygulanır (×0,95); sonraki
          adımlar tam adil (1/olasılık) öder. Bu yüzden kaç adım gidersen git turun RTP&apos;si %95
          kalır — adım başına avantaj uygulansaydı 5 adımlık zincir %77&apos;ye düşerdi.
        </p>
      </Card>

      <div className="flex justify-center">
        <Pill tone="info">deste sunucuda karılır · provably fair</Pill>
      </div>
      </div>
    </div>
  );
}

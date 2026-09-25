"use client";

import { useEffect, useRef, useState } from "react";
import { Button, Card, Pill, SectionTitle } from "@/components/ui";
import { ActionDock } from "@/components/games/ActionDock";
import { BetControls } from "@/components/games/BetControls";
import { PlayingCard } from "@/components/games/PlayingCard";
import { ResultFlash } from "@/components/games/ResultFlash";
import { newKey, post } from "@/hooks/useApi";
import { COIN } from "@/lib/games/config";
import { BJ_RESULT_TEXT, type BjPublic } from "@/lib/blackjack";
import { coins } from "@/lib/format";
import { sfx } from "@/lib/sound";

interface Settled {
  payout: number;
  stake: number;
  mult: number;
  newBadges: { id: string; title: string; icon: string; reward: number }[];
}

interface HandResponse {
  roundId: string | null;
  state: BjPublic | null;
  balance?: number;
  settled?: Settled;
}

/** Krupiyenin açılan kartları tek tek gelsin — sonuç bir anda belirmesin. */
const DEALER_CARD_MS = 420;

function Hand({
  cards,
  total,
  soft,
  label,
  hiddenTotal,
  highlight,
}: {
  cards: ({ label: string } | null)[];
  total: number;
  soft?: boolean;
  label: string;
  hiddenTotal?: boolean;
  highlight?: "win" | "lose" | null;
}) {
  return (
    <div className="flex flex-col items-center gap-2">
      <div className="flex items-center gap-2 text-[11px] font-black uppercase tracking-widest text-white/60">
        {label}
        {cards.length > 0 ? (
          <span
            className={`tabular rounded-full px-2 py-0.5 text-xs ${
              highlight === "win"
                ? "bg-win/25 text-win"
                : highlight === "lose"
                  ? "bg-lose/25 text-lose"
                  : "bg-black/40 text-white"
            }`}
          >
            {hiddenTotal ? `${total} + ?` : soft && total <= 21 ? `${total - 10} / ${total}` : total}
          </span>
        ) : null}
      </div>
      <div className="flex min-h-[88px] justify-center">
        {cards.map((c, i) => (
          <PlayingCard
            key={i}
            label={c?.label ?? null}
            size="md"
            className={`animate-rise ${i > 0 ? "-ml-7" : ""}`}
          />
        ))}
      </div>
    </div>
  );
}

export function BlackjackGame({
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
  const [state, setState] = useState<BjPublic | null>(null);
  /** Kapanan elde krupiyenin kaç kartı şu an görünür (açılış animasyonu). */
  const [dealerShown, setDealerShown] = useState(2);
  const [settled, setSettled] = useState<Settled | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<{ result: string; net: number }[]>([]);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  // Yarım kalan el varsa masaya geri getir.
  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const res = await fetch("/api/games/blackjack/state", { cache: "no-store" });
        if (!res.ok) return;
        const json = (await res.json()) as HandResponse;
        if (alive && json.roundId && json.state) apply(json, { resumed: true });
      } catch {
        /* masa boş açılır */
      }
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function apply(res: HandResponse, opts: { resumed?: boolean } = {}) {
    if (!res.state) return;
    const s = res.state;
    if (typeof res.balance === "number") onSettled(res.balance);

    if (s.phase === "done" && res.settled) {
      const r = res.settled;
      // Krupiyenin kartlarını tek tek aç, sonucu en son göster.
      timers.current.forEach(clearTimeout);
      const reveal = opts.resumed ? s.dealer.length : Math.min(2, s.dealer.length);
      setDealerShown(reveal);
      setState(s);
      setRoundId(null);
      const extra = s.dealer.length - reveal;
      for (let i = 1; i <= extra; i++) {
        timers.current.push(
          setTimeout(() => {
            setDealerShown(reveal + i);
            sfx.tick();
          }, i * DEALER_CARD_MS),
        );
      }
      timers.current.push(
        setTimeout(() => {
          setSettled(r);
          setHistory((h) => [{ result: s.result ?? "", net: r.payout - r.stake }, ...h].slice(0, 12));
          if (r.payout > r.stake) sfx.win(r.mult);
          else if (r.payout < r.stake) sfx.lose();
          if (r.newBadges.length > 0) setTimeout(() => sfx.badge(), 450);
          void onReload();
        }, extra * DEALER_CARD_MS + 150),
      );
      return;
    }

    setDealerShown(2);
    setState(s);
    setRoundId(res.roundId);
  }

  async function deal() {
    if (busy) return;
    sfx.prime();
    sfx.chip();
    setError(null);
    setSettled(null);
    setBusy(true);
    try {
      const res = await post<HandResponse>("/api/games/blackjack/start", {
        bet,
        idempotencyKey: newKey("bj"),
      });
      apply(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : "El açılamadı");
    } finally {
      setBusy(false);
    }
  }

  async function act(action: "hit" | "stand" | "double") {
    if (!roundId || !state || busy) return;
    sfx.click();
    setError(null);
    setBusy(true);
    try {
      const res = await post<HandResponse>("/api/games/blackjack/action", {
        roundId,
        action,
        step: state.step,
      });
      apply(res);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Bir hata oldu";
      setError(msg);
      // Eskimiş el (iki sekme, çift tık): sunucudaki güncel hâli çek.
      try {
        const res = await fetch("/api/games/blackjack/state", { cache: "no-store" });
        if (res.ok) {
          const json = (await res.json()) as HandResponse;
          if (json.state) apply(json, { resumed: true });
        }
      } catch {
        /* hata mesajı yeterli */
      }
    } finally {
      setBusy(false);
    }
  }

  const playing = roundId !== null && state?.phase === "player";
  const done = state?.phase === "done";
  const revealing = done && dealerShown < (state?.dealer.length ?? 0);
  const dealerCards = state ? state.dealer.slice(0, done ? dealerShown : 2) : [];
  const dealerTotalShown = (() => {
    if (!state) return 0;
    if (!done) return state.dealerTotal;
    if (!revealing) return state.dealerTotal;
    // Açılış sürerken görünen kartların toplamı.
    let hard = 0;
    let aces = 0;
    for (const c of dealerCards) {
      if (!c) continue;
      const rank = Math.floor(c.value / 4);
      const v = rank === 12 ? 11 : rank >= 8 ? 10 : rank + 2;
      if (v === 11) {
        aces++;
        hard += 1;
      } else hard += v;
    }
    return aces > 0 && hard + 10 <= 21 ? hard + 10 : hard;
  })();

  const outcome = done && settled && state?.result ? state.result : null;
  const playerWon = outcome === "win" || outcome === "blackjack";
  const dealerWon = outcome === "lose" || outcome === "bust" || outcome === "dealer_blackjack";
  const canAffordDouble = balance >= (state?.bet ?? Infinity);

  return (
    <div className="space-y-4 lg:grid lg:grid-cols-[minmax(0,1.05fr)_minmax(0,360px)] lg:items-start lg:gap-6 lg:space-y-0">
      <div className="space-y-4">
        {/* --- MASA --- */}
        <div className="gold-hairline relative overflow-hidden rounded-[28px] bg-[radial-gradient(130%_90%_at_50%_0%,#1d6a42_0%,#0d3b25_50%,#061a12_100%)] px-4 py-5">
          <div className="pointer-events-none absolute inset-x-8 top-1/2 -translate-y-1/2 text-center">
            <div className="font-display text-[11px] font-black uppercase tracking-[0.25em] text-[#ffd062]/35">
              Blackjack 6:5 öder
            </div>
            <div className="text-[10px] font-bold uppercase tracking-widest text-white/20">
              krupiye yumuşak 17&apos;de çeker
            </div>
          </div>

          <div className="relative flex min-h-[340px] flex-col justify-between gap-10">
            <Hand
              label="Krupiye"
              cards={dealerCards}
              total={dealerTotalShown}
              hiddenTotal={!done && !!state}
              highlight={outcome ? (dealerWon ? "win" : playerWon ? "lose" : null) : null}
            />
            <Hand
              label={state?.doubled ? "Sen · 2×" : "Sen"}
              cards={state?.player ?? []}
              total={state?.playerTotal ?? 0}
              soft={state?.playerSoft}
              highlight={outcome ? (playerWon ? "win" : dealerWon ? "lose" : null) : null}
            />
          </div>

          {!state ? (
            <div className="absolute inset-0 grid place-items-center">
              <p className="text-sm text-white/55">Bahsini seç ve kartları dağıt</p>
            </div>
          ) : null}
        </div>

        {/* --- SONUÇ --- */}
        <div className="grid min-h-[72px] place-items-center">
          {error ? (
            <p className="rounded-2xl bg-lose/15 px-4 py-2.5 text-sm text-lose">{error}</p>
          ) : outcome && settled ? (
            <div className="text-center">
              <div className="mb-1 text-xs font-black uppercase tracking-widest text-white/60">
                {BJ_RESULT_TEXT[outcome]}
              </div>
              <ResultFlash payout={settled.payout} stake={settled.stake} mult={settled.mult} badges={settled.newBadges} />
            </div>
          ) : revealing ? (
            <p className="animate-pulse text-sm text-muted">krupiye kart açıyor…</p>
          ) : playing ? (
            <p className="text-sm text-muted">Kart çek, dur ya da ikiye katla</p>
          ) : null}
        </div>
      </div>

      <div className="space-y-4 lg:sticky lg:top-20">
        {playing ? (
          <ActionDock>
            <div className="grid grid-cols-2 gap-2">
              <Button onClick={() => act("hit")} disabled={busy} tone="felt" className="!py-4">
                KART ÇEK
              </Button>
              <Button onClick={() => act("stand")} disabled={busy} tone="ruby" className="!py-4">
                DUR
              </Button>
            </div>
            <Button
              onClick={() => act("double")}
              disabled={busy || !state!.canDouble || !canAffordDouble}
              tone="gold"
              className="w-full !py-3"
            >
              {!state!.canDouble
                ? "ikiye katlama yalnız ilk iki kartta"
                : !canAffordDouble
                  ? "katlamaya bakiye yetmiyor"
                  : `İKİYE KATLA · +${coins(state!.bet)}`}
            </Button>
          </ActionDock>
        ) : (
          <>
            <BetControls bet={bet} setBet={setBet} balance={balance} disabled={busy || revealing} />
            <ActionDock>
              <Button
                onClick={deal}
                disabled={busy || revealing || bet > balance}
                tone="gold"
                className="w-full !py-4 !text-lg"
              >
                {bet > balance ? "Bakiye yetersiz" : done ? "YENİ EL ♠️" : "DAĞIT ♠️"}
              </Button>
            </ActionDock>
          </>
        )}

        {history.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {history.map((h, i) => (
              <span
                key={i}
                className={`tabular rounded-lg px-2 py-1 text-[11px] font-black ${
                  h.result === "blackjack"
                    ? "bg-gold/20 text-gold"
                    : h.net > 0
                      ? "bg-win/15 text-win"
                      : h.net === 0
                        ? "bg-white/10 text-white/70"
                        : "bg-white/6 text-white/45"
                }`}
              >
                {h.result === "blackjack" ? "BJ" : h.net > 0 ? `+${coins(h.net)}` : h.net === 0 ? "±0" : "×"}
              </span>
            ))}
          </div>
        ) : null}

        <Card>
          <SectionTitle right="6 deste">Kurallar</SectionTitle>
          <ul className="space-y-1.5 text-xs leading-relaxed text-white/75">
            <li>• Amaç 21&apos;i geçmeden krupiyeden yüksek olmak. Resimli kartlar 10, as 1 ya da 11.</li>
            <li>• İlk iki kartla 21 (as + onluk) <strong className="text-gold">blackjack</strong>: 6:5 öder (100 coin → +120).</li>
            <li>• Normal kazanç 1:1, beraberlikte bahis geri gelir.</li>
            <li>• Krupiye 17&apos;ye kadar çeker, <strong className="text-white">yumuşak 17&apos;de de</strong> çeker.</li>
            <li>• İlk iki kartta <strong className="text-white">ikiye katlayabilirsin</strong>: bahis ikiye çıkar, tek kart gelir.</li>
            <li>• Bölme (split), sigorta ve teslim yok.</li>
          </ul>
          <p className="mt-3 text-[11px] leading-relaxed text-muted">
            Blackjack&apos;te geri dönüş kararlarına bağlı. Kusursuz temel stratejiyle{" "}
            <strong className="text-white/75">%97,5</strong>, sezgiyle oynayınca genelde{" "}
            <strong className="text-white/75">%90–92</strong>. İpucu: krupiye 2–6 gösterirken 13–16&apos;da dur, 7 ve
            üstünü gösterirken 17&apos;ye kadar çek; 11&apos;de ikiye katla.
          </p>
        </Card>

        <div className="flex justify-center">
          <Pill tone="info">deste sunucuda karılır · kapalı kart el bitene kadar gizli</Pill>
        </div>
      </div>
    </div>
  );
}

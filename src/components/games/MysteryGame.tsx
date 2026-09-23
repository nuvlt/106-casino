"use client";

import { useState } from "react";
import { Button, Card, Pill, SectionTitle } from "@/components/ui";
import { ActionDock } from "@/components/games/ActionDock";
import { BetControls } from "@/components/games/BetControls";
import { newKey, post } from "@/hooks/useApi";
import { COIN, MYSTERY_TIERS } from "@/lib/games/config";
import { coins, mult as fmtMult } from "@/lib/format";
import { sfx } from "@/lib/sound";
import { ResultFlash } from "@/components/games/ResultFlash";

interface MysteryResponse {
  payout: number;
  mult: number;
  balance: number;
  result: { tier: string; pick: number; boxes: number[] };
  newBadges: { id: string; title: string; icon: string; reward: number }[];
}

type Tier = "bronze" | "silver" | "gold";

const TIERS: { key: Tier; label: string; body: string; lid: string; max: string }[] = [
  { key: "bronze", label: "Bronz", body: "#7a4a1d", lid: "#c98a3a", max: "5x" },
  { key: "silver", label: "Gümüş", body: "#5b6472", lid: "#c3ccd9", max: "50x" },
  { key: "gold", label: "Altın", body: "#8a6205", lid: "#ffd062", max: "500x" },
];

export function MysteryGame({
  balance,
  onSettled,
  onReload,
}: {
  balance: number;
  onSettled: (b: number) => void;
  onReload: () => Promise<void>;
}) {
  const [bet, setBet] = useState(50 * COIN);
  const [tier, setTier] = useState<Tier>("silver");
  const [opening, setOpening] = useState(false);
  const [result, setResult] = useState<(MysteryResponse & { stake: number }) | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<number[]>([]);

  const style = TIERS.find((t) => t.key === tier)!;

  async function open(pick: number) {
    if (opening || result) return;
    sfx.prime();
    sfx.click();
    setError(null);
    setOpening(true);

    try {
      const res = await post<MysteryResponse>("/api/games/mystery/bet", {
        bet,
        idempotencyKey: newKey("mystery"),
        tier,
        pick,
      });
      setTimeout(() => {
        setResult({ ...res, stake: bet });
        setOpening(false);
        onSettled(res.balance);
        setHistory((h) => [res.mult, ...h].slice(0, 14));
        if (res.payout > bet) sfx.win(res.mult);
        else sfx.lose();
        if (res.newBadges.length > 0) setTimeout(() => sfx.badge(), 450);
        void onReload();
      }, 450);
    } catch (e) {
      setOpening(false);
      setError(e instanceof Error ? e.message : "Bir hata oldu");
    }
  }

  function reset() {
    setResult(null);
    sfx.click();
  }

  return (
    <div className="space-y-4 lg:grid lg:grid-cols-[minmax(0,1.05fr)_minmax(0,360px)] lg:items-start lg:gap-6 lg:space-y-0">
      {/* Geniş ekranda tahta solda kalır, kontroller sağa geçer. */}
      <div className="space-y-4">
      {/* --- KUTULAR --- */}
      <div className="gold-hairline rounded-3xl bg-[radial-gradient(120%_100%_at_50%_0%,#4a0d46_0%,#2a0726_50%,#120410_100%)] p-4">
        <div className="grid grid-cols-3 gap-2.5">
          {Array.from({ length: 9 }, (_, i) => {
            const opened = !!result;
            const mine = result?.result.pick === i;
            const m = result?.result.boxes[i] ?? 0;

            return (
              <button
                key={i}
                onClick={() => open(i)}
                disabled={opening || opened}
                className={`relative grid aspect-square place-items-center overflow-hidden rounded-2xl
                  transition ${opened ? "" : "active:scale-95 hover:scale-[1.03]"}
                  ${mine ? "ring-2 ring-gold shadow-[0_0_20px_rgba(255,201,74,0.65)]" : ""}
                  ${opened && !mine ? "opacity-45" : ""}`}
                style={{ background: opened ? "rgba(0,0,0,0.35)" : "transparent" }}
                aria-label={`${i + 1}. kutu`}
              >
                {opened ? (
                  <div className={mine ? "animate-pop text-center" : "text-center"}>
                    <div
                      className={`font-display tabular text-lg font-black ${
                        m === 0 ? "text-white/30" : m >= 20 ? "text-gold" : "text-win"
                      }`}
                    >
                      {m === 0 ? "boş" : fmtMult(m)}
                    </div>
                    {mine ? (
                      <div className="text-[9px] font-black uppercase tracking-wide text-gold">seçtiğin</div>
                    ) : null}
                  </div>
                ) : (
                  <svg viewBox="0 0 60 60" className="size-full p-1.5 drop-shadow-[0_4px_8px_rgba(0,0,0,0.5)]">
                    <rect x="6" y="20" width="48" height="34" rx="4" fill={style.body} />
                    <rect x="24.5" y="20" width="11" height="34" fill={style.lid} />
                    <rect x="3" y="13" width="54" height="11" rx="3" fill={style.lid} />
                    <rect x="24.5" y="13" width="11" height="11" fill={style.body} opacity="0.45" />
                    <path
                      d="M30 13 C22 2 10 10 30 15 C50 10 38 2 30 13 Z"
                      fill={style.lid}
                      stroke={style.body}
                      strokeWidth="1"
                    />
                  </svg>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* --- SONUÇ --- */}
      <div className="grid min-h-[56px] place-items-center">
        {error ? (
          <p className="rounded-2xl bg-lose/15 px-4 py-2.5 text-sm text-lose">{error}</p>
        ) : result ? (
          <ResultFlash
            payout={result.payout}
            stake={result.stake}
            mult={result.mult}
            badges={result.newBadges}
          />
        ) : opening ? (
          <p className="animate-pulse text-sm text-muted">kutu açılıyor…</p>
        ) : (
          <p className="text-sm text-muted">Bir kutu seç — hangisini seçtiğin şansı değiştirmez</p>
        )}
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
      {/* --- KASA SEVİYESİ --- */}
      <div className="gold-hairline rounded-3xl bg-gradient-to-b from-surface-2/80 to-surface/90 p-3">
        <span className="mb-1.5 block text-[11px] font-black uppercase tracking-widest text-muted">Kasa</span>
        <div className="flex gap-1.5">
          {TIERS.map((t) => (
            <button
              key={t.key}
              disabled={opening || !!result}
              onClick={() => {
                setTier(t.key);
                sfx.click();
              }}
              className={`flex-1 rounded-xl py-2 text-xs font-black transition disabled:opacity-40 ${
                tier === t.key ? "gold-metal text-[#3a2500]" : "bg-white/6 text-white/70 ring-1 ring-white/10"
              }`}
            >
              {t.label}
              <span className="block text-[10px] font-bold opacity-70">{t.max}</span>
            </button>
          ))}
        </div>
      </div>

      <BetControls bet={bet} setBet={setBet} balance={balance} disabled={opening || !!result} />

      {result ? (
        <ActionDock>
          <Button onClick={reset} tone="gold" className="w-full !py-4 !text-lg">
            YENİ KUTULAR
          </Button>
        </ActionDock>
      ) : (
        <p className="text-center text-xs text-muted">Yukarıdan bir kutuya dokun</p>
      )}

      {history.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {history.map((m, i) => (
            <span
              key={i}
              className={`tabular rounded-lg px-2 py-1 text-[11px] font-black ${
                m >= 20 ? "bg-gold/20 text-gold" : m > 0 ? "bg-win/15 text-win" : "bg-white/6 text-white/45"
              }`}
            >
              {fmtMult(m)}
            </span>
          ))}
        </div>
      ) : null}

      <Card>
        <SectionTitle right="RTP %95">{style.label} kasa</SectionTitle>
        <ul className="space-y-1.5">
          {MYSTERY_TIERS[tier].map((t) => (
            <li key={t.mult} className="flex items-center gap-3 text-sm">
              <span className="font-black text-white/85">{t.mult === 0 ? "boş" : `${t.mult / 100}x`}</span>
              <span className="tabular ml-auto text-muted">
                %{(t.weight / 100).toFixed(2).replace(".", ",")}
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-[11px] leading-relaxed text-muted">
          Dokuz kutunun hepsi aynı tablodan bağımsız doldurulur; hangisini seçtiğin beklenen
          getiriyi değiştirmez. Üç kasanın RTP&apos;si de tam %95 — yalnızca oynaklık farklı.
        </p>
      </Card>

      <div className="flex justify-center">
        <Pill tone="info">kutular sunucuda doldurulur</Pill>
      </div>
      </div>
    </div>
  );
}

"use client";

import { useState } from "react";
import { Card, Pill, SectionTitle } from "@/components/ui";
import { coins } from "@/lib/format";
import { post } from "@/hooks/useApi";
import { sfx } from "@/lib/sound";
import type { MeResponse } from "@/hooks/useMe";

interface ClaimResponse {
  missionId: string;
  title: string;
  reward: number;
  balance: number;
}

/** İlerleme sayacının okunabilir hâli — göreve göre birim değişir. */
function progressLabel(m: MeResponse["missions"][number]): string {
  if (m.kind === "WAGER_TOTAL") return `${coins(m.progress)} / ${coins(m.target)}`;
  if (m.kind === "HIT_MULTIPLIER") {
    return `${(m.progress / 10_000).toFixed(2)}x / ${(m.target / 10_000).toFixed(0)}x`;
  }
  return `${m.progress} / ${m.target}`;
}

/**
 * Günlük görevler. Tamamlanan görevin ödülü kendiliğinden yatmaz —
 * oyuncu "Ödülü al" der. Tutarı sunucu bilir; buradan yalnızca hangi
 * görev olduğu gider.
 */
export function Missions({
  missions,
  onClaimed,
}: {
  missions: MeResponse["missions"];
  onClaimed?: (balance: number) => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** Sunucu yenilenene kadar alınmış görevi hemen alınmış göster. */
  const [justClaimed, setJustClaimed] = useState<Set<string>>(new Set());

  if (missions.length === 0) return null;

  const claimable = missions.filter(
    (m) => m.completedAt !== null && m.claimedAt === null && !justClaimed.has(m.id),
  ).length;

  async function claim(id: string) {
    if (busy) return;
    sfx.prime();
    sfx.click();
    setBusy(id);
    setError(null);
    try {
      const res = await post<ClaimResponse>("/api/missions/claim", { missionId: id });
      setJustClaimed((prev) => new Set(prev).add(id));
      sfx.badge();
      onClaimed?.(res.balance);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ödül alınamadı");
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card>
      <SectionTitle right={claimable > 0 ? `${claimable} ödül hazır` : "her gece yenilenir"}>
        Günün Görevleri
      </SectionTitle>

      {error ? (
        <p className="mb-2.5 rounded-2xl bg-lose/15 px-3 py-2 text-xs text-lose">{error}</p>
      ) : null}

      <ul className="space-y-2.5">
        {missions.map((m) => {
          const pct = Math.min(100, Math.round((m.progress / m.target) * 100));
          const done = m.completedAt !== null;
          const claimed = m.claimedAt !== null || justClaimed.has(m.id);
          const ready = done && !claimed;

          return (
            <li
              key={m.id}
              className={`rounded-2xl p-3 ring-1 transition ${
                ready
                  ? "bg-gold/10 ring-gold/45 shadow-[0_0_20px_rgba(255,201,74,0.18)]"
                  : claimed
                    ? "bg-win/8 ring-win/30"
                    : "bg-black/25 ring-white/8"
              }`}
            >
              <div className="mb-1.5 flex items-center gap-2">
                <span className="text-sm font-black text-white">{m.title}</span>
                {claimed ? <Pill tone="win">alındı ✓</Pill> : null}
                <span className="tabular ml-auto text-xs font-black text-gold">
                  +{coins(m.reward)}
                </span>
              </div>
              <p className="mb-2 text-[11px] text-muted">{m.subtitle}</p>

              <div className="h-2.5 overflow-hidden rounded-full bg-black/55 ring-1 ring-white/8">
                <div
                  className={`relative h-full rounded-full transition-all duration-700 ${
                    done ? "bg-gradient-to-r from-[#1f8b4c] to-[#2fe08a]" : "gold-metal"
                  }`}
                  style={{ width: `${pct === 0 ? 0 : Math.max(pct, 4)}%` }}
                />
              </div>

              <div className="mt-1.5 flex items-center gap-2">
                <span className="tabular text-[10px] text-muted">{progressLabel(m)}</span>

                {ready ? (
                  <button
                    onClick={() => void claim(m.id)}
                    disabled={busy !== null}
                    className="gold-metal font-display ml-auto animate-pulse-glow rounded-xl px-3.5 py-1.5
                               text-[11px] font-black uppercase tracking-wide text-[#3a2500]
                               shadow-[0_3px_0_#7a5804] transition active:translate-y-0.5
                               active:shadow-none disabled:opacity-50"
                  >
                    {busy === m.id ? "alınıyor…" : `Ödülü al +${coins(m.reward)}`}
                  </button>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

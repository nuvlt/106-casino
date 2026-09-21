"use client";

import { Card, Pill, SectionTitle } from "@/components/ui";
import { coins } from "@/lib/format";
import type { MeResponse } from "@/hooks/useMe";

/** Günlük görevler — altın dolan ilerleme çubuklarıyla. */
export function Missions({ missions }: { missions: MeResponse["missions"] }) {
  if (missions.length === 0) return null;

  return (
    <Card>
      <SectionTitle right="her gece yenilenir">Günün Görevleri</SectionTitle>
      <ul className="space-y-2.5">
        {missions.map((m) => {
          const pct = Math.min(100, Math.round((m.progress / m.target) * 100));
          const done = m.completedAt !== null;
          return (
            <li
              key={m.id}
              className={`rounded-2xl p-3 ring-1 ${
                done ? "bg-win/8 ring-win/30" : "bg-black/25 ring-white/8"
              }`}
            >
              <div className="mb-1.5 flex items-center gap-2">
                <span className="text-sm font-black text-white">{m.title}</span>
                {done ? <Pill tone="win">tamam ✓</Pill> : null}
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

              <div className="tabular mt-1 text-right text-[10px] text-muted">
                {m.kind === "WAGER_TOTAL"
                  ? `${coins(m.progress)} / ${coins(m.target)}`
                  : m.kind === "HIT_MULTIPLIER"
                    ? `${(m.progress / 10_000).toFixed(2)}x / ${(m.target / 10_000).toFixed(0)}x`
                    : `${m.progress} / ${m.target}`}
              </div>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

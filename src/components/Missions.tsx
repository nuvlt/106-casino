"use client";

import { Card, Pill, SectionTitle } from "@/components/ui";
import { coins } from "@/lib/format";
import type { MeResponse } from "@/hooks/useMe";

/** Günlük görevler — ilerleme çubuklarıyla. */
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
            <li key={m.id} className="rounded-2xl bg-white/4 p-3">
              <div className="mb-1.5 flex items-center gap-2">
                <span className="text-sm font-bold text-white/90">{m.title}</span>
                {done ? <Pill tone="win">tamam ✓</Pill> : null}
                <span className="ml-auto text-xs font-bold text-gold">
                  +{coins(m.reward)}
                </span>
              </div>
              <p className="mb-2 text-[11px] text-muted">{m.subtitle}</p>
              <div className="h-2 overflow-hidden rounded-full bg-black/35">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${
                    done
                      ? "bg-win"
                      : "bg-gradient-to-r from-gold-deep to-gold"
                  }`}
                  style={{ width: `${pct}%` }}
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

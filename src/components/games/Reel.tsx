"use client";

import { useMemo, type ReactNode } from "react";

/**
 * Tek slot makarası (dikey). Dönerken sembol şeridi bulanık akar; durunca
 * sunucunun verdiği semboller "oturma" animasyonuyla yerine gelir.
 * Görüntü yalnız sonucu oynatır — sonuç her zaman sunucuda üretilir.
 */
export function Reel<T extends string>({
  symbols,
  spinning,
  pool,
  render,
  highlight,
  cellClass,
  seed,
}: {
  /** Durunca görünecek semboller, yukarıdan aşağı. */
  symbols: readonly T[];
  spinning: boolean;
  /** Dönerken akacak semboller. */
  pool: readonly T[];
  render: (s: T) => ReactNode;
  highlight?: readonly boolean[];
  cellClass: string;
  /** Her makaranın şeridi farklı görünsün diye. */
  seed: number;
}) {
  // Dönme şeridi: makaraya özgü, render'lar arasında sabit bir karışım.
  const strip = useMemo(() => {
    const out: T[] = [];
    let x = (seed * 9301 + 49297) % 233280;
    for (let i = 0; i < 10; i++) {
      x = (x * 9301 + 49297) % 233280;
      out.push(pool[x % pool.length]!);
    }
    return [...out, ...out];
  }, [pool, seed]);

  const rows = symbols.length;

  return (
    <div className="relative overflow-hidden" style={{ height: `calc(var(--cell) * ${rows})` }}>
      {spinning ? (
        <div className="animate-reel blur-[1.2px]" style={{ willChange: "transform" }}>
          {strip.map((s, i) => (
            <div key={i} className={cellClass} style={{ height: "var(--cell)" }}>
              {render(s)}
            </div>
          ))}
        </div>
      ) : (
        <div className="animate-reel-stop">
          {symbols.map((s, i) => (
            <div
              key={i}
              className={`${cellClass} ${highlight?.[i] ? "animate-win-cell relative z-10" : ""}`}
              style={{ height: "var(--cell)" }}
            >
              {render(s)}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

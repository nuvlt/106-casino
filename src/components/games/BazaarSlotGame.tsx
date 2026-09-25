"use client";

import { useEffect, useRef, useState } from "react";
import { Button, Card, Pill, SectionTitle } from "@/components/ui";
import { ActionDock } from "@/components/games/ActionDock";
import { BetControls } from "@/components/games/BetControls";
import { Reel } from "@/components/games/Reel";
import { ResultFlash } from "@/components/games/ResultFlash";
import { newKey, post } from "@/hooks/useApi";
import {
  BAZAAR_FREE_SPINS,
  BAZAAR_FS_MULT,
  BAZAAR_ICON,
  BAZAAR_LINES,
  BAZAAR_NAME,
  BAZAAR_PAYING,
  BAZAAR_PAYS,
  BAZAAR_SCATTER_PAYS,
  BAZAAR_SYMBOLS,
  COIN,
  type BazaarSymbol,
} from "@/lib/games/config";
import type { BazaarSpin } from "@/lib/games/engine";
import { mult as fmtMult } from "@/lib/format";
import { sfx } from "@/lib/sound";

interface SpinResponse {
  payout: number;
  mult: number;
  balance: number;
  result: { base: BazaarSpin; free: BazaarSpin[]; capped: boolean };
  newBadges: { id: string; title: string; icon: string; reward: number }[];
}

const STOP_GAP_MS = 260;
const MIN_SPIN_MS = 600;
/** Bedava dönüşlerin her biri ekranda bu kadar kalır. */
const FREE_SPIN_MS = 1100;

const START: BazaarSymbol[][] = [
  ["L2", "H1", "M1"],
  ["M2", "H1", "L1"],
  ["S", "H1", "L2"],
  ["L1", "W", "M1"],
  ["M2", "H2", "L2"],
];

/** Kazanan çizgilerin hücreleri: [makara][satır]. */
function winCells(spin: BazaarSpin | null): boolean[][] {
  const out = [0, 1, 2, 3, 4].map(() => [false, false, false]);
  if (!spin) return out;
  for (const w of spin.lines) {
    const rows = BAZAAR_LINES[w.line]!;
    for (let r = 0; r < w.count; r++) out[r]![rows[r]!] = true;
  }
  if (spin.scatters >= 3) spin.grid.forEach((col, r) => col.forEach((s, row) => s === "S" && (out[r]![row] = true)));
  return out;
}

function Cell({ s }: { s: BazaarSymbol }) {
  const special = s === "W" || s === "S";
  return (
    <span
      className={`grid size-[88%] place-items-center rounded-xl text-[26px] leading-none sm:text-[30px] ${
        special
          ? "bg-[radial-gradient(circle,#ffe89a_0%,#b5830e_75%)] shadow-[0_0_10px_rgba(255,208,98,0.6)]"
          : "bg-[radial-gradient(circle,#5a1f4a_0%,#2a0a26_80%)]"
      }`}
    >
      {BAZAAR_ICON[s]}
    </span>
  );
}

export function BazaarSlotGame({
  balance,
  onSettled,
  onReload,
}: {
  balance: number;
  onSettled: (b: number) => void;
  onReload: () => Promise<void>;
}) {
  const [bet, setBet] = useState(50 * COIN);
  const [grid, setGrid] = useState<BazaarSymbol[][]>(START);
  const [shown, setShown] = useState<BazaarSpin | null>(null);
  const [stopped, setStopped] = useState(5);
  const [phase, setPhase] = useState<"idle" | "spinning" | "free" | "done">("idle");
  /** Bedava dönüş oynatımı: kaçıncıdayız, şimdiye kadarki toplam (bahsin katı). */
  const [fs, setFs] = useState<{ index: number; count: number; total: number } | null>(null);
  const [result, setResult] = useState<(SpinResponse & { stake: number }) | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<number[]>([]);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const pending = useRef<(SpinResponse & { stake: number }) | null>(null);

  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  const later = (fn: () => void, ms: number) => timers.current.push(setTimeout(fn, ms));

  const busy = phase === "spinning" || phase === "free";

  function finish(res: SpinResponse & { stake: number }) {
    timers.current.forEach(clearTimeout);
    timers.current = [];
    pending.current = null;
    const last = res.result.free.at(-1) ?? res.result.base;
    setGrid(last.grid);
    setShown(last);
    setStopped(5);
    setPhase("done");
    setResult(res);
    onSettled(res.balance);
    setHistory((h) => [res.mult, ...h].slice(0, 14));
    if (res.payout > res.stake) sfx.win(res.mult);
    else sfx.lose();
    if (res.newBadges.length > 0) setTimeout(() => sfx.badge(), 450);
    void onReload();
  }

  function playFree(res: SpinResponse & { stake: number }) {
    const free = res.result.free;
    setPhase("free");
    let total = res.result.base.win;
    free.forEach((spin, i) => {
      later(() => {
        setShown(null);
        setStopped(0);
      }, i * FREE_SPIN_MS);
      later(() => {
        setGrid(spin.grid);
        setStopped(5);
        setShown(spin);
        total += spin.win;
        setFs({ index: i + 1, count: free.length, total });
        if (spin.win > 0) sfx.cashout(spin.win / 100);
        else sfx.tick();
      }, i * FREE_SPIN_MS + 380);
    });
    later(() => finish(res), free.length * FREE_SPIN_MS + 500);
  }

  async function spin() {
    if (busy) return;
    sfx.prime();
    sfx.click();
    setError(null);
    setResult(null);
    setShown(null);
    setFs(null);
    setPhase("spinning");
    setStopped(0);
    const started = performance.now();
    try {
      const res = await post<SpinResponse>("/api/games/bazaar/bet", { bet, idempotencyKey: newKey("bazaar") });
      const full = { ...res, stake: bet };
      pending.current = full;
      const wait = Math.max(0, MIN_SPIN_MS - (performance.now() - started));
      setGrid(res.result.base.grid);
      for (let i = 1; i <= 5; i++) {
        later(() => {
          setStopped(i);
          sfx.tick();
          if (i === 5) {
            setShown(res.result.base);
            if (res.result.free.length > 0) {
              sfx.badge();
              setFs({ index: 0, count: res.result.free.length, total: res.result.base.win });
              later(() => playFree(full), 1400);
            } else {
              finish(full);
            }
          }
        }, wait + (i - 1) * STOP_GAP_MS);
      }
    } catch (e) {
      setStopped(5);
      setPhase("idle");
      setError(e instanceof Error ? e.message : "Bir hata oldu");
    }
  }

  const cells = winCells(stopped === 5 ? shown : null);
  const lineWins = stopped === 5 && shown ? shown.lines : [];
  // Gösterilen dönüş bedava dönüşlerden biri mi? (Ödemesi ×2 yazılır.)
  const freeList = (result ?? pending.current)?.result.free ?? [];
  const inFree = !!shown && freeList.includes(shown);

  return (
    <div className="space-y-4 lg:grid lg:grid-cols-[minmax(0,1.05fr)_minmax(0,360px)] lg:items-start lg:gap-6 lg:space-y-0">
      <div className="space-y-4">
        {/* --- ÇARŞI KAPISI --- */}
        <div className="mx-auto w-full max-w-[460px]">
          <div className="relative rounded-t-[140px] rounded-b-[26px] bg-gradient-to-b from-[#fff0bf] via-[#d9a13a] to-[#8d6205] p-[7px] shadow-[0_22px_60px_rgba(0,0,0,0.65)]">
            <div className="rounded-t-[134px] rounded-b-[20px] bg-[radial-gradient(120%_80%_at_50%_0%,#7a1f5c_0%,#3a0f2e_55%,#1a0616_100%)] px-3 pb-4 pt-8">
              <div className="mb-3 text-center">
                <div className="gold-text font-display text-2xl font-black tracking-wide">Kapalıçarşı</div>
                <div className="text-[10px] font-bold uppercase tracking-[0.3em] text-[#ffd062]/60">
                  {phase === "free" || (fs && phase !== "done")
                    ? `bedava dönüş ${fs?.index ?? 0}/${fs?.count ?? BAZAAR_FREE_SPINS} · kazançlar ×${BAZAAR_FS_MULT}`
                    : "5 çizgi · 🧿 joker · 🗝️ bedava dönüş"}
                </div>
              </div>

              <div
                className="grid grid-cols-5 gap-1.5 rounded-2xl bg-black/40 p-1.5 shadow-[inset_0_4px_16px_rgba(0,0,0,0.8)]"
                style={{ ["--cell" as string]: "clamp(52px, 15vw, 76px)" }}
              >
                {grid.map((col, r) => (
                  <div key={r} className="overflow-hidden rounded-xl bg-[#14040f]">
                    <Reel
                      symbols={col}
                      spinning={r >= stopped}
                      pool={BAZAAR_SYMBOLS}
                      render={(s) => <Cell s={s} />}
                      highlight={cells[r]}
                      cellClass="grid place-items-center rounded-xl"
                      seed={r + 11}
                    />
                  </div>
                ))}
              </div>

              {/* bu dönüşün kazanan çizgileri */}
              <div className="mt-3 flex min-h-[26px] flex-wrap justify-center gap-1.5">
                {lineWins.map((w, i) => (
                  <span key={i} className="animate-pop rounded-full bg-gold/15 px-2.5 py-1 text-[11px] font-black text-gold ring-1 ring-gold/30">
                    {BAZAAR_ICON[w.sym]}×{w.count} · {fmtMult((w.pay * (inFree ? BAZAAR_FS_MULT : 1)) / 100)}
                  </span>
                ))}
                {shown && stopped === 5 && shown.scatters >= 3 ? (
                  <span className="animate-pop rounded-full bg-[#ffe89a]/20 px-2.5 py-1 text-[11px] font-black text-[#ffe89a] ring-1 ring-[#ffe89a]/40">
                    🗝️×{shown.scatters}
                    {inFree ? ` · +${BAZAAR_FREE_SPINS} dönüş` : ` · ${BAZAAR_FREE_SPINS} bedava dönüş!`}
                  </span>
                ) : null}
              </div>
            </div>
          </div>
        </div>

        {/* --- SONUÇ --- */}
        <div className="grid min-h-[72px] place-items-center">
          {error ? (
            <p className="rounded-2xl bg-lose/15 px-4 py-2.5 text-sm text-lose">{error}</p>
          ) : phase === "done" && result ? (
            <div className="text-center">
              {result.result.free.length > 0 ? (
                <div className="mb-1 text-xs font-black uppercase tracking-widest text-gold">
                  {result.result.free.length} bedava dönüş oynandı
                  {result.result.capped ? " · 5.000x tavan" : ""}
                </div>
              ) : null}
              <ResultFlash payout={result.payout} stake={result.stake} mult={result.mult} badges={result.newBadges} />
            </div>
          ) : fs ? (
            <div className="text-center">
              <div className="font-display text-xl font-black text-[#ffe89a]">🗝️ Kapılar açıldı!</div>
              <div className="tabular text-sm font-bold text-gold">şimdiye kadar {fmtMult(fs.total / 100)}</div>
            </div>
          ) : phase === "spinning" ? (
            <p className="animate-pulse text-sm text-muted">makaralar dönüyor…</p>
          ) : (
            <p className="text-sm text-muted">Bahsini seç ve çevir</p>
          )}
        </div>
      </div>

      <div className="space-y-4 lg:sticky lg:top-20">
        <BetControls bet={bet} setBet={setBet} balance={balance} disabled={busy} />

        <ActionDock>
          {phase === "free" && pending.current ? (
            <Button onClick={() => pending.current && finish(pending.current)} tone="ghost" className="w-full !py-3.5">
              HIZLI BİTİR ⏩
            </Button>
          ) : (
            <Button onClick={spin} disabled={busy || bet > balance} tone="gold" className="w-full !py-4 !text-lg">
              {busy ? "Dönüyor…" : bet > balance ? "Bakiye yetersiz" : "ÇEVİR 🧿"}
            </Button>
          )}
        </ActionDock>

        {history.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {history.map((m, i) => (
              <span
                key={i}
                className={`tabular rounded-lg px-2 py-1 text-[11px] font-black ${
                  m >= 10 ? "bg-gold/20 text-gold" : m > 0 ? "bg-win/15 text-win" : "bg-white/6 text-white/45"
                }`}
              >
                {m > 0 ? fmtMult(m) : "×"}
              </span>
            ))}
          </div>
        ) : null}

        <Card>
          <SectionTitle right="RTP %95">Ödeme Tablosu</SectionTitle>
          <div className="mb-2 grid grid-cols-[1fr_repeat(3,48px)] gap-y-1 text-[11px] text-muted">
            <span />
            <span className="text-center">3</span>
            <span className="text-center">4</span>
            <span className="text-center">5</span>
          </div>
          <ul className="space-y-1">
            {BAZAAR_PAYING.map((s) => {
              const p = BAZAAR_PAYS[s as keyof typeof BAZAAR_PAYS];
              return (
                <li key={s} className="grid grid-cols-[1fr_repeat(3,48px)] items-center text-sm">
                  <span className="flex items-center gap-2 text-white/85">
                    <span className="text-lg">{BAZAAR_ICON[s]}</span>
                    <span className="text-xs font-bold">{BAZAAR_NAME[s]}</span>
                  </span>
                  {p.map((v, i) => (
                    <span key={i} className="tabular text-center font-display text-xs font-black text-gold">
                      {fmtMult(v / 100)}
                    </span>
                  ))}
                </li>
              );
            })}
            <li className="grid grid-cols-[1fr_repeat(3,48px)] items-center border-t border-white/8 pt-1.5 text-sm">
              <span className="flex items-center gap-2 text-white/85">
                <span className="text-lg">🗝️</span>
                <span className="text-xs font-bold">Anahtar (her yerde)</span>
              </span>
              {BAZAAR_SCATTER_PAYS.map((v, i) => (
                <span key={i} className="tabular text-center font-display text-xs font-black text-[#ffe89a]">
                  {fmtMult(v / 100)}
                </span>
              ))}
            </li>
          </ul>
          <p className="mt-3 text-[11px] leading-relaxed text-muted">
            Kazançlar toplam bahsin katıdır; en küçüğü 1,5x. 5 çizgi soldan sağa öder (düz üç satır ve iki V).
            🧿 Nazar (2–5. makara) anahtar dışında her şeyin yerine geçer. 3+ 🗝️ →{" "}
            <strong className="text-white/80">{BAZAAR_FREE_SPINS} bedava dönüş, kazançlar ×{BAZAAR_FS_MULT}</strong>;
            bedava dönüşte yine 3+ gelirse +{BAZAAR_FREE_SPINS} (en fazla 50). Ortalama ~150 çevirmede bir tetiklenir.
          </p>
        </Card>

        <div className="flex justify-center">
          <Pill tone="info">bedava dönüşler dahil sonuç tek seferde sunucuda</Pill>
        </div>
      </div>
    </div>
  );
}

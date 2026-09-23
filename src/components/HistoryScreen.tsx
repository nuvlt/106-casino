"use client";

import { useCallback, useEffect, useState } from "react";
import { BalanceBar } from "@/components/BalanceBar";
import { Card, SectionTitle, Skeleton } from "@/components/ui";
import { useMe } from "@/hooks/useMe";
import { GAMES, GAME_BY_CODE } from "@/lib/catalog";
import { coins, mult as fmtMult } from "@/lib/format";
import { outcomeOf } from "@/lib/outcome";
import { roundDetail } from "@/lib/round-detail";

interface Round {
  id: string;
  game: string;
  state: "OPEN" | "SETTLED" | "VOIDED";
  bet: number;
  payout: number;
  mult: number;
  result: unknown;
  nonce: number;
  createdAt: string;
}

interface Summary {
  total: { rounds: number; wagered: number; won: number };
  today: { rounds: number; wagered: number };
}

interface HistoryResponse {
  rounds: Round[];
  nextCursor: string | null;
  summary: Summary | null;
}

/** Oyun kodları, katalogdaki sırayla — filtre çubuğu için. */
const CODE_BY_SLUG = Object.fromEntries(
  Object.entries(GAME_BY_CODE).map(([code, meta]) => [meta.slug, code]),
);
const FILTERS = GAMES.map((g) => ({ code: CODE_BY_SLUG[g.slug]!, meta: g }));

const TZ = "Europe/Istanbul";
const dayKey = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, dateStyle: "short" });
const dayLabelFmt = new Intl.DateTimeFormat("tr-TR", {
  timeZone: TZ,
  day: "numeric",
  month: "long",
  weekday: "long",
});
const timeFmt = new Intl.DateTimeFormat("tr-TR", { timeZone: TZ, hour: "2-digit", minute: "2-digit" });

function dayLabel(iso: string): string {
  const key = dayKey.format(new Date(iso));
  const today = dayKey.format(new Date());
  const yesterday = dayKey.format(new Date(Date.now() - 86_400_000));
  if (key === today) return "Bugün";
  if (key === yesterday) return "Dün";
  return dayLabelFmt.format(new Date(iso));
}

export function HistoryScreen() {
  const me = useMe();
  const [game, setGame] = useState<string | null>(null);
  const [rounds, setRounds] = useState<Round[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchPage = useCallback(
    async (after: string | null) => {
      const qs = new URLSearchParams();
      if (game) qs.set("game", game);
      if (after) qs.set("cursor", after);
      const res = await fetch(`/api/history?${qs}`, { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? "Geçmiş yüklenemedi");
      return json as HistoryResponse;
    },
    [game],
  );

  // Filtre değişince baştan yükle.
  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);
    fetchPage(null)
      .then((page) => {
        if (!alive) return;
        setRounds(page.rounds);
        setCursor(page.nextCursor);
        if (page.summary) setSummary(page.summary);
      })
      .catch((e: Error) => alive && setError(e.message))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [fetchPage]);

  async function loadMore() {
    if (!cursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const page = await fetchPage(cursor);
      setRounds((prev) => [...prev, ...page.rounds]);
      setCursor(page.nextCursor);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Geçmiş yüklenemedi");
    } finally {
      setLoadingMore(false);
    }
  }

  // Günlere göre grupla (Türkiye saatiyle).
  const groups: { label: string; items: Round[] }[] = [];
  for (const r of rounds) {
    const label = dayLabel(r.createdAt);
    const last = groups.at(-1);
    if (last && last.label === label) last.items.push(r);
    else groups.push({ label, items: [r] });
  }

  return (
    <main className="mx-auto w-full max-w-lg px-4 pb-16 lg:max-w-4xl lg:px-6">
      <BalanceBar balance={me.data?.wallet.balance} back title="Oyun Geçmişim" user={me.data?.user} />

      <div className="space-y-4">
        {/* ---- Özet ---- */}
        {summary ? (
          <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
            <Stat label="Bugün oynanan" value={`${summary.today.rounds} tur`} />
            <Stat label="Toplam tur" value={String(summary.total.rounds)} />
            <Stat label="Toplam yatırılan" value={coins(summary.total.wagered)} />
            <Stat label="Toplam geri gelen" value={coins(summary.total.won)} gold />
          </div>
        ) : loading ? (
          <Skeleton className="h-20" />
        ) : null}

        {/* ---- Oyun filtresi ---- */}
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 lg:mx-0 lg:flex-wrap lg:px-0">
          <FilterChip active={game === null} onClick={() => setGame(null)}>
            Tümü
          </FilterChip>
          {FILTERS.map((f) => (
            <FilterChip key={f.code} active={game === f.code} onClick={() => setGame(f.code)}>
              <span className="mr-1">{f.meta.emoji}</span>
              {f.meta.title}
            </FilterChip>
          ))}
        </div>

        {/* ---- Liste ---- */}
        {error ? (
          <Card>
            <p className="text-sm text-lose">{error}</p>
          </Card>
        ) : loading ? (
          <div className="space-y-2">
            <Skeleton className="h-16" />
            <Skeleton className="h-16" />
            <Skeleton className="h-16" />
          </div>
        ) : rounds.length === 0 ? (
          <Card>
            <p className="py-6 text-center text-sm text-muted">
              {game ? "Bu oyunda henüz turun yok." : "Henüz hiç oynamadın — ilk turun burada görünecek."}
            </p>
          </Card>
        ) : (
          <div className="space-y-4">
            {groups.map((g, i) => (
              <Card key={g.label}>
                {/* Son grup yarım yüklenmiş olabilir; sayıyı ancak tamsa yaz. */}
                <SectionTitle right={i === groups.length - 1 && cursor ? undefined : `${g.items.length} tur`}>
                  {g.label}
                </SectionTitle>
                <ul className="divide-y divide-white/6">
                  {g.items.map((r) => (
                    <HistoryRow key={r.id} round={r} />
                  ))}
                </ul>
              </Card>
            ))}

            {cursor ? (
              <button
                type="button"
                onClick={loadMore}
                disabled={loadingMore}
                className="block w-full rounded-2xl bg-white/6 py-3 text-center text-xs font-black text-white/75
                           ring-1 ring-white/10 transition hover:bg-white/12 disabled:opacity-60"
              >
                {loadingMore ? "Yükleniyor…" : "Daha eski turlar"}
              </button>
            ) : (
              <p className="text-center text-[11px] text-muted">Geçmişin burada başlıyor.</p>
            )}
          </div>
        )}

      </div>
    </main>
  );
}

function HistoryRow({ round: r }: { round: Round }) {
  const meta = GAME_BY_CODE[r.game];
  const detail = roundDetail(r.game, r.result);

  let right: React.ReactNode;
  let sub: string;
  if (r.state === "OPEN") {
    right = <span className="text-xs font-black text-gold">devam ediyor</span>;
    sub = `bahis ${coins(r.bet)}`;
  } else if (r.state === "VOIDED") {
    right = <span className="text-xs font-black text-white/60">iade edildi</span>;
    sub = `bahis ${coins(r.bet)}`;
  } else {
    const o = outcomeOf(r.payout, r.bet, r.mult);
    // Kayıpta tutar yazılmıyor (oyun ekranlarıyla aynı kural).
    right = (
      <span className={`tabular font-display text-sm font-black ${o.tone}`}>
        {o.kind === "loss" || o.kind === "partial" ? "kaybettin" : o.headline}
      </span>
    );
    sub = `${fmtMult(r.mult)} · bahis ${coins(r.bet)}`;
  }

  return (
    <li className="flex items-center gap-3 py-2.5">
      <span
        className="grid size-10 shrink-0 place-items-center rounded-2xl text-lg ring-1 ring-white/10"
        style={{ background: `${meta?.accent ?? "#888"}22` }}
        aria-hidden
      >
        {meta?.emoji ?? "🎲"}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className="truncate text-sm font-black text-white">{meta?.title ?? r.game}</span>
          <span className="tabular shrink-0 text-[11px] text-muted">{timeFmt.format(new Date(r.createdAt))}</span>
        </div>
        {detail ? <p className="truncate text-[11px] text-white/55">{detail}</p> : null}
      </div>
      <div className="shrink-0 text-right">
        {right}
        <div className="tabular text-[10px] text-muted">{sub}</div>
      </div>
    </li>
  );
}

function Stat({ label, value, gold }: { label: string; value: string; gold?: boolean }) {
  return (
    <div className="rounded-2xl bg-white/5 px-3 py-2.5 ring-1 ring-white/8">
      <div className="text-[10px] font-black uppercase tracking-wide text-muted">{label}</div>
      <div className={`tabular font-display text-lg font-black ${gold ? "text-gold" : "text-white"}`}>
        {value}
      </div>
    </div>
  );
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`shrink-0 whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-black ring-1 transition ${
        active
          ? "bg-gold/20 text-gold ring-gold/50"
          : "bg-white/5 text-white/70 ring-white/10 hover:bg-white/10"
      }`}
    >
      {children}
    </button>
  );
}

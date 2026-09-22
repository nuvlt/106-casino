"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Card, Pill, SectionTitle, Skeleton } from "@/components/ui";
import { useApi } from "@/hooks/useApi";
import { GAME_BY_CODE } from "@/lib/catalog";
import { coins, coinsShort, multX4 as fmtMultX4, shortName, timeAgo } from "@/lib/format";
import { RTP_BPS } from "@/lib/games/config";

interface Overview {
  day: string;
  players: number;
  openRounds: number;
  allTime: { rounds: number; wagered: number; paid: number };
  today: { rounds: number; wagered: number; paid: number; players: number };
  perGame: { game: string; rounds: number; wagered: number; paid: number }[];
  byType: { type: string; total: number; n: number }[];
  integrity: { ledgerTotal: number; balanceTotal: number; ok: boolean };
}

interface Entry {
  id: string;
  userId: string;
  userName: string | null;
  userEmail: string;
  type: string;
  amount: number;
  balanceAfter: number;
  note: string | null;
  createdAt: string;
  roundId: string | null;
  game: string | null;
  multX4: number | null;
}

interface Player {
  id: string;
  name: string | null;
  email: string;
  role: string;
  balance: number;
  suspendedAt: string | null;
  rounds: number;
  wagered: number;
  peak: number;
}

const TYPE_LABEL: Record<string, string> = {
  DAILY_RESET: "günlük sıfırlama",
  STREAK_BONUS: "seri bonusu",
  MISSION_REWARD: "görev ödülü",
  BADGE_REWARD: "rozet ödülü",
  BET: "bahis",
  PAYOUT: "ödeme",
  REFUND: "iade",
  ADMIN_ADJUST: "yönetici düzeltmesi",
};

/** Gerçekleşen RTP — hedeften sapma varsa kırmızıya döner. */
function rtpOf(wagered: number, paid: number): { pct: number; off: boolean } | null {
  if (wagered === 0) return null;
  const pct = (paid / wagered) * 100;
  // Küçük örneklemde sapma normaldir; uyarı yalnızca 2.000 turdan
  // sonra ve 3 puandan fazla sapmada anlamlı olur (aşağıda kontrol).
  return { pct, off: Math.abs(pct - RTP_BPS / 100) > 3 };
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-2xl bg-black/30 p-3 ring-1 ring-white/8">
      <div className="text-[10px] font-black uppercase tracking-wide text-muted">{label}</div>
      <div className="tabular font-display mt-0.5 text-xl font-black text-gold">{value}</div>
      {hint ? <div className="text-[10px] text-muted">{hint}</div> : null}
    </div>
  );
}

interface Health {
  region: string;
  instanceAgeSec: number;
  dbMs: number;
  redisMs: number | null;
}

const REGION_CITY: Record<string, string> = {
  fra1: "Frankfurt",
  cdg1: "Paris",
  lhr1: "Londra",
  dub1: "Dublin",
  arn1: "Stockholm",
  iad1: "Washington",
  cle1: "Cleveland",
  pdx1: "Portland",
  sfo1: "San Francisco",
  sin1: "Singapur",
};

/**
 * Sunucu fonksiyonu ile veritabanı arasındaki gecikme. Bir tur sunucuda
 * yaklaşık on gidiş-dönüş yapar; buradaki sayı büyükse (ör. 80 ms)
 * oyunlar da o oranda yavaşlar. Çözüm: Vercel ile Railway'i aynı bölgeye
 * almak (bkz. README → "Hız").
 */
function SystemCard() {
  const health = useApi<Health>("/api/health");
  const h = health.data;
  const tone = (ms: number | null | undefined) =>
    ms == null ? "text-muted" : ms <= 12 ? "text-win" : ms <= 40 ? "text-gold" : "text-lose";

  return (
    <Card>
      <SectionTitle
        right={
          <button
            type="button"
            onClick={() => void health.reload()}
            className="text-[11px] font-black text-white/60 hover:text-white"
          >
            yeniden ölç
          </button>
        }
      >
        Sistem
      </SectionTitle>
      {h ? (
        <>
          <div className="grid grid-cols-3 gap-2">
            <div className="rounded-2xl bg-black/30 p-3 ring-1 ring-white/8">
              <div className="text-[10px] font-black uppercase tracking-wide text-muted">Sunucu</div>
              <div className="font-display mt-0.5 text-base font-black text-white">
                {REGION_CITY[h.region] ?? h.region}
              </div>
              <div className="text-[10px] text-muted">{h.region}</div>
            </div>
            <div className="rounded-2xl bg-black/30 p-3 ring-1 ring-white/8">
              <div className="text-[10px] font-black uppercase tracking-wide text-muted">Veritabanı</div>
              <div className={`tabular font-display mt-0.5 text-xl font-black ${tone(h.dbMs)}`}>
                {h.dbMs} ms
              </div>
              <div className="text-[10px] text-muted">gidiş-dönüş</div>
            </div>
            <div className="rounded-2xl bg-black/30 p-3 ring-1 ring-white/8">
              <div className="text-[10px] font-black uppercase tracking-wide text-muted">Redis</div>
              <div className={`tabular font-display mt-0.5 text-xl font-black ${tone(h.redisMs)}`}>
                {h.redisMs == null ? "—" : `${h.redisMs} ms`}
              </div>
              <div className="text-[10px] text-muted">{h.redisMs == null ? "ulaşılamadı" : "gidiş-dönüş"}</div>
            </div>
          </div>
          <p className="mt-2 text-[10px] leading-relaxed text-muted">
            {h.dbMs <= 12
              ? "Sunucu ile veritabanı aynı bölgede — oyunlar hızlı çalışır."
              : "Sunucu ile veritabanı farklı bölgelerde görünüyor. Bir tur ~10 gidiş-dönüş yaptığı için oyunlar bu sayının yaklaşık 10 katı kadar gecikir."}
          </p>
        </>
      ) : health.error ? (
        <p className="text-sm text-lose">{health.error}</p>
      ) : (
        <Skeleton className="h-20" />
      )}
    </Card>
  );
}

export function AdminScreen() {
  const overview = useApi<Overview>("/api/admin/overview", { refreshMs: 30_000 });
  const players = useApi<{ players: Player[] }>("/api/admin/players");

  const [userId, setUserId] = useState("");
  const [type, setType] = useState("");
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [nextBefore, setNextBefore] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);

  async function loadLedger(before?: string) {
    const qs = new URLSearchParams();
    if (userId) qs.set("userId", userId);
    if (type) qs.set("type", type);
    if (before) qs.set("before", before);
    const res = await fetch(`/api/admin/ledger?${qs}`);
    const json = (await res.json()) as { entries: Entry[]; nextBefore: string | null };
    setEntries((prev) => (before && prev ? [...prev, ...json.entries] : json.entries));
    setNextBefore(json.nextBefore);
  }

  // Filtre değişince baştan yükle.
  useEffect(() => {
    setEntries(null);
    void loadLedger();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, type]);

  const o = overview.data;
  const allRtp = o ? rtpOf(o.allTime.wagered, o.allTime.paid) : null;

  return (
    <main className="mx-auto w-full max-w-lg px-4 pb-16 lg:max-w-6xl lg:px-6">
      <header className="sticky top-0 z-30 -mx-4 mb-4 border-b border-gold/20 bg-[linear-gradient(180deg,rgba(10,20,32,0.96),rgba(10,20,32,0.78))] px-4 py-3 backdrop-blur-lg lg:-mx-6 lg:px-6">
        <div className="mx-auto flex w-full max-w-lg items-center gap-3 lg:max-w-6xl">
          <Link
            href="/"
            aria-label="Ana sayfaya dön"
            className="grid size-9 shrink-0 place-items-center rounded-full bg-white/8 text-lg text-gold ring-1 ring-gold/30"
          >
            ‹
          </Link>
          <div className="font-display text-base font-black text-white">Backoffice</div>
          <Pill tone="info">salt okunur</Pill>
          <span className="ml-auto text-[11px] text-muted">{o?.day}</span>
        </div>
      </header>

      {overview.loading && !o ? (
        <Skeleton className="h-40" />
      ) : overview.error ? (
        <Card>
          <p className="text-sm text-lose">{overview.error}</p>
        </Card>
      ) : o ? (
        <div className="space-y-4">
          <Card>
            <SectionTitle right={`${o.players} oyuncu`}>Bugün</SectionTitle>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Stat label="Tur" value={String(o.today.rounds)} />
              <Stat label="Oynayan" value={String(o.today.players)} />
              <Stat label="Çevrim" value={coinsShort(o.today.wagered)} />
              <Stat label="Ödeme" value={coinsShort(o.today.paid)} />
            </div>
          </Card>

          <Card>
            <SectionTitle right={`hedef %${RTP_BPS / 100}`}>Gerçekleşen RTP</SectionTitle>
            <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Stat label="Toplam tur" value={String(o.allTime.rounds)} />
              <Stat label="Toplam çevrim" value={coinsShort(o.allTime.wagered)} />
              <Stat label="Toplam ödeme" value={coinsShort(o.allTime.paid)} />
              <Stat
                label="RTP"
                value={allRtp ? `%${allRtp.pct.toFixed(2)}` : "—"}
                hint={o.allTime.rounds < 2000 ? "örneklem küçük" : undefined}
              />
            </div>

            <ul className="space-y-1">
              {o.perGame.map((g) => {
                const r = rtpOf(g.wagered, g.paid);
                const meta = GAME_BY_CODE[g.game];
                const warn = r?.off && g.rounds >= 2000;
                return (
                  <li
                    key={g.game}
                    className="flex items-center gap-2 rounded-lg bg-black/25 px-2.5 py-1.5 text-[11px]"
                  >
                    <span className="w-28 shrink-0 truncate text-white/85">
                      {meta?.title ?? g.game}
                    </span>
                    <span className="tabular w-14 shrink-0 text-muted">{g.rounds} tur</span>
                    <span className="tabular w-20 shrink-0 text-muted">
                      {coinsShort(g.wagered)}
                    </span>
                    <span
                      className={`tabular ml-auto shrink-0 font-black ${
                        warn ? "text-lose" : "text-win"
                      }`}
                    >
                      {r ? `%${r.pct.toFixed(2)}` : "—"}
                    </span>
                  </li>
                );
              })}
            </ul>
            <p className="mt-2 text-[10px] leading-relaxed text-muted">
              Gerçekleşen RTP kısa vadede hedeften sapar — bu normaldir. Uyarı rengi yalnızca 2.000
              turdan sonra ve 3 puandan fazla sapmada çıkar.
            </p>
          </Card>

          <SystemCard />

          <Card>
            <SectionTitle right={o.integrity.ok ? "tutuyor ✓" : "TUTMUYOR"}>
              Defter bütünlüğü
            </SectionTitle>
            <div
              className={`rounded-2xl p-3 ring-1 ${
                o.integrity.ok ? "bg-win/8 ring-win/30" : "bg-lose/15 ring-lose/50"
              }`}
            >
              <div className="tabular flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
                <span className="text-muted">defter toplamı</span>
                <span className="font-black text-white/85">{coins(o.integrity.ledgerTotal)}</span>
                <span className="text-muted">bakiyeler toplamı</span>
                <span className="font-black text-white/85">{coins(o.integrity.balanceTotal)}</span>
                {!o.integrity.ok ? (
                  <span className="font-black text-lose">
                    fark {coins(o.integrity.ledgerTotal - o.integrity.balanceTotal)}
                  </span>
                ) : null}
              </div>
              <p className="mt-1.5 text-[10px] leading-relaxed text-muted">
                Her para hareketi deftere yazıldığı için bu iki rakam her zaman eşit olmalı.
                Eşit değilse ya bir ödeme deftere yazılmadan yapılmıştır ya da bir tur iki kez
                ödenmiştir.
              </p>
            </div>
          </Card>

          <Card>
            <SectionTitle right={`${o.openRounds} açık tur`}>Para akışı</SectionTitle>
            <ul className="space-y-1">
              {o.byType.map((t) => (
                <li
                  key={t.type}
                  className="flex items-center gap-2 rounded-lg bg-black/25 px-2.5 py-1.5 text-[11px]"
                >
                  <span className="w-36 shrink-0 truncate text-white/85">
                    {TYPE_LABEL[t.type] ?? t.type}
                  </span>
                  <span className="tabular w-16 shrink-0 text-muted">{t.n}</span>
                  <span
                    className={`tabular ml-auto shrink-0 font-black ${
                      t.total >= 0 ? "text-win" : "text-lose"
                    }`}
                  >
                    {t.total >= 0 ? "+" : "−"}
                    {coinsShort(Math.abs(t.total))}
                  </span>
                </li>
              ))}
            </ul>
          </Card>

          {/* ---------- HAREKETLER ---------- */}
          <Card>
            <SectionTitle right="append-only">Hareketler</SectionTitle>

            <div className="mb-3 flex flex-col gap-2 sm:flex-row">
              <select
                value={userId}
                onChange={(e) => setUserId(e.target.value)}
                className="min-w-0 flex-1 rounded-xl bg-black/40 px-3 py-2 text-xs text-white ring-1 ring-white/12 outline-none focus:ring-gold/50"
              >
                <option value="">bütün oyuncular</option>
                {players.data?.players.map((p) => (
                  <option key={p.id} value={p.id}>
                    {shortName(p.name)} — {p.email}
                  </option>
                ))}
              </select>
              <select
                value={type}
                onChange={(e) => setType(e.target.value)}
                className="min-w-0 flex-1 rounded-xl bg-black/40 px-3 py-2 text-xs text-white ring-1 ring-white/12 outline-none focus:ring-gold/50"
              >
                <option value="">bütün türler</option>
                {Object.entries(TYPE_LABEL).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </div>

            {entries === null ? (
              <Skeleton className="h-32" />
            ) : entries.length === 0 ? (
              <p className="text-xs text-muted">Kayıt yok.</p>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[620px] text-[11px]">
                    <thead>
                      <tr className="text-left text-muted">
                        <th className="pb-1.5 font-black">Zaman</th>
                        <th className="pb-1.5 font-black">Oyuncu</th>
                        <th className="pb-1.5 font-black">Tür</th>
                        <th className="pb-1.5 font-black">Oyun</th>
                        <th className="pb-1.5 text-right font-black">Tutar</th>
                        <th className="pb-1.5 text-right font-black">Bakiye</th>
                      </tr>
                    </thead>
                    <tbody>
                      {entries.map((e) => (
                        <tr key={e.id} className="border-t border-white/6">
                          <td className="py-1.5 text-muted">{timeAgo(e.createdAt)}</td>
                          <td className="py-1.5 text-white/85">{shortName(e.userName)}</td>
                          <td className="py-1.5 text-white/70">{TYPE_LABEL[e.type] ?? e.type}</td>
                          <td className="py-1.5 text-white/60">
                            {e.game ? (GAME_BY_CODE[e.game]?.title ?? e.game) : e.note ? e.note : "—"}
                            {e.multX4 ? (
                              <span className="ml-1 text-gold">{fmtMultX4(e.multX4)}</span>
                            ) : null}
                          </td>
                          <td
                            className={`tabular py-1.5 text-right font-black ${
                              e.amount >= 0 ? "text-win" : "text-lose"
                            }`}
                          >
                            {e.amount >= 0 ? "+" : "−"}
                            {coins(Math.abs(e.amount))}
                          </td>
                          <td className="tabular py-1.5 text-right text-white/60">
                            {coins(e.balanceAfter)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {nextBefore ? (
                  <button
                    onClick={() => {
                      setLoadingMore(true);
                      void loadLedger(nextBefore).finally(() => setLoadingMore(false));
                    }}
                    disabled={loadingMore}
                    className="mt-3 w-full rounded-2xl bg-white/6 py-2.5 text-xs font-black text-white/70 ring-1 ring-white/10 transition hover:bg-white/12 disabled:opacity-50"
                  >
                    {loadingMore ? "yükleniyor…" : "Daha fazla"}
                  </button>
                ) : null}
              </>
            )}
          </Card>

          {/* ---------- OYUNCULAR ---------- */}
          <Card>
            <SectionTitle right={`${players.data?.players.length ?? 0} kayıt`}>Oyuncular</SectionTitle>
            {players.data ? (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[520px] text-[11px]">
                  <thead>
                    <tr className="text-left text-muted">
                      <th className="pb-1.5 font-black">Oyuncu</th>
                      <th className="pb-1.5 font-black">E-posta</th>
                      <th className="pb-1.5 text-right font-black">Tur</th>
                      <th className="pb-1.5 text-right font-black">Çevrim</th>
                      <th className="pb-1.5 text-right font-black">Zirve</th>
                      <th className="pb-1.5 text-right font-black">Bakiye</th>
                    </tr>
                  </thead>
                  <tbody>
                    {players.data.players.map((p) => (
                      <tr key={p.id} className="border-t border-white/6">
                        <td className="py-1.5 text-white/85">
                          {shortName(p.name)}
                          {p.role === "ADMIN" ? (
                            <span className="ml-1 text-[9px] text-gold">yönetici</span>
                          ) : null}
                          {p.suspendedAt ? (
                            <span className="ml-1 text-[9px] text-lose">askıda</span>
                          ) : null}
                        </td>
                        <td className="py-1.5 text-white/50">{p.email}</td>
                        <td className="tabular py-1.5 text-right text-white/70">{p.rounds}</td>
                        <td className="tabular py-1.5 text-right text-white/70">
                          {coinsShort(p.wagered)}
                        </td>
                        <td className="tabular py-1.5 text-right text-gold">
                          {coinsShort(p.peak)}
                        </td>
                        <td className="tabular py-1.5 text-right text-white/70">
                          {coinsShort(p.balance)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <Skeleton className="h-24" />
            )}
          </Card>

          <p className="text-center text-[11px] leading-relaxed text-muted">
            Bu ekran <strong className="text-white/75">hiçbir şeyi değiştirmez</strong>. Bakiye elle
            düzeltilmez: defter append-only ve her satır o andaki bakiyeyi taşıyor, elle müdahale
            &quot;bakiye nasıl bu hale geldi&quot; sorusunu cevaplanamaz kılardı.
          </p>
        </div>
      ) : null}
    </main>
  );
}

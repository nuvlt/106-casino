"use client";

import { useEffect, useState } from "react";
import { BalanceBar } from "@/components/BalanceBar";
import { Button, Card, Pill, SectionTitle, Skeleton } from "@/components/ui";
import { useApi, post } from "@/hooks/useApi";
import { useMe } from "@/hooks/useMe";
import { GAME_BY_CODE } from "@/lib/catalog";
import { coins, multX4 as fmtMultX4, timeAgo } from "@/lib/format";
import { sfx } from "@/lib/sound";
import {
  isVerifiable,
  recomputeRound,
  sha256Hex,
  type RoundParams,
} from "@/lib/games/verify";

interface SeedPair {
  id: string;
  serverSeed: string;
  serverSeedHash: string;
  clientSeed: string;
  nonce: number;
  revealedAt: string | null;
  roundCount: number;
}

interface SeedsResponse {
  active: { id: string; serverSeedHash: string; clientSeed: string; nonce: number };
  revealed: SeedPair[];
}

interface RoundRow {
  id: string;
  game: string;
  nonce: number;
  bet: number;
  payout: number;
  multX4: number;
  params: RoundParams;
  result: unknown;
  state: string;
  createdAt: string;
}

type Check = { status: "ok" } | { status: "mismatch"; detail: string } | { status: "skipped"; why: string };

/** Tek satırlık kopyalanabilir alan. */
function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-2 py-0.5">
      <span className="w-28 shrink-0 text-muted">{label}</span>
      <button
        onClick={() => void navigator.clipboard?.writeText(value).catch(() => {})}
        title="kopyala"
        className="tabular min-w-0 flex-1 truncate text-left text-white/75 transition hover:text-gold"
      >
        {value}
      </button>
    </div>
  );
}

export function VerifyScreen() {
  const me = useMe();
  const seeds = useApi<SeedsResponse>("/api/fairness/seeds");
  const [openPair, setOpenPair] = useState<string | null>(null);
  const [rounds, setRounds] = useState<RoundRow[] | null>(null);
  const [checks, setChecks] = useState<Record<string, Check>>({});
  const [hashOk, setHashOk] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);
  const [clientSeed, setClientSeed] = useState("");
  const [error, setError] = useState<string | null>(null);

  // Açılan her tohum için: yayınlanan hash gerçekten bu serverSeed'in mi?
  useEffect(() => {
    const list = seeds.data?.revealed ?? [];
    if (list.length === 0) return;
    let cancelled = false;
    void (async () => {
      const out: Record<string, boolean> = {};
      for (const p of list) out[p.id] = (await sha256Hex(p.serverSeed)) === p.serverSeedHash;
      if (!cancelled) setHashOk(out);
    })();
    return () => {
      cancelled = true;
    };
  }, [seeds.data]);

  async function openSeed(pair: SeedPair) {
    if (openPair === pair.id) {
      setOpenPair(null);
      return;
    }
    setOpenPair(pair.id);
    setRounds(null);
    setChecks({});
    const res = await fetch(`/api/fairness/rounds?seedPairId=${pair.id}`);
    const json = (await res.json()) as { rounds: RoundRow[] };
    setRounds(json.rounds);

    // Turları TARAYICIDA yeniden hesapla. Sunucuya hiçbir şey sorulmuyor.
    const out: Record<string, Check> = {};
    for (const r of json.rounds) {
      if (!isVerifiable(r.game)) {
        out[r.id] = { status: "skipped", why: "çok adımlı oyun" };
        continue;
      }
      try {
        const again = await recomputeRound({
          game: r.game,
          serverSeed: pair.serverSeed,
          clientSeed: pair.clientSeed,
          nonce: r.nonce,
          // `params` sütunu bahsi İÇERMEZ — bahis turun kendi sütununda
          // durur. Çözücüler bahsi argüman olarak istediği için burada
          // birleştiriliyor; unutulursa ödeme NaN çıkar ve her tur
          // "uyuşmadı" görünür.
          params: { ...r.params, bet: r.bet },
        });
        const sameMult = Math.round(again.mult * 10_000) === r.multX4;
        const samePayout = again.payout === r.payout;
        out[r.id] =
          sameMult && samePayout
            ? { status: "ok" }
            : {
                status: "mismatch",
                detail: `beklenen ${fmtMultX4(r.multX4)}/${coins(r.payout)} · hesaplanan ${fmtMultX4(
                  Math.round(again.mult * 10_000),
                )}/${coins(again.payout)}`,
              };
      } catch (e) {
        out[r.id] = { status: "mismatch", detail: e instanceof Error ? e.message : "hata" };
      }
      setChecks({ ...out });
    }
    setChecks(out);
  }

  async function rotate() {
    if (busy) return;
    setBusy(true);
    setError(null);
    sfx.click();
    try {
      await post("/api/fairness/rotate", clientSeed.trim() ? { clientSeed: clientSeed.trim() } : {});
      setClientSeed("");
      await seeds.reload();
      await me.reload();
      sfx.badge();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Tohum döndürülemedi");
    } finally {
      setBusy(false);
    }
  }

  const verified = Object.values(checks).filter((c) => c.status === "ok").length;
  const failedCount = Object.values(checks).filter((c) => c.status === "mismatch").length;

  return (
    <main className="mx-auto w-full max-w-lg px-4 pb-16 lg:max-w-4xl lg:px-6">
      <BalanceBar balance={me.data?.wallet.balance} back title="Adalet" />

      <div className="space-y-4">
        <Card>
          <SectionTitle right="provably fair">Nasıl doğrulanır</SectionTitle>
          <ol className="list-inside list-decimal space-y-1.5 text-xs leading-relaxed text-muted">
            <li>
              Her tur oynanmadan <strong className="text-white/85">önce</strong> sunucu tohumunun
              SHA-256 özeti yayınlanır. Aşağıdaki &quot;şu anki taahhüt&quot; bu.
            </li>
            <li>
              Tohumu döndürdüğünde eski sunucu tohumu açılır. Özeti hâlâ tutuyorsa sunucu onu
              sonradan değiştirmemiş demektir.
            </li>
            <li>
              Açılan tohumla geçmiş turların <strong className="text-white/85">bu sayfada</strong>,
              senin tarayıcında yeniden hesaplanır — sunucuya hiçbir şey sorulmadan.
            </li>
          </ol>
          <p className="mt-2 rounded-xl bg-black/30 p-2.5 text-[11px] leading-relaxed text-muted ring-1 ring-white/8">
            Hesap, sunucunun kullandığı kodun birebir aynısıyla yapılır (
            <span className="tabular text-white/70">src/lib/games/engine.ts</span>) ve HMAC&apos;i
            tarayıcının kendi kripto motoru hesaplar.
          </p>
        </Card>

        {seeds.loading && !seeds.data ? (
          <Skeleton className="h-32" />
        ) : seeds.data ? (
          <>
            <Card>
              <SectionTitle right={`${seeds.data.active.nonce} tur`}>Şu anki taahhüt</SectionTitle>
              <div className="tabular rounded-2xl bg-black/35 p-3 text-[11px] ring-1 ring-white/6">
                <Field label="sunucu hash" value={seeds.data.active.serverSeedHash} />
                <Field label="senin tohumun" value={seeds.data.active.clientSeed} />
                <Field label="tur sayacı" value={String(seeds.data.active.nonce)} />
              </div>
              <p className="mt-2 text-[11px] leading-relaxed text-muted">
                Bu tohumun kendisi <strong className="text-white/85">gösterilmez</strong> — aksi
                halde sonucu önceden hesaplayıp ona göre bahis yapabilirdin. Döndürdüğünde açılır.
              </p>

              <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                <input
                  value={clientSeed}
                  onChange={(e) => setClientSeed(e.target.value)}
                  placeholder="kendi tohumun (isteğe bağlı)"
                  maxLength={64}
                  className="tabular min-w-0 flex-1 rounded-xl bg-black/40 px-3 py-2.5 text-xs text-white
                             ring-1 ring-white/12 outline-none placeholder:text-muted focus:ring-gold/50"
                />
                <Button onClick={rotate} disabled={busy} tone="ghost" className="shrink-0 !py-2.5 !text-xs">
                  {busy ? "…" : "Tohumu döndür"}
                </Button>
              </div>
              {error ? <p className="mt-2 text-xs text-lose">{error}</p> : null}
            </Card>

            <Card>
              <SectionTitle right={`${seeds.data.revealed.length} tohum`}>
                Açılmış tohumlar
              </SectionTitle>

              {seeds.data.revealed.length === 0 ? (
                <p className="text-xs leading-relaxed text-muted">
                  Henüz açılmış tohumun yok. Yukarıdan tohumu döndürdüğünde şu ana kadar oynadığın
                  bütün turlar doğrulanabilir hale gelir.
                </p>
              ) : (
                <ul className="space-y-2">
                  {seeds.data.revealed.map((p) => {
                    const open = openPair === p.id;
                    const ok = hashOk[p.id];
                    return (
                      <li key={p.id} className="rounded-2xl bg-black/30 p-3 ring-1 ring-white/8">
                        <button
                          onClick={() => void openSeed(p)}
                          className="flex w-full items-center gap-2 text-left"
                        >
                          <span className="text-xs font-black text-white">
                            {p.roundCount} tur
                          </span>
                          {ok === undefined ? null : ok ? (
                            <Pill tone="win">hash tutuyor ✓</Pill>
                          ) : (
                            <Pill tone="lose">HASH TUTMUYOR</Pill>
                          )}
                          <span className="ml-auto text-[11px] text-muted">
                            {p.revealedAt ? timeAgo(p.revealedAt) : ""} {open ? "▴" : "▾"}
                          </span>
                        </button>

                        {open ? (
                          <div className="mt-2.5 space-y-2.5">
                            <div className="tabular rounded-xl bg-black/40 p-2.5 text-[11px] ring-1 ring-white/6">
                              <Field label="sunucu tohumu" value={p.serverSeed} />
                              <Field label="yayınlanan hash" value={p.serverSeedHash} />
                              <Field label="senin tohumun" value={p.clientSeed} />
                            </div>

                            {rounds === null ? (
                              <Skeleton className="h-20" />
                            ) : rounds.length === 0 ? (
                              <p className="text-xs text-muted">Bu tohumla hiç tur oynanmamış.</p>
                            ) : (
                              <>
                                <div className="flex flex-wrap gap-2 text-[11px] font-black">
                                  <span className="rounded-full bg-win/15 px-2.5 py-1 text-win">
                                    {verified} tur doğrulandı
                                  </span>
                                  {failedCount > 0 ? (
                                    <span className="rounded-full bg-lose/20 px-2.5 py-1 text-lose">
                                      {failedCount} UYUŞMADI
                                    </span>
                                  ) : null}
                                </div>

                                <ul className="space-y-1">
                                  {rounds.map((r) => {
                                    const c = checks[r.id];
                                    const meta = GAME_BY_CODE[r.game];
                                    return (
                                      <li
                                        key={r.id}
                                        className="flex items-center gap-2 rounded-lg bg-black/25 px-2.5 py-1.5 text-[11px]"
                                      >
                                        <span className="tabular w-8 shrink-0 text-muted">
                                          #{r.nonce}
                                        </span>
                                        <span className="w-24 shrink-0 truncate text-white/80">
                                          {meta?.title ?? r.game}
                                        </span>
                                        <span className="tabular w-16 shrink-0 text-gold">
                                          {fmtMultX4(r.multX4)}
                                        </span>
                                        <span className="tabular ml-auto shrink-0">
                                          {c === undefined ? (
                                            <span className="text-muted">…</span>
                                          ) : c.status === "ok" ? (
                                            <span className="text-win">✓ doğru</span>
                                          ) : c.status === "skipped" ? (
                                            <span className="text-muted" title={c.why}>
                                              — {c.why}
                                            </span>
                                          ) : (
                                            <span className="text-lose" title={c.detail}>
                                              ✗ uyuşmadı
                                            </span>
                                          )}
                                        </span>
                                      </li>
                                    );
                                  })}
                                </ul>
                              </>
                            )}
                          </div>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              )}
            </Card>
          </>
        ) : null}

        <p className="text-center text-[11px] leading-relaxed text-muted">
          Crash ve Yüksek/Alçak çok adımlı oyunlardır; sonuçları tek bir tur çözücüsüyle
          hesaplanmadığı için bu listede doğrulama dışı bırakılır.
        </p>
      </div>
    </main>
  );
}

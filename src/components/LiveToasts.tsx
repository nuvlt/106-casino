"use client";

import type { Route } from "next";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { GAME_BY_CODE } from "@/lib/catalog";
import { coins, coinsShort, multX4, shortName } from "@/lib/format";
import type { ReferralNews } from "@/lib/referral";
import { sfx } from "@/lib/sound";
import { REFERRAL_NEWS_EVENT } from "@/lib/toast-bus";

/** Giriş yapılmamış sayfalar — orada ne yoklama ne bildirim. */
const HIDDEN_PREFIXES = ["/giris", "/davet"];
const POLL_MS = 10_000;
const SHOW_MS = 5_000;
const LEAVE_MS = 280;
/** Kuyrukta bekleyen en fazla bildirim — yoğun anda ekran dolmasın. */
const MAX_QUEUE = 3;

interface PulseEvent {
  id: string;
  name: string | null;
  game: string;
  payout: number;
  multX4: number;
}

interface Toast {
  id: string;
  icon: string;
  body: ReactNode;
  sub: ReactNode;
  href?: Route;
  tone: "win" | "gift";
}

function winToast(e: PulseEvent): Toast {
  const g = GAME_BY_CODE[e.game];
  return {
    id: `win:${e.id}`,
    icon: g?.emoji ?? "🎰",
    tone: "win",
    href: g ? (`/oyun/${g.slug}` as Route) : undefined,
    // Oyun adı cümlenin içine konmuyor: Türkçe ek oyuna göre değişiyor
    // (Çarkı'nda / Crash'te / Sayı Tut'ta) — alt satırda ayrı duruyor.
    body: (
      <>
        <strong className="font-black text-white">{shortName(e.name)}</strong>{" "}
        <span className="rounded-md bg-win/20 px-1.5 py-0.5 font-black text-win">{multX4(e.multX4)}</span>{" "}
        yakaladı!
      </>
    ),
    sub: (
      <>
        <span className="text-white/70">{g?.title ?? "Oyun"}</span>
        <span className="font-bold text-gold"> · +{coins(e.payout)} coin</span>
        {g ? <span className="text-white/55"> · Sen de dene →</span> : null}
      </>
    ),
  };
}

function giftToast(n: ReferralNews): Toast {
  const who = shortName(n.name);
  return {
    id: `gift:${n.id}`,
    icon: n.kind === "welcome" ? "🎁" : "🤝",
    tone: "gift",
    body:
      n.kind === "welcome" ? (
        <>
          <strong className="font-black text-white">{who}</strong> seni davet etti — hoş geldin!
        </>
      ) : (
        <>
          <strong className="font-black text-white">{who}</strong> davetinle katıldı!
        </>
      ),
    sub:
      n.bonus > 0 ? (
        <span className="font-bold text-gold">+{coinsShort(n.bonus)} coin bakiyene eklendi</span>
      ) : (
        <span className="text-white/60">Bonuslu davet sınırın dolmuştu</span>
      ),
  };
}

/**
 * Her sayfada, üstte beliren canlı bildirim:
 *  • Başka birinin büyük kazancı (10x+ ya da 1.000+ coin) — dokununca o oyuna gider.
 *  • Davet bonusu haberi (bkz. useMe → toast-bus).
 *
 * Kök layout'ta yaşar; sayfalar arası geçişte yeniden kurulmaz, yoklama
 * kesintisiz sürer. Sekme arka plandayken istek atılmaz.
 */
export function LiveToasts() {
  const pathname = usePathname();
  const router = useRouter();
  const hidden = HIDDEN_PREFIXES.some((p) => pathname?.startsWith(p));

  const [queue, setQueue] = useState<Toast[]>([]);
  const [current, setCurrent] = useState<Toast | null>(null);
  const [leaving, setLeaving] = useState(false);
  const seen = useRef(new Set<string>());
  const cursor = useRef<string | null>(null);

  const enqueue = useCallback((items: Toast[]) => {
    const fresh = items.filter((t) => !seen.current.has(t.id));
    if (fresh.length === 0) return;
    fresh.forEach((t) => seen.current.add(t.id));
    // Davet haberi kişiye özel — kuyrukta kazançların önüne geçer.
    setQueue((q) => {
      const gifts = fresh.filter((t) => t.tone === "gift");
      const wins = fresh.filter((t) => t.tone === "win");
      return [...gifts, ...q, ...wins].slice(0, MAX_QUEUE + gifts.length);
    });
  }, []);

  // Büyük kazanç yoklaması.
  useEffect(() => {
    if (hidden) return;
    let stopped = false;

    const poll = async () => {
      if (stopped || document.visibilityState === "hidden") return;
      try {
        const qs = cursor.current ? `?after=${encodeURIComponent(cursor.current)}` : "";
        const res = await fetch(`/api/feed/pulse${qs}`, { cache: "no-store" });
        if (res.status === 401) {
          stopped = true; // oturum yok — sessizce dur
          return;
        }
        if (!res.ok) return;
        const json = (await res.json()) as { cursor: string; events: PulseEvent[] };
        cursor.current = json.cursor;
        enqueue(json.events.map(winToast));
      } catch {
        /* ağ kesintisi — bir sonraki turda tekrar */
      }
    };

    void poll();
    const t = setInterval(() => void poll(), POLL_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") void poll();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      stopped = true;
      clearInterval(t);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [hidden, enqueue]);

  // Davet haberleri.
  useEffect(() => {
    const onNews = (e: Event) => {
      const news = (e as CustomEvent<ReferralNews[]>).detail ?? [];
      if (news.length === 0) return;
      enqueue(news.map(giftToast));
      sfx.badge();
    };
    window.addEventListener(REFERRAL_NEWS_EVENT, onNews);
    return () => window.removeEventListener(REFERRAL_NEWS_EVENT, onNews);
  }, [enqueue]);

  // Kuyruktan sırayla göster.
  useEffect(() => {
    if (current || queue.length === 0) return;
    const [next, ...rest] = queue;
    setQueue(rest);
    setLeaving(false);
    setCurrent(next!);
  }, [current, queue]);

  useEffect(() => {
    if (!current) return;
    const leave = setTimeout(() => setLeaving(true), SHOW_MS);
    const done = setTimeout(() => setCurrent(null), SHOW_MS + LEAVE_MS);
    return () => {
      clearTimeout(leave);
      clearTimeout(done);
    };
  }, [current]);

  const dismiss = () => {
    setLeaving(true);
    setTimeout(() => setCurrent(null), LEAVE_MS);
  };

  if (hidden || !current) return null;

  const onClick = () => {
    if (current.href && pathname !== current.href) router.push(current.href);
    dismiss();
  };

  return (
    <div
      className="pointer-events-none fixed inset-x-0 top-[calc(env(safe-area-inset-top)+10px)] z-40 flex justify-center px-3"
      role="status"
      aria-live="polite"
    >
      <div
        key={current.id}
        data-toast={current.tone}
        className={`pointer-events-auto flex w-full max-w-sm items-center rounded-2xl ring-1 backdrop-blur-md
          transition duration-300 shadow-[0_14px_36px_rgba(0,0,0,0.6)]
          ${current.tone === "gift"
            ? "bg-[linear-gradient(120deg,rgba(58,37,0,0.95),rgba(20,52,33,0.95))] ring-gold/50"
            : "bg-[linear-gradient(120deg,rgba(26,18,48,0.95),rgba(19,33,51,0.95))] ring-win/40"}
          ${leaving ? "-translate-y-3 opacity-0" : "animate-toast-in"}`}
      >
        <button
          type="button"
          onClick={onClick}
          className="flex min-w-0 flex-1 items-center gap-3 py-2.5 pl-3 text-left"
        >
          <span
            className={`grid size-10 shrink-0 place-items-center rounded-full text-xl
              ${current.tone === "gift" ? "gold-metal" : "bg-white/10 ring-1 ring-white/15"}`}
            aria-hidden
          >
            {current.icon}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[13px] leading-snug text-white/85">{current.body}</span>
            <span className="mt-0.5 block truncate text-[11px]">{current.sub}</span>
          </span>
        </button>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Bildirimi kapat"
          className="grid size-10 shrink-0 place-items-center self-stretch text-xs text-white/45 active:text-white"
        >
          ✕
        </button>
      </div>
    </div>
  );
}

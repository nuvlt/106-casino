import { and, count, eq, gt, max } from "drizzle-orm";
import { db, ensureSchema } from "@/db";
import { dailyStats } from "@/db/schema";
import { trtDay } from "@/lib/day";
import { multX4 } from "@/lib/format";

/** Bu sayının altında şerit gösterilmez — "bugün 1 kişi oynadı" merak değil, soğukluk uyandırır. */
const MIN_PLAYERS = 3;
/** Rekor bu çarpanın altındaysa yazılmaz — "günün rekoru 2x" iştah açmaz. */
const MIN_BEST_X4 = 5 * 10_000;

async function todaysPulse(): Promise<{ players: number; best: number } | null> {
  try {
    await ensureSchema();
    const [row] = await db
      .select({ players: count(), best: max(dailyStats.biggestMultX4) })
      .from(dailyStats)
      .where(and(eq(dailyStats.day, trtDay()), gt(dailyStats.roundsPlayed, 0)));
    return { players: Number(row?.players ?? 0), best: Number(row?.best ?? 0) };
  } catch (e) {
    console.error("Giriş sayfası özeti alınamadı:", e);
    return null;
  }
}

/**
 * Giriş ve davet sayfalarında, içeride neler olduğunu gösteren küçük bir
 * canlı özet: "Bugün 14 kişi oynadı · günün rekoru 48x". Kişi adı yok —
 * sayfa giriş yapmamış biri tarafından da görülebilir.
 */
export async function LiveTeaser() {
  const pulse = await todaysPulse();
  if (!pulse || pulse.players < MIN_PLAYERS) return null;

  return (
    <div
      className="mt-5 flex items-center justify-center gap-2 rounded-2xl bg-black/30 px-3 py-2.5
                 text-xs text-white/80 ring-1 ring-white/10"
    >
      <span className="size-2 shrink-0 animate-pulse rounded-full bg-lose shadow-[0_0_8px_#ff5d78]" aria-hidden />
      <span>
        Bugün <strong className="text-white">{pulse.players} kişi</strong> oynadı
        {pulse.best >= MIN_BEST_X4 ? (
          <>
            {" "}· günün rekoru <strong className="text-gold">{multX4(pulse.best)}</strong>
          </>
        ) : null}
      </span>
    </div>
  );
}

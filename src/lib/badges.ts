/**
 * Rozetler — kalıcı, profilde görünen başarımlar. Her biri bir kez kazanılır.
 *
 * Kazanım kontrolü turun kapandığı transaction içinde yapılır; böylece
 * "rozet kazandın ama tur geri alındı" durumu oluşamaz.
 */

import { sql } from "drizzle-orm";
import { badges, userBadges } from "@/db/schema";
import type { Tx } from "@/db/types";
import { COIN } from "@/lib/games/config";
import { together } from "@/lib/together";

export interface BadgeDef {
  id: string;
  title: string;
  description: string;
  icon: string;
  tier: number;
  reward: number;
}

export const BADGES: readonly BadgeDef[] = [
  { id: "ilk-kan", title: "İlk Adım", description: "İlk turunu oyna", icon: "🎯", tier: 1, reward: 50 * COIN },
  { id: "turist", title: "Keşif", description: "Sekiz oyunun hepsini dene", icon: "🧭", tier: 2, reward: 250 * COIN },
  { id: "yuz-kat", title: "Yüz Kat", description: "Tek turda 100x veya üzeri yakala", icon: "💯", tier: 2, reward: 300 * COIN },
  { id: "bin-kat", title: "Bin Kat", description: "Tek turda 1000x veya üzeri yakala", icon: "🚀", tier: 3, reward: 1_000 * COIN },
  { id: "kullerinden", title: "Geri Dönüş", description: "50 coin altına düşüp aynı gün 3.000 coin üzerine çık", icon: "📈", tier: 3, reward: 500 * COIN },
  { id: "demir-leblebi", title: "İstikrar", description: "7 gün üst üste giriş yap", icon: "🗓️", tier: 2, reward: 400 * COIN },
  { id: "cesur-yurek", title: "Tam Bakiye", description: "Bakiyenin tamamını yatır ve kazan", icon: "🎖️", tier: 3, reward: 400 * COIN },
  { id: "maraton", title: "Maraton", description: "1.000 tur oyna", icon: "🏅", tier: 2, reward: 500 * COIN },
];

const BADGE_BY_ID = new Map(BADGES.map((b) => [b.id, b]));

/** Rozet tanımlarını veritabanına yazar (idempotent) — açılışta bir kez. */
export async function seedBadges(tx: Tx): Promise<void> {
  for (const b of BADGES) {
    await tx
      .insert(badges)
      .values(b)
      .onConflictDoUpdate({
        target: badges.id,
        set: { title: b.title, description: b.description, icon: b.icon, tier: b.tier, reward: b.reward },
      });
  }
}

export interface BadgeContext {
  roundsPlayed: number;
  gamesTouched: string[];
  multX4: number;
  currentStreak: number;
  balanceBeforeBet: number;
  balanceAfter: number;
  minBalanceToday: number;
  won: boolean;
  bet: number;
}

/** Bu turda hangi rozetler hak edildi? (henüz sahip olunmayanlar ayıklanır) */
export function earnedBadgeIds(c: BadgeContext): string[] {
  const ids: string[] = [];

  if (c.roundsPlayed >= 1) ids.push("ilk-kan");
  if (c.gamesTouched.length >= 8) ids.push("turist");
  if (c.multX4 >= 100 * 10_000) ids.push("yuz-kat");
  if (c.multX4 >= 1_000 * 10_000) ids.push("bin-kat");
  if (c.currentStreak >= 7) ids.push("demir-leblebi");
  if (c.roundsPlayed >= 1_000) ids.push("maraton");

  // Bakiyenin tamamını yatırıp kazanmak.
  if (c.won && c.bet === c.balanceBeforeBet) ids.push("cesur-yurek");

  // Dibi görüp aynı gün toparlanmak.
  if (c.minBalanceToday < 50 * COIN && c.balanceAfter > 3_000 * COIN) ids.push("kullerinden");

  return ids;
}

/**
 * Hak edilen rozetleri verir ve ödüllerini yazar.
 * Zaten sahip olunanlar sessizce atlanır (tekil indeks).
 * Döndürülen liste YALNIZCA bu turda yeni kazanılanları içerir.
 */
export async function awardBadges(
  tx: Tx,
  userId: string,
  ctx: BadgeContext,
): Promise<BadgeDef[]> {
  const candidates = earnedBadgeIds(ctx);
  if (candidates.length === 0) return [];

  // Adaylar birbirinden bağımsız; eklemeler art arda gönderilip birlikte
  // beklenir. Sonuç sırası aday sırasıyla aynı kalır.
  const defs = candidates.flatMap((id) => {
    const def = BADGE_BY_ID.get(id);
    return def ? [def] : [];
  });
  const results = await together(
    defs.map((def) =>
      tx
        .insert(userBadges)
        .values({ userId, badgeId: def.id, context: { multX4: ctx.multX4 } })
        .onConflictDoNothing()
        .returning({ id: userBadges.id })
        .execute(),
    ),
  );
  return defs.filter((_, i) => results[i]!.length > 0);
}

/** Rozet ödüllerinin toplamı — çağıran bunu bakiyeye ekler ve defterler. */
export const badgeRewardTotal = (list: BadgeDef[]): number =>
  list.reduce((sum, b) => sum + b.reward, 0);

export { sql };

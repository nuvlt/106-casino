/**
 * Davet — kişisel link, yeni katılanla ilişki kurma ve bonusların ödenmesi.
 *
 * AKIŞ
 * ----
 * 1. Oyuncu kendi linkini paylaşır: /davet/<kod>
 * 2. Linke tıklayan kişinin tarayıcısına middleware bir çerez bırakır
 *    (INVITE_COOKIE) — Google girişi arada birkaç yönlendirme yapsa da
 *    kod kaybolmaz.
 * 3. Giriş sonrası ilk /api/me isteğinde çerez okunur: hesap GERÇEKTEN
 *    yeniyse (NEW_USER_WINDOW_MS içinde açıldıysa) ilişki kurulur.
 * 4. Bonuslar ilişki kurulurken sabitlenir; her iki taraf kendi payını
 *    uygulamayı bir sonraki açışında (/api/me) alır.
 *
 * NEDEN ÖDEME /api/me İÇİNDE?
 * ---------------------------
 * Bakiye her gün SET edilir (bkz. economy.ts). Bonus o günün hakkı
 * verilmeden eklenseydi, sabah sıfırlaması onu silerdi. /api/me günlük
 * hakkı ÖNCE garanti ettiği için bonus her zaman sıfırlamanın üstüne
 * biner. Davet eden o gün uygulamayı hiç açmamış olsa bile bonusu
 * kaybolmaz — açtığı an gelir.
 *
 * ÇİFT ÖDEME YOK
 * --------------
 * • invitee_id tekil: bir kişi yalnızca bir kez davet edilmiş sayılır.
 * • Ödeme koşullu UPDATE ile işaretlenir ("… AND rewarded_at IS NULL"):
 *   aynı anda gelen iki /api/me isteğinden yalnızca biri ödeme yapar.
 */

import { and, count, eq, inArray, isNull, or, sql, sum } from "drizzle-orm";
import { inviteCodes, ledgerEntries, referrals, users } from "@/db/schema";
import type { Db } from "@/db/types";
import { REFERRAL_BONUS, REFERRAL_MAX_REWARDED } from "@/lib/games/config";
import {
  INVITE_ALPHABET as ALPHABET,
  INVITE_CODE_LENGTH as CODE_LENGTH,
  isInviteCode,
} from "@/lib/referral-code";

export { INVITE_COOKIE, isInviteCode } from "@/lib/referral-code";

/** Hesap bu süreden eskiyse davet bonusu verilmez — "yeni katılan" değil. */
export const NEW_USER_WINDOW_MS = 2 * 60 * 60 * 1000;

function newInviteCode(): string {
  const bytes = new Uint8Array(CODE_LENGTH);
  crypto.getRandomValues(bytes);
  // 256 % 31 kaynaklı çok küçük sapma bir davet kodu için önemsiz.
  return Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join("");
}

/** Oyuncunun kalıcı davet kodu — yoksa üretir. */
export async function getOrCreateInviteCode(db: Db, userId: string): Promise<string> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const [existing] = await db
      .select({ code: inviteCodes.code })
      .from(inviteCodes)
      .where(eq(inviteCodes.userId, userId))
      .limit(1);
    if (existing) return existing.code;

    // Çakışma (aynı kullanıcı için eşzamanlı istek ya da — çok düşük
    // ihtimalle — aynı kod) sessizce yutulur; döngü tekrar okur.
    await db.insert(inviteCodes).values({ userId, code: newInviteCode() }).onConflictDoNothing();
  }
  throw new Error("Davet kodu üretilemedi");
}

export async function findInviterByCode(
  db: Db,
  code: string,
): Promise<{ id: string; name: string | null } | null> {
  if (!isInviteCode(code)) return null;
  const [row] = await db
    .select({ id: users.id, name: users.name })
    .from(inviteCodes)
    .innerJoin(users, eq(inviteCodes.userId, users.id))
    .where(eq(inviteCodes.code, code))
    .limit(1);
  return row ?? null;
}

export type LinkResult = "linked" | "invalid" | "self" | "not_new" | "already";

/**
 * Yeni katılanı davet edenle ilişkilendirir. Kesin bir sonuç döner;
 * yalnızca veritabanı hatasında fırlatır (o durumda çerez korunur ve
 * bir sonraki istekte yeniden denenir).
 */
export async function linkReferral(
  db: Db,
  inviteeId: string,
  code: string,
  now = new Date(),
): Promise<LinkResult> {
  const inviter = await findInviterByCode(db, code);
  if (!inviter) return "invalid";
  if (inviter.id === inviteeId) return "self";

  const [invitee] = await db
    .select({ createdAt: users.createdAt })
    .from(users)
    .where(eq(users.id, inviteeId))
    .limit(1);
  if (!invitee || now.getTime() - invitee.createdAt.getTime() > NEW_USER_WINDOW_MS) {
    return "not_new";
  }

  // Davet edenin bonus hakkı sınırlı; sınır dolduysa ilişki yine kurulur
  // (sayaçta görünür) ama davet edene bonus yazılmaz.
  const [{ n } = { n: 0 }] = await db
    .select({ n: count() })
    .from(referrals)
    .where(and(eq(referrals.inviterId, inviter.id), sql`${referrals.inviterBonus} > 0`));

  const inserted = await db
    .insert(referrals)
    .values({
      inviterId: inviter.id,
      inviteeId,
      inviterBonus: n < REFERRAL_MAX_REWARDED ? REFERRAL_BONUS : 0,
      inviteeBonus: REFERRAL_BONUS,
    })
    .onConflictDoNothing()
    .returning({ id: referrals.id });

  return inserted.length > 0 ? "linked" : "already";
}

/** Arayüzde bir kez gösterilecek davet haberi. */
export interface ReferralNews {
  /** referral.id + taraf — istemci aynı haberi iki kez göstermesin diye. */
  id: string;
  /** welcome: "X seni davet etti"   friend: "X davetinle katıldı" */
  kind: "welcome" | "friend";
  /** Karşı tarafın adı. */
  name: string | null;
  bonus: number;
}

/**
 * Bu oyuncunun bekleyen davet bonuslarını öder (davet edilen ya da
 * davet eden olarak). Ödenenleri haber olarak döndürür.
 */
export async function settleReferralRewards(db: Db, userId: string): Promise<ReferralNews[]> {
  const pending = await db
    .select({
      id: referrals.id,
      inviterId: referrals.inviterId,
      inviteeId: referrals.inviteeId,
      inviterBonus: referrals.inviterBonus,
      inviteeBonus: referrals.inviteeBonus,
    })
    .from(referrals)
    .where(
      or(
        and(eq(referrals.inviteeId, userId), isNull(referrals.inviteeRewardedAt)),
        and(eq(referrals.inviterId, userId), isNull(referrals.inviterRewardedAt)),
      ),
    );
  if (pending.length === 0) return [];

  const otherIds = [...new Set(pending.map((p) => (p.inviteeId === userId ? p.inviterId : p.inviteeId)))];
  const names = new Map(
    (
      await db.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, otherIds))
    ).map((u) => [u.id, u.name]),
  );

  return db.transaction(async (tx) => {
    const news: ReferralNews[] = [];

    for (const p of pending) {
      const asInvitee = p.inviteeId === userId;
      const bonus = asInvitee ? p.inviteeBonus : p.inviterBonus;

      // Koşullu işaret: eşzamanlı başka bir istek zaten ödediyse satır dönmez.
      const claimed = asInvitee
        ? await tx
            .update(referrals)
            .set({ inviteeRewardedAt: new Date() })
            .where(and(eq(referrals.id, p.id), isNull(referrals.inviteeRewardedAt)))
            .returning({ id: referrals.id })
        : await tx
            .update(referrals)
            .set({ inviterRewardedAt: new Date() })
            .where(and(eq(referrals.id, p.id), isNull(referrals.inviterRewardedAt)))
            .returning({ id: referrals.id });
      if (claimed.length === 0) continue;

      const otherName = names.get(asInvitee ? p.inviterId : p.inviteeId) ?? null;

      if (bonus > 0) {
        const [credited] = await tx
          .update(users)
          .set({ balance: sql`${users.balance} + ${bonus}` })
          .where(eq(users.id, userId))
          .returning({ balance: users.balance });
        await tx.insert(ledgerEntries).values({
          userId,
          type: "REFERRAL_BONUS",
          amount: bonus,
          balanceAfter: credited!.balance,
          note: asInvitee
            ? `Davet bonusu — ${otherName ?? "bir arkadaş"} davet etti`
            : `Davet bonusu — ${otherName ?? "bir arkadaş"} katıldı`,
        });
      }

      news.push({
        id: `${p.id}:${asInvitee ? "welcome" : "friend"}`,
        kind: asInvitee ? "welcome" : "friend",
        name: otherName,
        bonus,
      });
    }

    return news;
  });
}

export interface InviteSummary {
  code: string;
  /** Linkle katılan kişi sayısı. */
  invited: number;
  /** Davet edenin şimdiye kadar aldığı toplam bonus (centicoin). */
  earned: number;
  /** Kalan bonuslu davet hakkı. */
  rewardsLeft: number;
  bonus: number;
}

export async function inviteSummary(db: Db, userId: string): Promise<InviteSummary> {
  const code = await getOrCreateInviteCode(db, userId);
  const [row] = await db
    .select({
      invited: count(),
      rewarded: count(sql`nullif(${referrals.inviterBonus}, 0)`),
      earned: sum(sql`case when ${referrals.inviterRewardedAt} is not null then ${referrals.inviterBonus} else 0 end`),
    })
    .from(referrals)
    .where(eq(referrals.inviterId, userId));

  const rewarded = Number(row?.rewarded ?? 0);
  return {
    code,
    invited: Number(row?.invited ?? 0),
    earned: Number(row?.earned ?? 0),
    rewardsLeft: Math.max(0, REFERRAL_MAX_REWARDED - rewarded),
    bonus: REFERRAL_BONUS,
  };
}

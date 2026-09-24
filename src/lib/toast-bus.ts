/**
 * Ekranlar ile üstteki bildirim katmanı (LiveToasts) arasındaki ince köprü.
 * LiveToasts kök layout'ta yaşar; ekranların verisine doğrudan erişemez.
 * Bir ekran göstermek istediği haberi bu olayla yayınlar.
 */

import type { ReferralNews } from "@/lib/referral";

export const REFERRAL_NEWS_EVENT = "106:referral-news";

export function publishReferralNews(news: ReferralNews[]): void {
  if (news.length === 0 || typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<ReferralNews[]>(REFERRAL_NEWS_EVENT, { detail: news }));
}

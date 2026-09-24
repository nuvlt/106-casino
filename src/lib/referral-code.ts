/**
 * Davet kodunun biçimi ve çerezi — veritabanına dokunmayan saf kısım.
 * Ayrı dosyada çünkü middleware (Edge) bunu içe aktarıyor; lib/referral.ts
 * ise Drizzle'ı ve şemayı çeker, Edge paketine girmemeli.
 */

export const INVITE_COOKIE = "106_davet";
export const INVITE_COOKIE_MAX_AGE = 7 * 24 * 60 * 60; // saniye

// Karıştırılabilecek karakterler yok (0/o, 1/l/i).
export const INVITE_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";
export const INVITE_CODE_LENGTH = 8;
const CODE_RE = new RegExp(`^[${INVITE_ALPHABET}]{${INVITE_CODE_LENGTH}}$`);

export const isInviteCode = (code: unknown): code is string =>
  typeof code === "string" && CODE_RE.test(code);

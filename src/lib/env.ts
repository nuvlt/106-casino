/**
 * Ortam değişkenleri — eksik olan varsa uygulama açılışta düşsün,
 * ilk bahiste değil.
 */

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Ortam değişkeni eksik: ${name}`);
  return value;
}

export const env = {
  allowedDomain: process.env.ALLOWED_DOMAIN ?? "106dijital.com",
  adminEmails: (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean),
  /** Şirket dışı, tek tek davet edilen adresler (danışman, ajans...). */
  guestEmails: (process.env.GUEST_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean),
  cronSecret: process.env.CRON_SECRET ?? "",
  redisUrl: process.env.REDIS_URL ?? "",
  get authSecret() {
    return required("AUTH_SECRET");
  },
  get googleId() {
    return required("AUTH_GOOGLE_ID");
  },
  get googleSecret() {
    return required("AUTH_GOOGLE_SECRET");
  },
};

export const isAdminEmail = (email: string | null | undefined): boolean =>
  !!email && env.adminEmails.includes(email.toLowerCase());

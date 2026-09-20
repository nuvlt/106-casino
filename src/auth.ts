/**
 * Kimlik doğrulama — Auth.js v5, tek sağlayıcı: Google.
 *
 * DOMAIN KONTROLÜ
 * ---------------
 * Girişe yalnızca @106dijital.com Workspace hesapları kabul edilir ve bu
 * kontrol profildeki `hd` (hosted domain) claim'i üzerinden yapılır.
 *
 * E-postanın sonuna bakmak YETERLİ DEĞİLDİR: `email` alanı
 * "birisi@106dijital.com.saldirgan.com" gibi bir değerle taklit edilebilir.
 * `hd` claim'ini ise yalnızca Google Workspace üretir ve Google imzalar.
 *
 * Oturumlar veritabanında tutulur (JWT değil) — böylece askıya alınan
 * kullanıcı bir sonraki istekte anında düşer, token süresi beklenmez.
 */

import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { accounts, sessions, users, verificationTokens } from "@/db/schema";
import { env, isAdminEmail } from "@/lib/env";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      email: string;
      name?: string | null;
      image?: string | null;
      role: "PLAYER" | "ADMIN";
    };
  }
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: DrizzleAdapter(db, {
    usersTable: users,
    accountsTable: accounts,
    sessionsTable: sessions,
    verificationTokensTable: verificationTokens,
  }),
  session: { strategy: "database", maxAge: 30 * 24 * 60 * 60 },
  pages: { signIn: "/giris", error: "/giris" },
  providers: [
    Google({
      authorization: {
        params: {
          // hd parametresi Google'ın hesap seçiciyi şirket hesaplarına
          // daraltmasını sağlar — asıl kontrol yine sunucuda yapılır.
          hd: env.allowedDomain,
          prompt: "select_account",
        },
      },
    }),
  ],
  callbacks: {
    async signIn({ profile }) {
      const email = profile?.email?.toLowerCase();
      if (!email) return false;
      // Doğrulanmamış e-posta kabul edilmez.
      if (profile?.email_verified !== true) return false;

      // Tek tek davet edilenler domain kontrolünden muaf.
      if (env.guestEmails.includes(email)) return true;

      // Asıl kontrol: Workspace'in imzaladığı hosted-domain claim'i.
      const hd = (profile as { hd?: string }).hd;
      return hd === env.allowedDomain;
    },

    async session({ session, user }) {
      session.user.id = user.id;
      session.user.role = (user as { role?: "PLAYER" | "ADMIN" }).role ?? "PLAYER";
      return session;
    },
  },
  events: {
    async signIn({ user }) {
      if (!user.id) return;
      // ADMIN_EMAILS listesindekiler yönetici rolünü otomatik alır.
      const role = isAdminEmail(user.email) ? "ADMIN" : undefined;
      await db
        .update(users)
        .set({ lastSeenAt: new Date(), ...(role ? { role } : {}) })
        .where(eq(users.id, user.id));
    },
  },
  trustHost: true,
});

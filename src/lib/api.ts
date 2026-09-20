/**
 * API yardımcıları — oturum koruması ve standart hata biçimi.
 */

import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db, ensureSchema } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";

export interface SessionUser {
  id: string;
  email: string;
  name: string | null;
  role: "PLAYER" | "ADMIN";
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly code = "ERROR",
  ) {
    super(message);
  }
}

export function fail(status: number, message: string, code = "ERROR") {
  return NextResponse.json({ error: message, code }, { status });
}

/** Oturumu doğrular ve kullanıcının askıda olmadığını garanti eder. */
export async function requireUser(): Promise<SessionUser> {
  // Gömülü (yerel) kipte şema ilk istekte hazırlanır; gerçek Postgres'te
  // bu çağrı hiçbir şey yapmaz.
  await ensureSchema();
  const session = await auth();
  if (!session?.user?.id) throw new ApiError(401, "Giriş yapmalısınız", "UNAUTHENTICATED");

  const [user] = await db
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      role: users.role,
      suspendedAt: users.suspendedAt,
    })
    .from(users)
    .where(eq(users.id, session.user.id))
    .limit(1);

  if (!user) throw new ApiError(401, "Kullanıcı bulunamadı", "UNAUTHENTICATED");
  if (user.suspendedAt) throw new ApiError(403, "Hesabınız askıya alınmış", "SUSPENDED");

  return { id: user.id, email: user.email, name: user.name, role: user.role };
}

export async function requireAdmin(): Promise<SessionUser> {
  const user = await requireUser();
  if (user.role !== "ADMIN") throw new ApiError(403, "Yönetici yetkisi gerekli", "FORBIDDEN");
  return user;
}

/** Route handler'ları saran ortak hata yakalayıcı. */
export function handler<T>(fn: () => Promise<T>) {
  return async () => {
    try {
      return NextResponse.json(await fn());
    } catch (e) {
      if (e instanceof ApiError) return fail(e.status, e.message, e.code);
      console.error("API hatası:", e);
      return fail(500, "Beklenmeyen bir hata oluştu", "INTERNAL");
    }
  };
}

import type { Metadata } from "next";
import Link from "next/link";
import { auth } from "@/auth";
import { ensureSchema, db } from "@/db";
import { GoogleSignInButton } from "@/components/GoogleSignInButton";
import { LiveTeaser } from "@/components/LiveTeaser";
import { coinsShort, shortName } from "@/lib/format";
import { DAILY_GRANT, REFERRAL_BONUS } from "@/lib/games/config";
import { findInviterByCode } from "@/lib/referral";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "106 Casino — davetlisin 🎰",
  description: "Her gün 1.000 coin, 8 oyun, ofis sıralaması. Gerçek para yok, sadece gurur.",
};

async function inviterFor(code: string): Promise<{ name: string | null } | null> {
  try {
    await ensureSchema();
    return await findInviterByCode(db, code.toLowerCase());
  } catch (e) {
    // Davet tabloları yoksa sayfa yine açılır — sadece isimsiz davet olur.
    console.error("Davet sahibi okunamadı:", e);
    return null;
  }
}

/**
 * Davet açılış sayfası. Çerezi middleware zaten yazdı; bu sayfanın işi
 * merak uyandırıp kişiyi Google girişine götürmek.
 */
export default async function DavetPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const [session, inviter] = await Promise.all([auth(), inviterFor(code)]);
  const loggedIn = !!session?.user;
  const who = inviter ? shortName(inviter.name) : null;

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center px-6 py-10">
      <div className="gloss w-full overflow-hidden rounded-[28px] bg-gradient-to-b from-[#ffd977] via-[#a9760a] to-[#7a5804] p-[3px] shadow-[0_24px_70px_rgba(0,0,0,0.7)]">
        <div className="relative overflow-hidden rounded-[25px] bg-[radial-gradient(120%_120%_at_50%_-10%,#1d5a39_0%,#0d3b25_40%,#061a12_100%)] px-7 py-9 text-center">
          <div className="pointer-events-none absolute -left-12 -top-20 size-56 rounded-full bg-white/10 blur-3xl" />

          <div className="animate-floaty relative mb-3 text-5xl drop-shadow-[0_6px_14px_rgba(0,0,0,0.5)]" aria-hidden>
            🎰
          </div>

          {who ? (
            <p className="relative text-sm font-bold text-white/70">
              <strong className="text-white">{who}</strong> seni masaya çağırıyor
            </p>
          ) : (
            <p className="relative text-sm font-bold text-white/70">Masaya davetlisin</p>
          )}

          <h1 className="font-display mt-2 text-[40px] font-black leading-none tracking-tight">
            <span className="gold-text">106</span>{" "}
            <span className="text-white/90">Casino</span>
          </h1>

          {inviter && !loggedIn ? (
            <div className="shine gold-metal relative mx-auto mt-5 w-fit rounded-2xl px-4 py-2 text-[#3a2500] shadow-[0_6px_0_#7a5804]">
              <div className="text-[10px] font-black uppercase tracking-widest opacity-80">Hoş geldin hediyesi</div>
              <div className="font-display text-xl font-black">+{coinsShort(REFERRAL_BONUS)} coin</div>
              <div className="text-[10px] font-bold opacity-80">ikinize de — sana ve davet edene</div>
            </div>
          ) : null}

          <ul className="mt-6 grid grid-cols-3 gap-2 text-[11px] font-bold text-white/80">
            <li className="rounded-2xl bg-black/25 px-2 py-3 ring-1 ring-white/10">
              <div className="mb-1 text-lg">🪙</div>
              Her gün {coinsShort(DAILY_GRANT)} coin
            </li>
            <li className="rounded-2xl bg-black/25 px-2 py-3 ring-1 ring-white/10">
              <div className="mb-1 text-lg">🎡</div>8 oyun
            </li>
            <li className="rounded-2xl bg-black/25 px-2 py-3 ring-1 ring-white/10">
              <div className="mb-1 text-lg">🏆</div>
              Ofis sıralaması
            </li>
          </ul>

          <LiveTeaser />

          {loggedIn ? (
            <div className="mt-7 space-y-3">
              <p className="rounded-2xl bg-black/25 px-4 py-3 text-sm text-white/75 ring-1 ring-white/10">
                Zaten masadasın 🎲 Davet hediyesi yalnızca yeni katılanlar için.
              </p>
              <Link
                href="/"
                className="gold-metal block rounded-2xl px-6 py-4 font-display font-black text-[#3a2500]
                           shadow-[0_6px_0_#7a5804] transition active:translate-y-[4px] active:shadow-[0_2px_0_#7a5804]"
              >
                Salona dön →
              </Link>
            </div>
          ) : (
            <div className="mt-7">
              <GoogleSignInButton label="Google ile katıl" />
            </div>
          )}

          <p className="mt-6 text-[11px] leading-relaxed text-white/45">
            Gerçek para yok — çekilemez, transfer edilemez. Şirket Google hesabınla girersin; adın
            sıralamada görünür.
          </p>
        </div>
      </div>
    </main>
  );
}

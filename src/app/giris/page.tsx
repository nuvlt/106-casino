import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { GoogleSignInButton } from "@/components/GoogleSignInButton";
import { LiveTeaser } from "@/components/LiveTeaser";

export default async function GirisPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const session = await auth();
  if (session?.user) redirect("/");

  const { error } = await searchParams;

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center px-6 py-10">
      {/* altın çerçeveli tabela */}
      <div className="gloss w-full overflow-hidden rounded-[28px] bg-gradient-to-b from-[#ffd977] via-[#a9760a] to-[#7a5804] p-[3px] shadow-[0_24px_70px_rgba(0,0,0,0.7)]">
        <div className="relative overflow-hidden rounded-[25px] bg-[radial-gradient(120%_120%_at_50%_-10%,#1d5a39_0%,#0d3b25_40%,#061a12_100%)] px-7 py-9 text-center">
          <div className="pointer-events-none absolute -left-12 -top-20 size-56 rounded-full bg-white/10 blur-3xl" />

          {/* jetonlar */}
          <div className="relative mb-4 flex justify-center gap-1.5">
            {["#e01e37", "#2f80ed", "#ffc94a", "#1f8b4c"].map((c, i) => (
              <span
                key={c}
                className="size-6 rounded-full ring-2 ring-white/25"
                style={{
                  background: `radial-gradient(circle at 50% 35%, ${c} 0 55%, rgba(0,0,0,0.45) 56% 100%)`,
                  transform: `translateY(${i % 2 ? 4 : 0}px)`,
                }}
              />
            ))}
          </div>

          <h1 className="font-display text-[42px] font-black leading-none tracking-tight">
            <span className="gold-text">106</span>
          </h1>
          <div className="font-display mt-1 text-lg font-black uppercase tracking-[0.3em] text-white/90">
            Casino
          </div>

          <div className="mx-auto my-5 h-px w-24 bg-gradient-to-r from-transparent via-gold/60 to-transparent" />

          <p className="text-sm leading-relaxed text-white/75">
            Ofis içi oyun salonu. Gerçek para yok —{" "}
            <strong className="text-gold">herkese her gün 1.000 coin</strong>, tek ödül sıralamanın
            tepesi.
          </p>

          <LiveTeaser />

          {error ? (
            <p className="mt-5 rounded-2xl bg-lose/15 px-4 py-3 text-sm text-lose ring-1 ring-lose/30">
              Giriş yapılamadı. Yalnızca <strong>@106dijital.com</strong> hesapları kabul ediliyor.
            </p>
          ) : null}

          <div className="mt-7">
            <GoogleSignInButton />
          </div>

          <p className="mt-6 text-[11px] leading-relaxed text-white/45">
            Şirket Google hesabınla girersin; adın soyadın sıralamada görünür.
          </p>
        </div>
      </div>
    </main>
  );
}

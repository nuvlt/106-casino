import { redirect } from "next/navigation";
import { auth, signIn } from "@/auth";

export default async function GirisPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const session = await auth();
  if (session?.user) redirect("/");

  const { error } = await searchParams;

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center px-6">
      <div className="w-full rounded-3xl border border-white/10 bg-[--color-surface] p-8 text-center shadow-2xl">
        <h1 className="font-display text-4xl font-bold text-[--color-gold]">106 Casino</h1>
        <p className="mt-3 text-sm text-white/60">
          Ofis içi oyun platformu. Gerçek para yok — herkese her gün 1.000 coin.
        </p>

        {error ? (
          <p className="mt-6 rounded-xl bg-[--color-lose]/15 px-4 py-3 text-sm text-[--color-lose]">
            Giriş yapılamadı. Yalnızca <strong>@106dijital.com</strong> hesapları kabul ediliyor.
          </p>
        ) : null}

        <form
          className="mt-8"
          action={async () => {
            "use server";
            await signIn("google", { redirectTo: "/" });
          }}
        >
          <button
            type="submit"
            className="w-full rounded-2xl bg-white px-6 py-4 font-semibold text-black
                       transition active:scale-[0.98]"
          >
            Google ile giriş yap
          </button>
        </form>

        <p className="mt-6 text-xs text-white/40">
          Şirket Google hesabınla giriş yaparsın; adın soyadın sıralamada görünür.
        </p>
      </div>
    </main>
  );
}

import { redirect } from "next/navigation";
import { auth } from "@/auth";

export default async function Home() {
  const session = await auth();
  if (!session?.user) redirect("/giris");

  // Ana sayfa (oyun kartları, sıralama, canlı akış) Aşama 3'te gelecek.
  return (
    <main className="mx-auto max-w-md px-4 py-10">
      <h1 className="font-display text-3xl font-bold text-[--color-gold]">106 Casino</h1>
      <p className="mt-2 text-sm text-white/60">
        Hoş geldin{session.user.name ? `, ${session.user.name}` : ""}. Oyunlar hazırlanıyor.
      </p>
    </main>
  );
}

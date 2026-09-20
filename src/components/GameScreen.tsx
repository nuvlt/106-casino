"use client";

import { BalanceBar } from "@/components/BalanceBar";
import { OpenRoundBanner } from "@/components/OpenRoundBanner";
import { useMe } from "@/hooks/useMe";
import { gameBySlug } from "@/lib/catalog";
import { WheelGame } from "@/components/games/WheelGame";
import { CrashGame } from "@/components/games/CrashGame";

/** Oyun sayfalarının ortak kabuğu: başlık, bakiye ve oyunun kendisi. */
export function GameScreen({ slug }: { slug: string }) {
  const me = useMe();
  const meta = gameBySlug(slug);
  if (!meta) return null;

  const onSettled = (balance: number) => {
    me.setData((prev) => (prev ? { ...prev, wallet: { ...prev.wallet, balance } } : prev));
  };

  return (
    <main className="mx-auto max-w-lg px-4 pb-16">
      <BalanceBar balance={me.data?.wallet.balance} back title={meta.title} />
      <OpenRoundBanner round={me.data?.openRound ?? null} currentSlug={slug} />
      {slug === "wheel" ? (
        <WheelGame balance={me.data?.wallet.balance ?? 0} onSettled={onSettled} onReload={me.reload} />
      ) : slug === "crash" ? (
        <CrashGame balance={me.data?.wallet.balance ?? 0} onSettled={onSettled} onReload={me.reload} />
      ) : null}
    </main>
  );
}

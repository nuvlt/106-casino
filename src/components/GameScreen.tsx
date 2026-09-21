"use client";

import type { ComponentType } from "react";
import { BalanceBar } from "@/components/BalanceBar";
import { OpenRoundBanner } from "@/components/OpenRoundBanner";
import { useMe } from "@/hooks/useMe";
import { gameBySlug } from "@/lib/catalog";
import { WheelGame } from "@/components/games/WheelGame";
import { CrashGame } from "@/components/games/CrashGame";
import { DiceGame } from "@/components/games/DiceGame";
import { PlinkoGame } from "@/components/games/PlinkoGame";
import { ScratchGame } from "@/components/games/ScratchGame";
import { GuessGame } from "@/components/games/GuessGame";
import { MysteryGame } from "@/components/games/MysteryGame";
import { HiloGame } from "@/components/games/HiloGame";

/** Tüm oyun bileşenleri aynı sözleşmeyi paylaşır. */
interface GameProps {
  balance: number;
  onSettled: (b: number) => void;
  onReload: () => Promise<void>;
}

/** slug → bileşen. Katalogdaki slug ile bire bir eşleşir. */
const GAME_UI: Record<string, ComponentType<GameProps>> = {
  wheel: WheelGame,
  crash: CrashGame,
  dice: DiceGame,
  plinko: PlinkoGame,
  scratch: ScratchGame,
  guess: GuessGame,
  mystery: MysteryGame,
  hilo: HiloGame,
};

/** Oyun sayfalarının ortak kabuğu: başlık, bakiye ve oyunun kendisi. */
export function GameScreen({ slug }: { slug: string }) {
  const me = useMe();
  const meta = gameBySlug(slug);
  const Game = GAME_UI[slug];
  if (!meta || !Game) return null;

  const onSettled = (balance: number) => {
    me.setData((prev) => (prev ? { ...prev, wallet: { ...prev.wallet, balance } } : prev));
  };

  return (
    <main className="mx-auto max-w-lg px-4 pb-16">
      <BalanceBar balance={me.data?.wallet.balance} back title={meta.title} />
      <OpenRoundBanner round={me.data?.openRound ?? null} currentSlug={slug} />
      <Game balance={me.data?.wallet.balance ?? 0} onSettled={onSettled} onReload={me.reload} />
    </main>
  );
}

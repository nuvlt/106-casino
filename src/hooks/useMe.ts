"use client";

import { useEffect } from "react";
import { useApi } from "@/hooks/useApi";
import type { ReferralNews } from "@/lib/referral";
import { publishReferralNews } from "@/lib/toast-bus";

export interface MeResponse {
  user: { id: string; name: string | null; email: string; role: "PLAYER" | "ADMIN" };
  wallet: { balance: number; balanceCoins: number; day: string };
  streak: { day: number; grantedToday: number; nextBonus: number; longest: number };
  stats: {
    peakBalance: number;
    biggestWin: number;
    biggestMult: number;
    roundsPlayed: number;
    totalWagered: number;
    currentWinStreak: number;
  };
  openRound: { id: string; game: string; bet: number } | null;
  missions: {
    id: string;
    kind: string;
    title: string;
    subtitle: string | null;
    target: number;
    reward: number;
    progress: number;
    completedAt: string | null;
    claimedAt: string | null;
  }[];
  badges: { id: string; title: string; description: string; icon: string; tier: number }[];
  fairness: { serverSeedHash: string; clientSeed: string; nonce: number };
  /** Bu yanıtta ödenen davet bonusları — bir kez bildirim olarak gösterilir. */
  referralNews?: ReferralNews[];
}

export function useMe(refreshMs?: number) {
  const state = useApi<MeResponse>("/api/me", { refreshMs });

  // Davet bonusu ödendiyse üstteki bildirim katmanına haber ver. Aynı
  // dizi referansı (setData ile bakiye güncellemesi) tekrar tetiklemez;
  // LiveToasts ayrıca kimliğe göre tekilleştirir.
  const news = state.data?.referralNews;
  useEffect(() => {
    if (news?.length) publishReferralNews(news);
  }, [news]);

  return state;
}

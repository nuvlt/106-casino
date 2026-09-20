"use client";

import { useApi } from "@/hooks/useApi";

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
}

export const useMe = (refreshMs?: number) => useApi<MeResponse>("/api/me", { refreshMs });

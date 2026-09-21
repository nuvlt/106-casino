/**
 * POST /api/games/plinko/balls — aynı anda birden fazla top.
 *
 * NEDEN AYRI BİR UÇ: Her topu istemciden ayrı bir istekle atmak, bahis
 * hız sınırını (saniyede 5) tek bir hamlede doldururdu ve oyuncu bir
 * saniye boyunca hiçbir şey oynayamazdı. Ayrıca topların bir kısmı
 * geçip bir kısmı reddedilebilirdi.
 *
 * Burada istek tek, tur çok: her top KENDİ turu olarak çözülür — kendi
 * nonce'ı, kendi defter kaydı, kendi provably-fair doğrulaması. Yani
 * çoklu top yalnızca bir arayüz kolaylığı değil, ekonomiye de tek toplu
 * oyunla birebir aynı şekilde giriyor. RTP değişmiyor.
 */

import { z } from "zod";
import { db } from "@/db";
import { gameRoute } from "@/lib/game-routes";
import { settleRound } from "@/lib/wallet";
import { resolvePlinko } from "@/lib/games/engine";
import { plinkoParams } from "@/lib/validation";
import { PLINKO_MAX_BALLS } from "@/lib/games/config";

export const dynamic = "force-dynamic";

const params = plinkoParams.extend({
  balls: z.number().int().min(1).max(PLINKO_MAX_BALLS),
});

export const POST = gameRoute(params, async ({ user, body }) => {
  const { idempotencyKey, bet, risk, rows, balls } = body;

  const settled: {
    roundId: string;
    payout: number;
    mult: number;
    result: unknown;
  }[] = [];
  const badgeById = new Map<string, { id: string; title: string; icon: string; reward: number }>();
  let balance = 0;

  // Sırayla: her top kendi işleminde kapanır. Bakiye yetmezse kalanlar
  // atılmaz ve WalletError yukarı çıkar — ama o ana kadar atılanlar
  // geçerlidir, çünkü her biri gerçekten oynanmış bir turdur.
  for (let i = 0; i < balls; i++) {
    const round = await settleRound(db, {
      userId: user.id,
      game: "PLINKO",
      bet,
      params: { risk, rows, ball: i },
      // Her topun anahtarı ayrı: tekrar gönderilen istek aynı topları
      // ikinci kez oynatmaz.
      idempotencyKey: `${idempotencyKey}-${i}`,
      resolve: (rng) => resolvePlinko(rng, bet, risk, rows),
    });

    settled.push({
      roundId: round.roundId,
      payout: round.payout,
      mult: round.mult,
      result: round.result,
    });
    balance = round.balance;
    for (const b of round.newBadges) badgeById.set(b.id, b);
  }

  const totalStake = bet * settled.length;
  const totalPayout = settled.reduce((sum, r) => sum + r.payout, 0);

  return {
    balls: settled,
    totalStake,
    totalPayout,
    // Toplam çarpan yalnızca gösterim içindir; ödeme top top yapıldı.
    mult: totalStake === 0 ? 0 : totalPayout / totalStake,
    balance,
    newBadges: [...badgeById.values()],
  };
});

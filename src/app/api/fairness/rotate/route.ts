/**
 * POST /api/fairness/rotate — tohumu döndür.
 *
 * Eski serverSeed açılır (artık doğrulanabilir), yenisi kurulur ve
 * yalnızca hash'i yayınlanır. Oyuncu isterse kendi client seed'ini verir.
 */

import { db } from "@/db";
import { gameRoute } from "@/lib/game-routes";
import { rotateSeed } from "@/lib/seeds";
import { seedRotateParams } from "@/lib/validation";

export const dynamic = "force-dynamic";

export const POST = gameRoute(
  seedRotateParams,
  async ({ user, body }) => rotateSeed(db, user.id, body.clientSeed),
  { rateLimited: false },
);

/**
 * Provably fair tohum yönetimi.
 *
 * Kullanıcının her zaman tam bir aktif tohum çifti vardır. serverSeed
 * hiçbir API yanıtına konmaz; yalnızca hash'i yayınlanır. Tohum
 * döndürüldüğünde eski serverSeed açılır ve geçmiş turlar doğrulanabilir hale gelir.
 */

import { and, eq } from "drizzle-orm";
import { seedPairs } from "@/db/schema";
import type { Db, DbOrTx } from "@/db/types";
import { generateClientSeed, generateServerSeed, hashServerSeed } from "@/lib/games/rng";

export interface PublicSeedInfo {
  id: string;
  serverSeedHash: string;
  clientSeed: string;
  nonce: number;
}

/** Aktif tohum çiftini döndürür, yoksa oluşturur. serverSeed asla dönmez. */
export async function ensureActiveSeed(tx: DbOrTx, userId: string): Promise<PublicSeedInfo> {
  const [existing] = await tx
    .select({
      id: seedPairs.id,
      serverSeedHash: seedPairs.serverSeedHash,
      clientSeed: seedPairs.clientSeed,
      nonce: seedPairs.nonce,
    })
    .from(seedPairs)
    .where(and(eq(seedPairs.userId, userId), eq(seedPairs.active, true)))
    .limit(1);

  if (existing) return existing;

  const serverSeed = generateServerSeed();
  const [created] = await tx
    .insert(seedPairs)
    .values({
      userId,
      serverSeed,
      serverSeedHash: hashServerSeed(serverSeed),
      clientSeed: generateClientSeed(),
    })
    .returning({
      id: seedPairs.id,
      serverSeedHash: seedPairs.serverSeedHash,
      clientSeed: seedPairs.clientSeed,
      nonce: seedPairs.nonce,
    });

  return created!;
}

/**
 * Tohumu döndürür: eskisi açığa çıkar (revealedAt işaretlenir), yenisi kurulur.
 * Açılan serverSeed ile kullanıcı geçmiş turlarının tamamını doğrulayabilir.
 */
export async function rotateSeed(
  db: Db,
  userId: string,
  newClientSeed?: string,
): Promise<{ revealed: { serverSeed: string; serverSeedHash: string; nonce: number } | null; next: PublicSeedInfo }> {
  return db.transaction(async (tx) => {
    const [old] = await tx
      .select()
      .from(seedPairs)
      .where(and(eq(seedPairs.userId, userId), eq(seedPairs.active, true)))
      .limit(1);

    if (old) {
      await tx
        .update(seedPairs)
        .set({ active: false, revealedAt: new Date() })
        .where(eq(seedPairs.id, old.id));
    }

    const serverSeed = generateServerSeed();
    const [next] = await tx
      .insert(seedPairs)
      .values({
        userId,
        serverSeed,
        serverSeedHash: hashServerSeed(serverSeed),
        clientSeed: newClientSeed?.trim() || generateClientSeed(),
      })
      .returning({
        id: seedPairs.id,
        serverSeedHash: seedPairs.serverSeedHash,
        clientSeed: seedPairs.clientSeed,
        nonce: seedPairs.nonce,
      });

    return {
      revealed: old
        ? { serverSeed: old.serverSeed, serverSeedHash: old.serverSeedHash, nonce: old.nonce }
        : null,
      next: next!,
    };
  });
}

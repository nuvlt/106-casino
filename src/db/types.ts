/**
 * Hem üretimdeki postgres.js sürücüsü hem testlerdeki gömülü PGlite ile
 * çalışabilen ortak veritabanı tipi. İş mantığı fonksiyonları bu tipi alır,
 * böylece aynı kod gerçek Postgres'te de testte de çalışır.
 */

import type { ExtractTablesWithRelations } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT, PgTransaction } from "drizzle-orm/pg-core";
import type * as schema from "./schema";

export type Schema = typeof schema;
export type Db = PgDatabase<PgQueryResultHKT, Schema, ExtractTablesWithRelations<Schema>>;
export type Tx = PgTransaction<PgQueryResultHKT, Schema, ExtractTablesWithRelations<Schema>>;
/** Transaction içinde de dışında da çağrılabilen fonksiyonlar için. */
export type DbOrTx = Db | Tx;

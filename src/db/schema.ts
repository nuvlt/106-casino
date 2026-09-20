/**
 * 106 Casino — veritabanı şeması (PostgreSQL / Railway, Drizzle ORM)
 *
 * TASARIM İLKELERİ
 * ----------------
 * 1. Para her yerde TAM SAYI centicoin (1 coin = 100). Asla float/decimal değil.
 * 2. Ledger append-only: hiçbir satır güncellenmez veya silinmez. Bakiye, ledger
 *    toplamıyla her zaman mutabık olmalı — backoffice bunu denetler.
 * 3. Tur sonucu sunucuda üretilir ve İSTEMCİYE GİTMEYEN alanda saklanır
 *    (rounds.secret). Crash'in çöküş noktası, Higher/Lower'ın destesi orada durur.
 * 4. Provably fair: seedPairs.serverSeed yalnız tohum döndürüldükten sonra açılır;
 *    o ana kadar sadece hash'i yayınlanır.
 */

import { relations, sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import type { AdapterAccountType } from "next-auth/adapters";

/* ================================================================== */
/* ENUM'LAR                                                           */
/* ================================================================== */

export const roleEnum = pgEnum("role", ["PLAYER", "ADMIN"]);

export const gameEnum = pgEnum("game", [
  "WHEEL",
  "CRASH",
  "DICE",
  "PLINKO",
  "SCRATCH",
  "GUESS",
  "MYSTERY",
  "HIGHERLOWER",
]);

export const roundStateEnum = pgEnum("round_state", [
  "OPEN", // çok adımlı oyun sürüyor (crash uçuşta, hilo zinciri açık)
  "SETTLED",
  "VOIDED", // yönetici iptali — bahis iade edilir
]);

export const ledgerTypeEnum = pgEnum("ledger_type", [
  "DAILY_RESET", // her sabah bakiyeyi 1.000 coin'e sabitleme
  "STREAK_BONUS",
  "MISSION_REWARD",
  "BADGE_REWARD",
  "BET", // negatif
  "PAYOUT", // pozitif
  "REFUND", // iptal edilen tur
  "ADMIN_ADJUST",
]);

export const missionKindEnum = pgEnum("mission_kind", [
  "PLAY_N_GAMES", // farklı oyun oyna
  "PLAY_N_ROUNDS",
  "WIN_N_ROUNDS",
  "WIN_STREAK",
  "HIT_MULTIPLIER", // şu çarpanı yakala
  "WAGER_TOTAL",
]);

/* ================================================================== */
/* KULLANICI + AUTH.JS                                                */
/* ================================================================== */

export const users = pgTable(
  "user",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    // Yalnız @106dijital.com — Google'ın hd claim'i ile doğrulanır.
    email: text("email").notNull().unique(),
    emailVerified: timestamp("emailVerified", { mode: "date" }),
    name: text("name"),
    image: text("image"),
    role: roleEnum("role").notNull().default("PLAYER"),

    // Askıya alınan kullanıcı oynayamaz ama verisi durur.
    suspendedAt: timestamp("suspended_at", { withTimezone: true }),
    suspendedReason: text("suspended_reason"),

    // centicoin — ledger toplamıyla mutabık olmalı
    balance: integer("balance").notNull().default(0),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("user_balance_idx").on(t.balance)],
);

export const accounts = pgTable(
  "account",
  {
    userId: text("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type").$type<AdapterAccountType>().notNull(),
    provider: text("provider").notNull(),
    providerAccountId: text("providerAccountId").notNull(),
    refresh_token: text("refresh_token"),
    access_token: text("access_token"),
    expires_at: integer("expires_at"),
    token_type: text("token_type"),
    scope: text("scope"),
    id_token: text("id_token"),
    session_state: text("session_state"),
  },
  (t) => [primaryKey({ columns: [t.provider, t.providerAccountId] })],
);

export const sessions = pgTable("session", {
  sessionToken: text("sessionToken").primaryKey(),
  userId: text("userId")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expires: timestamp("expires", { mode: "date" }).notNull(),
});

export const verificationTokens = pgTable(
  "verificationToken",
  {
    identifier: text("identifier").notNull(),
    token: text("token").notNull(),
    expires: timestamp("expires", { mode: "date" }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.identifier, t.token] })],
);

/* ================================================================== */
/* PROVABLY FAIR TOHUMLARI                                            */
/* ================================================================== */

export const seedPairs = pgTable(
  "seed_pair",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),

    // serverSeed, tohum döndürülene kadar API'den ASLA dönmez.
    serverSeed: text("server_seed").notNull(),
    serverSeedHash: text("server_seed_hash").notNull(), // bahisten önce yayınlanır
    clientSeed: text("client_seed").notNull(),
    nonce: integer("nonce").notNull().default(0), // bu çiftle oynanan tur sayacı

    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    revealedAt: timestamp("revealed_at", { withTimezone: true }),
  },
  (t) => [
    index("seed_pair_user_idx").on(t.userId, t.createdAt),
    // Kullanıcı başına en fazla BİR aktif tohum çifti.
    uniqueIndex("one_active_seed_per_user")
      .on(t.userId)
      .where(sql`${t.active}`),
  ],
);

/* ================================================================== */
/* TURLAR                                                             */
/* ================================================================== */

export const rounds = pgTable(
  "round",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),

    game: gameEnum("game").notNull(),
    state: roundStateEnum("state").notNull().default("SETTLED"),

    bet: integer("bet").notNull(), // centicoin
    payout: integer("payout").notNull().default(0), // centicoin, brüt
    // Gösterim çarpanı ×10000 (950000 = 95.0000x). Tam sayı tutulur ki
    // sıralama ve "en yüksek çarpan" rekoru kayan noktaya bağlı olmasın.
    multX4: integer("mult_x4").notNull().default(0),

    seedPairId: text("seed_pair_id")
      .notNull()
      .references(() => seedPairs.id),
    nonce: integer("nonce").notNull(),

    // Oyuncunun seçtikleri (zar eşiği, plinko riski, seçilen kutu...).
    params: jsonb("params").notNull(),
    // Turun herkese açık sonucu — animasyon ve geçmiş için.
    result: jsonb("result"),
    // İSTEMCİYE GİTMEZ. Crash çöküş noktası, hilo destesi, kazı-kazan ızgarası.
    secret: jsonb("secret"),

    // Aynı isteğin iki kez işlenmesini engeller (ağ tekrarı, çift tık).
    idempotencyKey: text("idempotency_key").notNull().unique(),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    settledAt: timestamp("settled_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }), // OPEN turlar için

    // Gün bazlı istatistik için TRT takvim günü (YYYY-MM-DD).
    day: text("day").notNull(),
  },
  (t) => [
    index("round_user_idx").on(t.userId, t.createdAt.desc()),
    index("round_game_idx").on(t.game, t.createdAt.desc()),
    index("round_open_idx").on(t.state, t.expiresAt),
    index("round_mult_idx").on(t.multX4.desc()),
    index("round_day_idx").on(t.day),
  ],
);

/* ================================================================== */
/* DEFTER (append-only)                                               */
/* ================================================================== */

export const ledgerEntries = pgTable(
  "ledger_entry",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),

    type: ledgerTypeEnum("type").notNull(),
    amount: integer("amount").notNull(), // işaretli centicoin
    balanceAfter: integer("balance_after").notNull(), // denetim için

    roundId: text("round_id").references(() => rounds.id),

    // ADMIN_ADJUST için: kim yaptı, neden.
    actorId: text("actor_id"),
    note: text("note"),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("ledger_user_idx").on(t.userId, t.createdAt.desc()),
    index("ledger_type_idx").on(t.type, t.createdAt.desc()),
  ],
);

/* ================================================================== */
/* GÜNLÜK HAK VE SERİ                                                 */
/* ================================================================== */

export const dailyClaims = pgTable(
  "daily_claim",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),

    // Europe/Istanbul takvim günü (YYYY-MM-DD).
    day: text("day").notNull(),
    streakDay: integer("streak_day").notNull(), // art arda kaçıncı gün
    granted: integer("granted").notNull(), // verilen toplam centicoin

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("daily_claim_user_day").on(t.userId, t.day), index("daily_claim_day_idx").on(t.day)],
);

/* ================================================================== */
/* GÖREVLER                                                           */
/* ================================================================== */

export const missions = pgTable(
  "mission",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    day: text("day").notNull(), // YYYY-MM-DD
    kind: missionKindEnum("kind").notNull(),
    target: integer("target").notNull(),
    game: gameEnum("game"), // boşsa tüm oyunlar sayılır
    reward: integer("reward").notNull(), // centicoin
    title: text("title").notNull(),
    subtitle: text("subtitle"),
  },
  (t) => [
    // Gün + tür + hedef üçlüsü görevin kimliği: cron ile ilk giren kullanıcı
    // aynı anda üretmeye çalışsa bile tek satır oluşur.
    uniqueIndex("mission_day_kind_target").on(t.day, t.kind, t.target),
    index("mission_day_idx").on(t.day),
  ],
);

export const userMissions = pgTable(
  "user_mission",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    missionId: text("mission_id")
      .notNull()
      .references(() => missions.id, { onDelete: "cascade" }),

    progress: integer("progress").notNull().default(0),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    claimedAt: timestamp("claimed_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("user_mission_unique").on(t.userId, t.missionId),
    index("user_mission_user_idx").on(t.userId, t.completedAt),
  ],
);

/* ================================================================== */
/* ROZETLER                                                           */
/* ================================================================== */

export const badges = pgTable("badge", {
  id: text("id").primaryKey(), // "ilk-kan", "yuz-kat", "gunun-krali"
  title: text("title").notNull(),
  description: text("description").notNull(),
  icon: text("icon").notNull(),
  tier: integer("tier").notNull().default(1), // 1 bronz, 2 gümüş, 3 altın
  reward: integer("reward").notNull().default(0),
});

export const userBadges = pgTable(
  "user_badge",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    badgeId: text("badge_id")
      .notNull()
      .references(() => badges.id, { onDelete: "cascade" }),

    earnedAt: timestamp("earned_at", { withTimezone: true }).notNull().defaultNow(),
    context: jsonb("context"), // hangi turda kazanıldı
  },
  (t) => [
    uniqueIndex("user_badge_unique").on(t.userId, t.badgeId),
    index("user_badge_user_idx").on(t.userId, t.earnedAt.desc()),
  ],
);

/* ================================================================== */
/* SIRALAMA                                                           */
/* ================================================================== */

// Sıralama ölçütü ZİRVE BAKİYE: sezon boyunca ulaşılan en yüksek bakiye.
// Böylece "hiç oynamayan kazanır" sorunu oluşmaz — risk almak ödüllendirilir.
export const playerStats = pgTable(
  "player_stat",
  {
    userId: text("user_id")
      .primaryKey()
      .references(() => users.id, { onDelete: "cascade" }),

    peakBalance: integer("peak_balance").notNull().default(0), // ← ana sıralama
    peakBalanceAt: timestamp("peak_balance_at", { withTimezone: true }),

    biggestWin: integer("biggest_win").notNull().default(0),
    biggestWinRoundId: text("biggest_win_round_id"),
    biggestMultX4: integer("biggest_mult_x4").notNull().default(0),
    biggestMultRoundId: text("biggest_mult_round_id"),

    roundsPlayed: integer("rounds_played").notNull().default(0),
    totalWagered: integer("total_wagered").notNull().default(0),
    totalWon: integer("total_won").notNull().default(0),
    gamesTouched: jsonb("games_touched").notNull().default(sql`'[]'::jsonb`),

    currentStreak: integer("current_streak").notNull().default(0),
    longestStreak: integer("longest_streak").notNull().default(0),
    currentWinStreak: integer("current_win_streak").notNull().default(0),
    bestWinStreak: integer("best_win_streak").notNull().default(0),

    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("stat_peak_idx").on(t.peakBalance.desc()),
    index("stat_mult_idx").on(t.biggestMultX4.desc()),
    index("stat_wagered_idx").on(t.totalWagered.desc()),
  ],
);

// Günlük sıralama ("Günün Kralı") — her gün sıfırdan başlar.
export const dailyStats = pgTable(
  "daily_stat",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    day: text("day").notNull(),

    peakBalance: integer("peak_balance").notNull().default(0),
    netResult: integer("net_result").notNull().default(0), // gün içi kâr/zarar
    roundsPlayed: integer("rounds_played").notNull().default(0),
    biggestMultX4: integer("biggest_mult_x4").notNull().default(0),
  },
  (t) => [
    uniqueIndex("daily_stat_user_day").on(t.userId, t.day),
    index("daily_stat_rank_idx").on(t.day, t.peakBalance.desc()),
  ],
);

/* ================================================================== */
/* CANLI KAZANÇ AKIŞI                                                 */
/* ================================================================== */

export const feedEvents = pgTable(
  "feed_event",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),

    game: gameEnum("game").notNull(),
    payout: integer("payout").notNull(),
    multX4: integer("mult_x4").notNull(),
    roundId: text("round_id"),

    // "En güzel anlar" şeridinde kalıcı kalsın diye işaretlenenler.
    pinned: boolean("pinned").notNull().default(false),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("feed_created_idx").on(t.createdAt.desc()),
    index("feed_pinned_idx").on(t.pinned, t.multX4.desc()),
  ],
);

/* ================================================================== */
/* YÖNETİM DENETİM KAYDI                                              */
/* ================================================================== */

export const adminAudits = pgTable(
  "admin_audit",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    actorId: text("actor_id")
      .notNull()
      .references(() => users.id),

    action: text("action").notNull(), // "ADJUST_BALANCE", "SUSPEND_USER", ...
    targetType: text("target_type").notNull(),
    targetId: text("target_id").notNull(),
    before: jsonb("before"),
    after: jsonb("after"),
    note: text("note"),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("audit_created_idx").on(t.createdAt.desc()),
    index("audit_actor_idx").on(t.actorId, t.createdAt.desc()),
  ],
);

/* ================================================================== */
/* İLİŞKİLER                                                          */
/* ================================================================== */

export const usersRelations = relations(users, ({ many, one }) => ({
  seedPairs: many(seedPairs),
  rounds: many(rounds),
  ledger: many(ledgerEntries),
  dailyClaims: many(dailyClaims),
  missions: many(userMissions),
  badges: many(userBadges),
  stat: one(playerStats, { fields: [users.id], references: [playerStats.userId] }),
}));

export const roundsRelations = relations(rounds, ({ one, many }) => ({
  user: one(users, { fields: [rounds.userId], references: [users.id] }),
  seedPair: one(seedPairs, { fields: [rounds.seedPairId], references: [seedPairs.id] }),
  ledger: many(ledgerEntries),
}));

export const seedPairsRelations = relations(seedPairs, ({ one, many }) => ({
  user: one(users, { fields: [seedPairs.userId], references: [users.id] }),
  rounds: many(rounds),
}));

export const userMissionsRelations = relations(userMissions, ({ one }) => ({
  user: one(users, { fields: [userMissions.userId], references: [users.id] }),
  mission: one(missions, { fields: [userMissions.missionId], references: [missions.id] }),
}));

export const userBadgesRelations = relations(userBadges, ({ one }) => ({
  user: one(users, { fields: [userBadges.userId], references: [users.id] }),
  badge: one(badges, { fields: [userBadges.badgeId], references: [badges.id] }),
}));

export type User = typeof users.$inferSelect;
export type Round = typeof rounds.$inferSelect;
export type NewRound = typeof rounds.$inferInsert;
export type PlayerStat = typeof playerStats.$inferSelect;

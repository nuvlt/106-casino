CREATE TYPE "public"."game" AS ENUM('WHEEL', 'CRASH', 'DICE', 'PLINKO', 'SCRATCH', 'GUESS', 'MYSTERY', 'HIGHERLOWER');--> statement-breakpoint
CREATE TYPE "public"."ledger_type" AS ENUM('DAILY_RESET', 'STREAK_BONUS', 'MISSION_REWARD', 'BADGE_REWARD', 'BET', 'PAYOUT', 'REFUND', 'ADMIN_ADJUST');--> statement-breakpoint
CREATE TYPE "public"."mission_kind" AS ENUM('PLAY_N_GAMES', 'PLAY_N_ROUNDS', 'WIN_N_ROUNDS', 'WIN_STREAK', 'HIT_MULTIPLIER', 'WAGER_TOTAL');--> statement-breakpoint
CREATE TYPE "public"."role" AS ENUM('PLAYER', 'ADMIN');--> statement-breakpoint
CREATE TYPE "public"."round_state" AS ENUM('OPEN', 'SETTLED', 'VOIDED');--> statement-breakpoint
CREATE TABLE "account" (
	"userId" text NOT NULL,
	"type" text NOT NULL,
	"provider" text NOT NULL,
	"providerAccountId" text NOT NULL,
	"refresh_token" text,
	"access_token" text,
	"expires_at" integer,
	"token_type" text,
	"scope" text,
	"id_token" text,
	"session_state" text,
	CONSTRAINT "account_provider_providerAccountId_pk" PRIMARY KEY("provider","providerAccountId")
);
--> statement-breakpoint
CREATE TABLE "admin_audit" (
	"id" text PRIMARY KEY NOT NULL,
	"actor_id" text NOT NULL,
	"action" text NOT NULL,
	"target_type" text NOT NULL,
	"target_id" text NOT NULL,
	"before" jsonb,
	"after" jsonb,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "badge" (
	"id" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"icon" text NOT NULL,
	"tier" integer DEFAULT 1 NOT NULL,
	"reward" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "daily_claim" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"day" text NOT NULL,
	"streak_day" integer NOT NULL,
	"granted" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "daily_stat" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"day" text NOT NULL,
	"peak_balance" integer DEFAULT 0 NOT NULL,
	"net_result" integer DEFAULT 0 NOT NULL,
	"rounds_played" integer DEFAULT 0 NOT NULL,
	"biggest_mult_x4" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "feed_event" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"game" "game" NOT NULL,
	"payout" integer NOT NULL,
	"mult_x4" integer NOT NULL,
	"round_id" text,
	"pinned" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ledger_entry" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"type" "ledger_type" NOT NULL,
	"amount" integer NOT NULL,
	"balance_after" integer NOT NULL,
	"round_id" text,
	"actor_id" text,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mission" (
	"id" text PRIMARY KEY NOT NULL,
	"day" text NOT NULL,
	"kind" "mission_kind" NOT NULL,
	"target" integer NOT NULL,
	"game" "game",
	"reward" integer NOT NULL,
	"title" text NOT NULL,
	"subtitle" text
);
--> statement-breakpoint
CREATE TABLE "player_stat" (
	"user_id" text PRIMARY KEY NOT NULL,
	"peak_balance" integer DEFAULT 0 NOT NULL,
	"peak_balance_at" timestamp with time zone,
	"biggest_win" integer DEFAULT 0 NOT NULL,
	"biggest_win_round_id" text,
	"biggest_mult_x4" integer DEFAULT 0 NOT NULL,
	"biggest_mult_round_id" text,
	"rounds_played" integer DEFAULT 0 NOT NULL,
	"total_wagered" integer DEFAULT 0 NOT NULL,
	"total_won" integer DEFAULT 0 NOT NULL,
	"games_touched" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"current_streak" integer DEFAULT 0 NOT NULL,
	"longest_streak" integer DEFAULT 0 NOT NULL,
	"current_win_streak" integer DEFAULT 0 NOT NULL,
	"best_win_streak" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "round" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"game" "game" NOT NULL,
	"state" "round_state" DEFAULT 'SETTLED' NOT NULL,
	"bet" integer NOT NULL,
	"payout" integer DEFAULT 0 NOT NULL,
	"mult_x4" integer DEFAULT 0 NOT NULL,
	"seed_pair_id" text NOT NULL,
	"nonce" integer NOT NULL,
	"params" jsonb NOT NULL,
	"result" jsonb,
	"secret" jsonb,
	"idempotency_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"settled_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"day" text NOT NULL,
	CONSTRAINT "round_idempotency_key_unique" UNIQUE("idempotency_key")
);
--> statement-breakpoint
CREATE TABLE "seed_pair" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"server_seed" text NOT NULL,
	"server_seed_hash" text NOT NULL,
	"client_seed" text NOT NULL,
	"nonce" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revealed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "session" (
	"sessionToken" text PRIMARY KEY NOT NULL,
	"userId" text NOT NULL,
	"expires" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_badge" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"badge_id" text NOT NULL,
	"earned_at" timestamp with time zone DEFAULT now() NOT NULL,
	"context" jsonb
);
--> statement-breakpoint
CREATE TABLE "user_mission" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"mission_id" text NOT NULL,
	"progress" integer DEFAULT 0 NOT NULL,
	"completed_at" timestamp with time zone,
	"claimed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"emailVerified" timestamp,
	"name" text,
	"image" text,
	"role" "role" DEFAULT 'PLAYER' NOT NULL,
	"suspended_at" timestamp with time zone,
	"suspended_reason" text,
	"balance" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verificationToken" (
	"identifier" text NOT NULL,
	"token" text NOT NULL,
	"expires" timestamp NOT NULL,
	CONSTRAINT "verificationToken_identifier_token_pk" PRIMARY KEY("identifier","token")
);
--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_audit" ADD CONSTRAINT "admin_audit_actor_id_user_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_claim" ADD CONSTRAINT "daily_claim_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_stat" ADD CONSTRAINT "daily_stat_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feed_event" ADD CONSTRAINT "feed_event_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entry" ADD CONSTRAINT "ledger_entry_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entry" ADD CONSTRAINT "ledger_entry_round_id_round_id_fk" FOREIGN KEY ("round_id") REFERENCES "public"."round"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_stat" ADD CONSTRAINT "player_stat_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "round" ADD CONSTRAINT "round_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "round" ADD CONSTRAINT "round_seed_pair_id_seed_pair_id_fk" FOREIGN KEY ("seed_pair_id") REFERENCES "public"."seed_pair"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seed_pair" ADD CONSTRAINT "seed_pair_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_badge" ADD CONSTRAINT "user_badge_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_badge" ADD CONSTRAINT "user_badge_badge_id_badge_id_fk" FOREIGN KEY ("badge_id") REFERENCES "public"."badge"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_mission" ADD CONSTRAINT "user_mission_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_mission" ADD CONSTRAINT "user_mission_mission_id_mission_id_fk" FOREIGN KEY ("mission_id") REFERENCES "public"."mission"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_created_idx" ON "admin_audit" USING btree ("created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "audit_actor_idx" ON "admin_audit" USING btree ("actor_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "daily_claim_user_day" ON "daily_claim" USING btree ("user_id","day");--> statement-breakpoint
CREATE INDEX "daily_claim_day_idx" ON "daily_claim" USING btree ("day");--> statement-breakpoint
CREATE UNIQUE INDEX "daily_stat_user_day" ON "daily_stat" USING btree ("user_id","day");--> statement-breakpoint
CREATE INDEX "daily_stat_rank_idx" ON "daily_stat" USING btree ("day","peak_balance" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "feed_created_idx" ON "feed_event" USING btree ("created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "feed_pinned_idx" ON "feed_event" USING btree ("pinned","mult_x4" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "ledger_user_idx" ON "ledger_entry" USING btree ("user_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "ledger_type_idx" ON "ledger_entry" USING btree ("type","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "mission_day_kind_target" ON "mission" USING btree ("day","kind","target");--> statement-breakpoint
CREATE INDEX "mission_day_idx" ON "mission" USING btree ("day");--> statement-breakpoint
CREATE INDEX "stat_peak_idx" ON "player_stat" USING btree ("peak_balance" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "stat_mult_idx" ON "player_stat" USING btree ("biggest_mult_x4" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "stat_wagered_idx" ON "player_stat" USING btree ("total_wagered" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "round_user_idx" ON "round" USING btree ("user_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "round_game_idx" ON "round" USING btree ("game","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "round_open_idx" ON "round" USING btree ("state","expires_at");--> statement-breakpoint
CREATE INDEX "round_mult_idx" ON "round" USING btree ("mult_x4" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "round_day_idx" ON "round" USING btree ("day");--> statement-breakpoint
CREATE INDEX "seed_pair_user_idx" ON "seed_pair" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "one_active_seed_per_user" ON "seed_pair" USING btree ("user_id") WHERE "seed_pair"."active";--> statement-breakpoint
CREATE UNIQUE INDEX "user_badge_unique" ON "user_badge" USING btree ("user_id","badge_id");--> statement-breakpoint
CREATE INDEX "user_badge_user_idx" ON "user_badge" USING btree ("user_id","earned_at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "user_mission_unique" ON "user_mission" USING btree ("user_id","mission_id");--> statement-breakpoint
CREATE INDEX "user_mission_user_idx" ON "user_mission" USING btree ("user_id","completed_at");--> statement-breakpoint
CREATE INDEX "user_balance_idx" ON "user" USING btree ("balance");
-- Davet sistemi. Bütün ifadeler tekrar çalıştırmaya dayanıklı (IF NOT EXISTS):
-- hem `npm run db:migrate` ile hem de scripts/migrate-davet.sql üzerinden
-- Railway'e elle yapıştırılarak uygulanabilir; ikisi birden uygulansa da
-- hata vermez. Yabancı anahtarlar tablo içinde tanımlı — ayrı ALTER TABLE
-- ADD CONSTRAINT ifadesinin "IF NOT EXISTS" biçimi yok.
ALTER TYPE "public"."ledger_type" ADD VALUE IF NOT EXISTS 'REFERRAL_BONUS';--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "invite_code" (
	"user_id" text PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invite_code_code_unique" UNIQUE("code"),
	CONSTRAINT "invite_code_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "referral" (
	"id" text PRIMARY KEY NOT NULL,
	"inviter_id" text NOT NULL,
	"invitee_id" text NOT NULL,
	"inviter_bonus" integer DEFAULT 0 NOT NULL,
	"invitee_bonus" integer DEFAULT 0 NOT NULL,
	"inviter_rewarded_at" timestamp with time zone,
	"invitee_rewarded_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "referral_invitee_id_unique" UNIQUE("invitee_id"),
	CONSTRAINT "referral_inviter_id_user_id_fk" FOREIGN KEY ("inviter_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action,
	CONSTRAINT "referral_invitee_id_user_id_fk" FOREIGN KEY ("invitee_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "referral_inviter_idx" ON "referral" USING btree ("inviter_id","created_at" DESC NULLS LAST);

-- ================================================================
-- 106 Casino — DAVET SİSTEMİ TABLOLARI
-- ================================================================
-- Railway → Postgres servisi → Data (Query) sekmesine yapıştırıp çalıştırın.
-- (Aynısı drizzle/0001_davet.sql içinde; `npm run db:migrate` de uygular.)
--
-- Yalnızca EKLER: iki yeni tablo ve defter için yeni bir kayıt türü.
-- Mevcut hiçbir tabloya, satıra veya sütuna dokunmaz. Tekrar çalıştırmak
-- güvenlidir. Bu çalıştırılmadan yeni kod yayına çıksa da uygulama
-- bozulmaz — yalnızca davet özelliği kapalı kalır.
-- ================================================================

ALTER TYPE "public"."ledger_type" ADD VALUE IF NOT EXISTS 'REFERRAL_BONUS';

CREATE TABLE IF NOT EXISTS "invite_code" (
  "user_id" text PRIMARY KEY NOT NULL,
  "code" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "invite_code_code_unique" UNIQUE("code"),
  CONSTRAINT "invite_code_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action
);

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

CREATE INDEX IF NOT EXISTS "referral_inviter_idx" ON "referral" USING btree ("inviter_id","created_at" DESC NULLS LAST);

-- Kontrol: iki satır dönmeli (invite_code, referral) ve son sütun "true".
-- (Enum'u katalogdan okuyoruz: yeni değeri aynı transaction içinde
-- "kullanmak" Postgres'te yasak — tek transaction'da çalışırsa her şeyi
-- geri alırdı.)
SELECT table_name,
       EXISTS (
         SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
         WHERE t.typname = 'ledger_type' AND e.enumlabel = 'REFERRAL_BONUS'
       ) AS defter_turu_hazir
FROM information_schema.tables
WHERE table_schema = 'public' AND table_name IN ('invite_code', 'referral');

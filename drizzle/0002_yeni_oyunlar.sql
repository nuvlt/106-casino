-- Dört yeni oyun: rulet, klasik 777, Kapalıçarşı, blackjack.
-- Yalnızca oyun türü listesine değer ekler; tekrar çalıştırmak güvenli.
ALTER TYPE "public"."game" ADD VALUE IF NOT EXISTS 'ROULETTE';--> statement-breakpoint
ALTER TYPE "public"."game" ADD VALUE IF NOT EXISTS 'SLOT_CLASSIC';--> statement-breakpoint
ALTER TYPE "public"."game" ADD VALUE IF NOT EXISTS 'SLOT_BAZAAR';--> statement-breakpoint
ALTER TYPE "public"."game" ADD VALUE IF NOT EXISTS 'BLACKJACK';

-- ================================================================
-- 106 Casino — YENİ OYUNLAR (rulet, klasik 777, Kapalıçarşı, blackjack)
-- ================================================================
-- Railway → Postgres servisi → Data (Query) sekmesine yapıştırıp çalıştırın.
-- (Aynısı drizzle/0002_yeni_oyunlar.sql içinde.)
--
-- Yalnızca oyun türü listesine dört değer ekler. Hiçbir tabloya, satıra
-- dokunmaz; tekrar çalıştırmak güvenlidir. Çalıştırılmadan yeni kod yayına
-- çıkarsa mevcut sekiz oyun etkilenmez — yeni dört oyun "henüz hazır değil"
-- der.
-- ================================================================

ALTER TYPE "public"."game" ADD VALUE IF NOT EXISTS 'ROULETTE';
ALTER TYPE "public"."game" ADD VALUE IF NOT EXISTS 'SLOT_CLASSIC';
ALTER TYPE "public"."game" ADD VALUE IF NOT EXISTS 'SLOT_BAZAAR';
ALTER TYPE "public"."game" ADD VALUE IF NOT EXISTS 'BLACKJACK';

-- Kontrol: 4 satır dönmeli. (Katalogdan okunur — yeni değeri aynı
-- transaction içinde kullanmak Postgres'te yasak.)
SELECT e.enumlabel AS yeni_oyun
FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
WHERE t.typname = 'game'
  AND e.enumlabel IN ('ROULETTE', 'SLOT_CLASSIC', 'SLOT_BAZAAR', 'BLACKJACK');

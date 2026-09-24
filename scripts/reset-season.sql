-- ================================================================
-- 106 Casino — OYUNU SIFIRDAN BAŞLATMA
-- ================================================================
-- Railway → Postgres servisi → Data (Query) sekmesine yapıştırıp çalıştırın.
-- Tek transaction: ya hepsi uygulanır ya hiçbiri.
--
-- Silinenler: tüm turlar, para defteri, istatistikler, sıralama, görevler,
-- kazanılmış rozetler, canlı akış, tohum çiftleri.
-- Kalanlar:  kullanıcı hesapları ve oturumlar (kimse yeniden giriş
--            yapmak zorunda kalmaz), rozet TANIMLARI, davet linkleri ve
--            "kim kimi getirdi" kayıtları (davet bir hesaba bağlı, sezona değil).
--
-- Bakiyeler 0'lanır; herkes uygulamayı ilk açtığında günlük 1.000 coin'i
-- alır ve 1. günden seri başlar. Defter bütünlüğü korunur.
--
-- GERİ ALINAMAZ. Kullanıcıları da silmek isterseniz aşağıdaki
-- "TAM SIFIRLAMA" satırının başındaki -- işaretlerini kaldırın.
-- ================================================================

BEGIN;

TRUNCATE
  ledger_entry,
  user_badge,
  user_mission,
  mission,
  feed_event,
  daily_stat,
  daily_claim,
  player_stat,
  round,
  seed_pair,
  admin_audit;

UPDATE "user" SET balance = 0;

-- TAM SIFIRLAMA (hesaplar da silinir, herkes Google ile yeniden giriş yapar):
-- TRUNCATE "session", account, "verificationToken", "user" CASCADE;

COMMIT;

-- Kontrol: hepsi 0 dönmeli.
SELECT
  (SELECT count(*) FROM round)        AS turlar,
  (SELECT count(*) FROM ledger_entry) AS defter,
  (SELECT count(*) FROM player_stat)  AS istatistik,
  (SELECT coalesce(sum(balance), 0) FROM "user") AS toplam_bakiye;

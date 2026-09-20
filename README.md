# 106 Casino

Ofis içi, gerçek para içermeyen sosyal oyun platformu. Google Workspace
(`106dijital.com`) girişi, 8 oyun, herkese günlük 1.000 coin, ortak
sıralama tablosu.

Tam şartname: [`docs/SPEC.md`](docs/SPEC.md)

## Durum

- [x] Oyun matematiği — 8 oyun, tam %95 RTP (Monte Carlo + tam sayım ile doğrulandı)
- [x] Provably fair RNG motoru (`src/lib/games/`)
- [x] Veritabanı şeması + migration (`src/db/`, `drizzle/`)
- [x] Google girişi + domain kontrolü, ekonomi, cüzdan, `/api/me`
- [ ] Oyun API uçları (tek adımlı + Crash/Hilo)
- [ ] Oyun arayüzleri ve ana sayfa
- [ ] Backoffice + provably fair doğrulama sayfası
- [ ] Deploy (Vercel + Railway)

## Kurulum

```bash
npm install
cp .env.example .env     # değerleri doldur
npm run db:migrate       # şemayı veritabanına uygula
npm run dev
```

## Komutlar

```bash
npm run dev               # geliştirme sunucusu
npm run build             # üretim derlemesi
npm run typecheck         # tip kontrolü

npm test                  # cüzdan + ekonomi entegrasyon testleri (gömülü Postgres)
npm run verify:migration  # migration'ı gerçekten çalıştırıp doğrula
npm run sim               # RTP Monte Carlo doğrulaması (32 yapılandırma)
npm run verify:hilo       # Higher/Lower tam permütasyon sayımı
npm run calibrate         # Plinko ödeme tablolarını yeniden üret

npm run db:generate       # şema değişince yeni migration üret
```

Testler ve doğrulamalar veritabanı sunucusu gerektirmez — PGlite ile
Postgres motoru süreç içinde çalışır.

## Yığın

Next.js 15 · TypeScript · Tailwind v4 · Auth.js v5 (Google) · Drizzle ORM ·
Railway (Postgres + Redis) · Vercel

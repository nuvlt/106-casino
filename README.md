# 106 Casino

Ofis içi, gerçek para içermeyen sosyal oyun platformu. Google Workspace
(`106dijital.com`) girişi, 8 oyun, herkese günlük 1.000 coin, ortak
sıralama tablosu.

Tam şartname: [`docs/SPEC.md`](docs/SPEC.md)

## Durum

- [x] Oyun matematiği — 8 oyun, tam %95 RTP (Monte Carlo + tam sayım ile doğrulandı)
- [x] Provably fair RNG motoru (`src/lib/games/`)
- [x] Veritabanı şeması (`prisma/schema.prisma`)
- [ ] Next.js iskeleti, auth, API uçları
- [ ] Oyun arayüzleri
- [ ] Backoffice
- [ ] Deploy (Vercel + Railway)

## Geliştirme

```bash
npm install
npm run sim              # RTP Monte Carlo doğrulaması
npm run verify:hilo      # Higher/Lower tam sayım doğrulaması
npm run calibrate        # Plinko ödeme tablolarını yeniden üret
npm run validate:schema  # Prisma şemasını doğrula
```

## Yığın

Next.js 15 · TypeScript · Tailwind · Auth.js v5 (Google) · Prisma ·
Railway (Postgres + Redis) · Vercel

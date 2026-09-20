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
- [x] Sekiz oyunun API uçları, rozetler, günlük görev ilerlemesi
- [x] Ana sayfa (oyun ızgarası, sıralama, canlı akış, görevler)
- [x] Şans Çarkı ve Crash arayüzleri
- [ ] Kalan altı oyunun arayüzü
- [ ] Backoffice + provably fair doğrulama sayfası
- [ ] Deploy (Vercel + Railway)

## Hızlı başlangıç — hiçbir kurulum gerekmez

Veritabanı, Google hesabı, Railway, Docker: hiçbiri gerekmiyor.

```bash
npm install
cat > .env <<'EOF'
DATABASE_URL=pglite://memory
AUTH_SECRET=yerel-gelistirme-anahtari
ALLOWED_DOMAIN=106dijital.com
ADMIN_EMAILS=onur@106dijital.com
CRON_SECRET=yerel-cron
DEV_LOGIN=1
EOF
npm run dev
```

Sonra tarayıcıda:

1. `http://localhost:3000/api/dev/login?email=onur@106dijital.com&name=Onur`
   → oturum açılır (Google gerekmez, yalnızca yerelde çalışır)
2. `http://localhost:3000/api/me` → bakiye, seri, görevler
3. Oyun oynamak için (örnek):

```bash
curl -X POST http://localhost:3000/api/games/wheel/bet \
  -H 'Content-Type: application/json' -b cookies.txt \
  -d '{"bet":10000,"idempotencyKey":"deneme-1"}'
```

Postgres süreç içinde (WASM) çalışır ve sunucu kapanınca sıfırlanır —
her açılışta temiz 1.000 coin. Kalıcı istersen `pglite://.pglite`.

## Railway ile kurulum (üretim)

```bash
cp .env.example .env     # Railway değerlerini doldur
npm run db:migrate       # şemayı veritabanına uygula
npm run build && npm start
```

## Komutlar

```bash
npm run dev               # geliştirme sunucusu
npm run build             # üretim derlemesi
npm run typecheck         # tip kontrolü

npm test                  # cüzdan + ekonomi testleri (gömülü Postgres, 19 kontrol)
npm run test:games        # oyun akışı testleri (30 kontrol)
npm run test:stale        # yarım kalmış Crash turları (7 kontrol)
npm run test:all          # hepsi
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

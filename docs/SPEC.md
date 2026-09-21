# 106 Casino — Teknik Şartname

Ofis içi, gerçek para içermeyen sosyal oyun platformu.
Google Workspace (`106dijital.com`) girişi, 8 oyun, ortak sıralama tablosu.

| | |
|---|---|
| Hedef kitle | ~25 kişi, tek şirket |
| Para | Sanal coin. Gerçek para, satın alma veya transfer **yok** |
| RTP | Sekiz oyunun tamamı **tam %95** (aşağıda kanıtlanıyor) |
| Barındırma | Arayüz Vercel · Veritabanı ve Redis Railway · Kod GitHub |

---

## 1. Kimlik doğrulama

Auth.js v5, tek sağlayıcı: Google.

```ts
// auth.ts — signIn callback
const ALLOWED_DOMAIN = "106dijital.com";

async signIn({ profile }) {
  // hd claim'i Workspace tarafından imzalanır; e-posta metnine güvenilmez.
  if (profile?.hd !== ALLOWED_DOMAIN) return false;
  if (profile.email_verified !== true) return false;
  return true;
}
```

Neden `hd` ve neden e-posta sonundaki metne bakılmıyor: `email` alanı
`birisi@106dijital.com.saldirgan.com` gibi bir değerle taklit edilebilir;
`hd` (hosted domain) claim'ini yalnızca Google Workspace üretir.

- Oturum: JWT değil **veritabanı oturumu** — askıya alınan kullanıcı anında düşer.
- `ADMIN_EMAILS` ortam değişkenindeki adresler ilk girişte `ADMIN` rolü alır.
- Kullanıcı adı, Google profilinden gelen **ad soyad** olarak gösterilir (sıralamada da).
- Şirket dışı davetli gerekirse: `GUEST_EMAILS` allowlist'i (şimdilik boş).

---

## 2. Ekonomi

### 2.1 Para birimi

Bakiye ve bahisler veritabanında **tam sayı centicoin** (1 coin = 100 centicoin).
Para hiçbir yerde ondalık sayı değildir; yuvarlama hatası birikemez.

### 2.2 Günlük sıfırlama — biriktirme yok

Her gün **00:00 Europe/Istanbul**'da her oyuncunun bakiyesi **1.000 coin**'e
**set edilir** (eklenmez).

Bunun sebebi matematiksel: RTP %95 iken coin biriktirilebilseydi, hiç
oynamayan kişi hafta sonunda 7.000 coin ile otururken çok oynayan kişinin
bakiyesi her çevirimde %5 erirdi. Sıralama "en çok kim oynamadı" tablosuna
dönerdi. Kullan-ya-da-kaybet modeli bunu tersine çevirir: iflas eden ertesi
gün sıfırdan başlar, oynamayan hiçbir avantaj elde etmez.

| Olay | Etki |
|---|---|
| Günlük sıfırlama | Bakiye = 1.000 coin |
| Seri bonusu | Üstüne eklenir (aşağıda) |
| Görev ödülü | Üstüne eklenir, gün içinde |

### 2.3 Giriş serisi

Art arda giriş yapılan gün sayısına göre, günlük hakkın **üstüne**:

| Gün | 1 | 2 | 3 | 4 | 5 | 6 | 7+ |
|---|---|---|---|---|---|---|---|
| Ekstra | — | +100 | +200 | +350 | +500 | +750 | **+1.500** |

Bir gün kaçırılırsa seri 1'e döner. Ayda bir "seri dondurma" hakkı
(v2 için not edildi, ilk sürümde yok).

### 2.4 Günlük görevler

Her gün 3 görev üretilir (gece yarısı cron ile). Örnekler:

- 3 farklı oyun oyna → +150 coin
- 25 tur oyna → +200 coin
- Üst üste 5 tur kazan → +300 coin
- Herhangi bir oyunda 10x yakala → +400 coin
- Gün içinde toplam 2.000 coin çevir → +250 coin

İlerleme her tur sonunda aynı transaction içinde güncellenir; ödül
oyuncu "Topla" dediğinde ledger'a yazılır.

### 2.5 Rozetler

Kalıcı, profilde görünen başarımlar. Bir kez kazanılır.

| Rozet | Koşul |
|---|---|
| İlk Kan | İlk turunu oyna |
| Turist | Sekiz oyunun hepsini dene |
| Yüz Kat | Tek turda 100x veya üzeri yakala |
| Bin Kat | Tek turda 1000x veya üzeri yakala |
| Küllerinden | 50 coin altına düşüp aynı gün 3.000 coin üzerine çık |
| Demir Leblebi | 7 gün üst üste giriş yap |
| Günün Kralı | Bir günü sıralamanın tepesinde bitir |
| Cesur Yürek | Tek turda bakiyenin tamamını yatır ve kazan |
| Maraton | 1.000 tur oyna |

---

## 3. Sıralama tablosu

Ana sayfadaki tablo **zirve bakiye** ile sıralanır: sezon boyunca
ulaşılan en yüksek bakiye. Crash'te 8.400'e çıkıp hepsini kaybeden
oyuncunun tablosunda **8.400** yazar.

Bu ölçüt kasıtlı seçildi — anlık bakiye ile sıralamak %95 RTP altında
risk almayı cezalandırır, zirve bakiye ise ödüllendirir.

Yan tablolar (ana sayfada sekmeli):

- **Günün Kralı** — bugünün zirve bakiyesi, her gece sıfırlanır
- **En Büyük Çarpan** — tek turda yakalanan en yüksek çarpan
- **En Büyük Vurgun** — tek turda kazanılan en yüksek tutar
- **En Çok Oynayan** — toplam çevrim

Sıralama Redis'te 30 saniyelik önbellekte tutulur; 25 kişi için
veritabanı sorgusu da yeterli olurdu ama akış olayları sık geliyor.

---

## 4. Canlı kazanç akışı

Ana sayfanın üstünde akan şerit:

> **Mehmet Y.** Crash'te **47.20x** yaptı · 2 dk önce

- Son 20 olay + "en güzel anlar" olarak sabitlenmiş 5 olay.
- Eşik: çarpan ≥ 5x **veya** kazanç ≥ 500 coin.
- 25 kişilik bir ortamda websocket'e gerek yok — 5 saniyelik polling yeterli
  (Vercel'de kalıcı bağlantı zaten sorunlu).

---

## 5. Oyun matematiği

Sekiz oyunun tamamı **%95 RTP**. Volatilite kasıtlı olarak farklı:
Crash ve Plinko sıralamayı hareketlendirir, Dice ve Higher/Lower dengeli oynanır.

Tüm ödeme tabloları `src/lib/games/config.ts` içinde, tam sayı "yüzde birlik"
çarpanlar olarak durur. Ödeme her zaman `floor(bahis × çarpan / 100)`.

### 5.1 Lucky Wheel

Ağırlıklar 10.000 üzerinden. `Σ(ağırlık × çarpan) = 9.500` → tam %95.

| Çarpan | 0x | 0.5x | 1x | 2x | 5x | 10x | 50x |
|---|---|---|---|---|---|---|---|
| Olasılık | %38,80 | %26,00 | %18,00 | %12,00 | %4,00 | %1,00 | %0,20 |

Herhangi bir kazanç olasılığı %61,2.

### 5.2 Crash

Çöküş noktası `P(C ≥ m) = 0,95 / m` olacak şekilde üretilir:

```
u ~ U[0,1)
u < 0,05          → çöküş = 1.00x   (anında patlama)
aksi halde v = (u − 0,05)/0,95;  çöküş = floor(100 / (1 − v)) / 100
```

Bu dağılımda **hangi çarpanda çekilirse çekilsin** beklenen değer
`m × 0,95/m = 0,95`. Yani oyuncunun stratejisi RTP'yi değiştiremez.

Eğri: `m(t) = e^(ln2/5 · t)` — 5 saniyede 2x, ~16,6 saniyede 10x.
Tavan 10.000x.

**Kritik güvenlik notu:** çekim isteği geldiğinde çarpanı istemci değil
**sunucu** hesaplar (`tur başlangıç zaman damgası` → geçen süre → çarpan).
İstemci "ben 12x'te bastım" diyemez.

**Tolerans yoktur — ve bu bilinçli bir düzeltmedir.** Bu şartnamenin ilk
halinde "ağ gecikmesi için 150 ms tolerans" yazıyordu. Bu sömürülebilir
bir açıktı: oyuncu çöküşü ekranda gördükten sonra 150 ms içinde istek
atarsa, sunucu çarpanı çöküşten 150 ms öncesine göre hesaplayıp kabul
ederdi — basit bir betikle neredeyse her tur kazanılabilirdi.

Yerine iki yol var:
- **Manuel çekim:** sunucunun isteği aldığı an esastır. Gecikme herkes
  için aynı yönde çalışır.
- **Otomatik çekim:** hedef tur BAŞINDA, çöküş noktası bilinmeden yazılır.
  Sonuç zamandan tamamen bağımsız hesaplanır; gecikmeden hiç etkilenmez.

Entegrasyon testi bu açığın kapalı olduğunu doğrular: çöküşü geçmiş bir
tura yapılan çekim kazanç saymaz, 10 dakika geçmiş otomatik çekim ise
hedefinden öder.

### 5.3 Dice

0,00–99,99 arası 10.000 eşit olasılıklı sonuç. Oyuncu kazanan sonuç
sayısını (W) seçer:

```
ödeme = floor(bahis × 9500 / W)      EV = (W/10000) × (9500/W) = 0,95
```

Aralık: %1 şans (95,00x) ↔ %95 şans (1,00x). Her noktada tam %95.

### 5.4 Plinko

Binom dağılımı, 8/12/16 sıra × düşük/orta/yüksek risk = 9 tablo.
Tablolar `scripts/calibrate-plinko.ts` ile üretildi; hepsi **simetrik**,
**monoton** ve `Σ C(n,k)·m_k = 95·2^n` eşitliğini **tam** sağlıyor.

Örnek — 16 sıra, yüksek risk:

```
271.08x  118.57  45.70  14.87  3.85  0.78  0.22  0.17  0.16  0.17 ...
```

### 5.5 Scratch Card

3×3 kazı-kazan. Sonuç **önce** belirlenir, ızgara sonuca uygun kurulur
(kazanan semboldan tam 3 tane, diğerlerinden en fazla 2).

| Çarpan | 0x | 0.5x | 1x | 2x | 5x | 10x | 25x | 100x |
|---|---|---|---|---|---|---|---|---|
| Olasılık | %50,62 | %25,00 | %12,00 | %6,00 | %4,00 | %1,80 | %0,50 | %0,08 |

### 5.6 Number Guess

1–10 arası bir sayı. Oyuncu k tane sayı seçer:

```
ödeme = floor(bahis × 9500 / (1000 × k))     →  k=1 için 9,50x
```

### 5.7 Mystery Boxes

9 kutu bağımsız olarak doldurulur, oyuncu birini seçer, tur sonunda
hepsi açılır ("ne kaçırdım?" etkisi). Üç kasa seviyesi — aynı RTP,
çok farklı volatilite:

| Kasa | En yüksek | Kazanma olasılığı |
|---|---|---|
| Bronz | 3x | %77,5 |
| Gümüş | 50x | %40,9 |
| Altın | **500x** | %15,25 |

### 5.8 Higher / Lower

Karılmış 52 kartlık deste, **beraberlik yok** (eşit rank'te suit sırası karar verir).

Ev avantajı **yalnızca ilk adımda** uygulanır (×0,95); sonraki adımlar
matematiksel olarak **tam adil** (1/p) öder.

Bunun sonucu: oyuncu ister 1 adımda çeksin ister 20 adım gitsin, ister
kolay ister zor tarafı seçsin — **turun RTP'si her zaman tam %95**.
Adım başına avantaj uygulansaydı 5 adımlık bir zincirin RTP'si
0,95⁵ = %77'ye düşerdi; bu tasarım onu engeller.

### 5.9 Doğrulama sonuçları

**Monte Carlo** — yapılandırma başına 1.000.000 tur, toplam **32 milyon tur**.
Ölçülen sapmalar örneklem hatasına göre değerlendirilir (`|z| ≤ 4`);
32 yapılandırmanın tamamı geçti.

```
OYUN            VARYANT                   TEORİK     ÖLÇÜLEN    ±SH      z      SONUÇ
Lucky Wheel     —                        95.0000%   95.0140%   0.262    0.05      ✓
Crash           oto. çekim 1.01x         95.0000%   94.9855%   0.024   -0.61      ✓
Crash           oto. çekim 2.00x         95.0000%   95.0598%   0.100    0.60      ✓
Crash           oto. çekim 100.00x       95.0000%   96.1000%   0.976    1.13      ✓
Dice            %1.00 şans / under       95.0000%   93.4420%   0.938   -1.66      ✓
Dice            %95.00 şans / under      95.0000%   94.9763%   0.022   -1.08      ✓
Plinko          high / 16 sıra           95.0000%   94.6939%   0.452   -0.68      ✓
Scratch Card    —                        95.0000%   94.6681%   0.361   -0.92      ✓
Number Guess    1 sayı seçili            95.0000%   94.8680%   0.285   -0.46      ✓
Mystery Boxes   gold                     95.0000%   94.9310%   1.228   -0.06      ✓
Higher / Lower  4 adım / best            95.0000%   94.9857%   0.167   -0.09      ✓
                                                    (32 satırın tamamı için: npm run sim)
```

Çöküş dağılımı ayrıca doğrudan sınandı:
`P(C ≥ 2x)` ölçülen 0,47564 / teorik 0,47500 · `P(C ≥ 10x)` ölçülen 0,09492 / teorik 0,09500.

**Tam sayım** — Higher/Lower'ın derin zincirleri Monte Carlo ile ölçülemez
(kazanma olasılığı milyonda birlere iner). Bunun yerine 8 kartlık desteyle
**40.320 permütasyonun tamamı** oynandı, 7 derinliğe kadar 4 farklı strateji için:

```
adım  strateji      kesin RTP        sapma
   1  best         94.9999607143%  -3.93e-5 pp
   4  worst        94.9999961905%  -3.81e-6 pp
   7  alternate    94.9999935863%  -6.41e-6 pp
```

Kalan sapma tamamen `floor()` yuvarlamasından; yüz binde bir puan mertebesinde.

Çalıştırmak için:

```bash
npm run sim            # Monte Carlo — 32 yapılandırma
npm run verify:hilo    # Higher/Lower tam sayım
npm run calibrate      # Plinko tablolarını yeniden üret
```

---

## 5.10 Yerel geliştirme — hiçbir dış servise bağlı değil

`DATABASE_URL=pglite://memory` verildiğinde Postgres'in WASM'a derlenmiş
tam sürümü süreç içinde çalışır; Railway, Docker veya kurulu bir veritabanı
gerekmez. Şema ilk istekte otomatik uygulanır, rozet tanımları yazılır.

`DEV_LOGIN=1` ile `/api/dev/login` ucu açılır ve Google OAuth kurmadan
oturum açılabilir. Bu uç üç koşul birden sağlanmazsa **404** döner:
`NODE_ENV === "development"`, `DEV_LOGIN === "1"` ve isteğin localhost'tan
gelmesi. Üretim derlemesinde hiçbir koşulda çalışmaz.

---

## 6. Provably fair

Her turun sonucu üç girdiden üretilir:

```
sonuç = HMAC_SHA256(serverSeed, "clientSeed:nonce:cursor")
```

| Girdi | Kim belirler | Ne zaman görünür |
|---|---|---|
| `serverSeed` | Sunucu (32 rastgele byte) | **Yalnız seed döndürüldükten sonra** |
| `serverSeedHash` | `sha256(serverSeed)` | Bahisten **önce** |
| `clientSeed` | Oyuncu, istediği zaman değiştirir | Her zaman |
| `nonce` | Tur sayacı | Her zaman |

Akış:

1. Kullanıcıya aktif `serverSeedHash` gösterilir — bu bir **taahhüt**.
2. Oyuncu oynar; her tur `nonce`'u 1 artırır.
3. Oyuncu "Tohumu döndür" der → eski `serverSeed` **açılır**, yeni çiftin
   hash'i yayınlanır.
4. `/dogrula` sayfasında oyuncu eski seed + kendi client seed + nonce ile
   geçmiş turlarını **kendi tarayıcısında** yeniden hesaplar.

Sunucu, sonucu gördükten sonra seed'i değiştiremez; çünkü hash'i bahisten
önce yayınlanmıştır. Bu, "Onur sistemi ayarlamış" şakasının önünü
matematiksel olarak keser — ki bir ofis oyununda asıl değeri budur.

Doğrulama sayfası **aynı `src/lib/games/engine.ts` kodunu** kullanır;
"sunucu başka, doğrulayıcı başka hesaplıyor" ihtimali yoktur.

---

## 7. Güvenlik katmanı

Gerçek para yok ama sıralama var — yani manipülasyon güdüsü var.

### 7.1 Sunucu otoritesi

- Tüm oyun mantığı `/api` route handler'larında. **Hiçbir sonuç istemcide üretilmez.**
- İstemci yalnızca sunucunun döndürdüğü sonucu **animasyonla oynatır**.
- `Round.secret` (crash çöküş noktası, hilo destesi, kazı-kazan ızgarası)
  API yanıtına **asla** konmaz; tur kapanana kadar veritabanında bekler.

### 7.2 Atomik bakiye

Her bahis tek bir transaction:

```sql
UPDATE "user" SET balance = balance - $bet
 WHERE id = $userId AND balance >= $bet AND suspended_at IS NULL
RETURNING balance;
-- 0 satır döndüyse: yetersiz bakiye → tur açılmaz
```

Koşullu `UPDATE` sayesinde eşzamanlı iki istek çift harcama yapamaz.
Ardından sonuç hesaplanır, alacak yazılır, `LedgerEntry` kaydı düşülür —
hepsi aynı transaction içinde.

### 7.3 Idempotency

Her bahis isteği istemciden bir `Idempotency-Key` taşır (`round.idempotency_key`
üzerinde tekil kısıt). Ağ tekrarı veya çift tık ikinci turu açmaz, ilkinin
sonucunu döndürür. Entegrasyon testiyle doğrulanmıştır.

### 7.3b Test edilmiş güvence — oyun akışı

`npm run test:games` gömülü Postgres'e karşı 30 kontrol çalıştırır:
açık tur kilidi (Crash açıkken ikinci bahis engellenir), Crash çarpanının
sunucu saatinden hesaplanması, çöküş sonrası çekimin kazanç saymaması,
otomatik çekimin zamandan bağımsızlığı, aynı turun iki kez ödenememesi,
Higher/Lower'da ilk adımın ev avantajı (×0,95) ve sonraki adımların tam
adil (1/p) ödemesi, süresi geçen turların kapatılması, rozet ve görev
ilerlemesinin turla aynı transaction'da yazılması.

Ayrıca uçlar gerçek HTTP üzerinden denendi: hız sınırı 5 istekten sonra
429 veriyor, doğrulama hataları doğru kodlarla dönüyor, `serverSeed`
hiçbir yanıtta geçmiyor, Crash'in çöküş noktası tur kapanana kadar
sızmıyor, Higher/Lower'ın destesi hiç görünmüyor.

### 7.3c Test edilmiş güvence

`npm test` gömülü bir Postgres motoruna (PGlite) karşı 19 kontrol çalıştırır:
günlük hakkın bir kez verilmesi, bakiyenin biriktirilmemesi, yetersiz
bakiyenin reddi, idempotency anahtarının ikinci turu açmaması, **ledger
toplamının bakiyeyle birebir tutması**, zirve bakiyenin düşüşte korunması ve
`serverSeed`'in istemciye dönen yanıtta hiç geçmemesi. Sahte nesne yok —
gerçek transaction, gerçek kısıtlar.

### 7.4 Doğrulama ve hız sınırı

- Bahis tutarı, oyun parametreleri (zar eşiği, plinko riski, seçilen kutu sayısı)
  sunucuda **zod** ile doğrulanır. İstemciden gelen çarpan **kullanılmaz**, yeniden hesaplanır.
- Min 10 coin / maks 500 coin bahis, sunucuda zorlanır.
- Kullanıcı başına saniyede 5 bahis (Redis sliding window). Aşımda 429.
- Aynı anda en fazla 1 açık (`OPEN`) tur — ikinci bir Crash başlatılamaz.

### 7.5 Crash'e özel

Çekim isteği geldiğinde sunucu `now - round.createdAt` farkından çarpanı
kendisi hesaplar ve `crashPoint` ile karşılaştırır. İstemcinin gönderdiği
çarpan yok sayılır. Ağ gecikmesi için 150 ms tolerans tanınır.

`OPEN` kalan turlar (sekme kapandı, tarayıcı çöktü) `expiresAt` sonrası
cron ile kaybedilmiş olarak kapatılır.

### 7.6 Denetlenebilirlik

- `ledger_entry` **append-only** — güncellenmez, silinmez. Her satırda
  `balanceAfter` var; bakiye ile ledger toplamı her zaman mutabık olmalı.
- Yöneticinin yaptığı her bakiye müdahalesi `AdminAudit`'e yazılır.
  Kendini de denetlenebilir yapmak, güvenin asıl kaynağı.

---

## 8. API yüzeyi

```
POST /api/games/:game/bet        tek adımlı oyunlar — bahis + sonuç
POST /api/games/crash/start      turu aç (çöküş noktası gizli üretilir)
POST /api/games/crash/cashout    sunucu saatiyle çarpanı doğrula ve öde
POST /api/games/hilo/start       deste karılır
POST /api/games/hilo/step        tek adım
POST /api/games/hilo/cashout     birikmiş çarpanı öde

GET  /api/me                     bakiye, seri, görevler, rozetler
POST /api/me/claim-daily         günlük hak + seri bonusu
POST /api/me/missions/:id/claim  görev ödülü
POST /api/me/seed/rotate         tohum döndür (eski serverSeed açılır)

GET  /api/leaderboard?scope=...  season | today | multiplier | wagered
GET  /api/feed                   canlı kazanç akışı

GET  /api/admin/transactions     filtrelenebilir ledger
GET  /api/admin/users
POST /api/admin/users/:id/adjust bakiye müdahalesi (denetim kaydıyla)
POST /api/admin/users/:id/suspend
POST /api/admin/rounds/:id/void
GET  /api/admin/reconcile        bakiye ↔ ledger mutabakatı
```

---

## 9. Backoffice

`/admin`, yalnız `ADMIN` rolü. Kapsam bilinçli olarak dar:

- **İşlemler** — tüm ledger; kullanıcı, oyun, tür, tarih filtresi; CSV dışa aktarım.
- **Kullanıcılar** — bakiye, zirve, toplam çevrim, son görülme; askıya alma.
- **Turlar** — tur detayı, seed bilgisi, `secret` alanı (kapanmış turlar için).
- **Mutabakat** — `Σ ledger.amount == user.balance` kontrolü, sapma varsa kırmızı.
- **Sağlık** — günlük sıfırlama cron'u çalıştı mı, açık kalan tur var mı.

---

## 9.1 Ses

Ses **dosyası yok** — efektler Web Audio ile anlık sentezleniyor
(`src/lib/sound.ts`). Sebepleri: indirilecek varlık olmaması (sayfa
hafif kalıyor), çevrimdışı çalışması, ve çarpana göre tonu değişen
kazanç sesi gibi şeylerin dosyayla mümkün olmaması.

Tarayıcılar ses bağlamını ancak bir kullanıcı hareketinden sonra
başlatmaya izin verdiği için bağlam ilk dokunuşta kurulur. Üst
şeritteki hoparlör düğmesi sesi kapatır; tercih tarayıcıda saklanır.

Efektler: jeton tıkı, çark mandalı (dönüş sonuna doğru yavaşlayan
çıtçıt), kazanç arpeji (çarpan büyüdükçe daha çok nota), kayıp,
roket kalkışı, patlama, çekim zili ve rozet fanfarı.

## 10. Teknik yığın ve dağıtım

| Katman | Seçim |
|---|---|
| Framework | Next.js 15 App Router + TypeScript |
| Arayüz | Tailwind + Framer Motion, **mobile-first** |
| Auth | Auth.js v5, Google, veritabanı oturumu |
| Veritabanı | Railway PostgreSQL + Drizzle ORM (`DIRECT_DATABASE_URL` migration için) |
| Önbellek | Railway Redis — hız sınırı, sıralama, akış |
| Barındırma | Vercel (arayüz + API), cron için Vercel Cron |
| RNG | Node `crypto` — HMAC-SHA256 |

Serverless bağlantı limiti için havuz küçük tutulur (`max: 5`) ve hazır
ifade (prepared statement) kapatılır — pgbouncer'ın transaction pooling
kipiyle uyumluluk için gerekli. Migration ayrı, havuzsuz bağlantı kullanır.

**Neden Prisma değil Drizzle:** Prisma her komutunda (`generate`, `migrate`,
hatta `validate`) `binaries.prisma.sh` üzerinden motor ikilisi indirmeye
çalışıyor ve bu alan adı şirket ağ politikasıyla engelli. Drizzle saf
TypeScript — hiçbir ikili indirmiyor, migration'lar okunabilir düz SQL
dosyaları olarak üretiliyor. Ek kazanç: Prisma'nın ifade edemediği kısmi
tekil indeks (`WHERE active`) doğrudan şemada tanımlanabiliyor.

### Ortam değişkenleri

```
DATABASE_URL=               # Railway Postgres, havuzlu
DIRECT_DATABASE_URL=        # Railway Postgres, doğrudan (migration)
REDIS_URL=                  # Railway Redis
AUTH_SECRET=
AUTH_GOOGLE_ID=
AUTH_GOOGLE_SECRET=
ALLOWED_DOMAIN=106dijital.com
ADMIN_EMAILS=onur@106dijital.com
CRON_SECRET=                # Vercel Cron uçlarını korur
TZ=Europe/Istanbul
```

### Cron işleri

| Ne zaman | Ne yapar |
|---|---|
| Her gün 00:00 TRT | Bakiyeleri 1.000 coin'e sabitle, seriyi güncelle, günlük görevleri üret, `DailyStat` kapat |
| 5 dakikada bir | Süresi geçmiş `OPEN` turları kapat |

---

## 11. Sürüm planı

**Tamamlananlar**
Oyun matematiği (doğrulanmış), provably fair RNG, veritabanı şeması ve
migration, Google girişi + domain kontrolü, ekonomi (günlük hak/seri/görev),
cüzdan ve güvenlik katmanı, rozetler, görev ilerlemesi, `/api/me`,
**sekiz oyunun tamamının API uçları** (tek adımlı altısı + Crash + Hilo),
Railway'e bağlı olmayan yerel geliştirme kipi.

**v1 (ilk sürüm)**
Giriş + ekonomi + 8 oyun + sıralama + akış + görevler + rozetler + backoffice
+ provably fair doğrulama sayfası.

**v2 (konuşulacak)**
- Sezon ve sembolik ödül — açılırsa anti-cheat sıkılaştırılır
- Seri dondurma hakkı
- Ortak canlı Crash turu (Railway'de ayrı websocket servisi gerekir)
- Turnuva modu / haftalık final

**Bilinçli olarak yapılmayacaklar**
- Coin transferi veya hediye etme — gri pazar oluşturur; şirketin
  faaliyet alanı düşünüldüğünde gereksiz bir başlık açar.
- Gerçek parayla herhangi bir bağlantı.

---

## 12. Açık kararlar

1. **Sezon süresi ve ödül** — şimdilik yok. Eklenirse sıralama sıfırlama
   dönemi ve anti-cheat sıkılığı buna göre ayarlanır.
2. **Seri dondurma** — ayda bir hak verilsin mi?
3. **Bahis üst sınırı** — 500 coin makul mü, yoksa "hepsini yatır" serbest mi olsun?
   (Cesur Yürek rozeti üst sınırı varsayıyor.)

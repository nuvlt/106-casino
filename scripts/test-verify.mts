/**
 * Tarayıcı doğrulayıcısı ile sunucu motoru aynı sonucu veriyor mu?
 *
 * Doğrulama sayfasının tek değeri bu: oyuncunun tarayıcısında dönen
 * hesap, sunucunun yaptığının BİREBİR aynısı olmalı. Sunucu node:crypto
 * HMAC akışı kullanıyor, tarayıcı Web Crypto. İkisinin aynı bayt
 * dizisini ürettiğini varsaymak yetmez — burada binlerce tur için
 * karşılaştırılıyor.
 *
 * Node 18+ `globalThis.crypto` olarak Web Crypto sağladığı için
 * tarayıcı yolu burada olduğu gibi çalıştırılabiliyor.
 */

import { rngFor, hashServerSeed, generateServerSeed } from "../src/lib/games/rng.ts";
import {
  resolveDice, resolveGuess, resolveMystery, resolvePlinko, resolveScratch, resolveWheel,
} from "../src/lib/games/engine.ts";
import { recomputeRound, sha256Hex, type RoundParams, type VerifiableGame } from "../src/lib/games/verify.ts";
import { COIN } from "../src/lib/games/config.ts";

let passed = 0, failed = 0;
function check(name: string, ok: boolean, detail = "") {
  if (ok) { console.log(`  ✅ ${name}`); passed++; }
  else { console.log(`  ❌ ${name}${detail ? ` — ${detail}` : ""}`); failed++; }
}

const serverSeed = generateServerSeed();
const clientSeed = "dogrulama-testi";
const bet = 50 * COIN;

console.log("\nHash taahhüdü");
check("Web Crypto sha256 = node sha256",
  (await sha256Hex(serverSeed)) === hashServerSeed(serverSeed));

/** Sunucunun yaptığı: node HMAC akışı + aynı çözücü. */
function serverSide(game: VerifiableGame, nonce: number, p: RoundParams) {
  const rng = rngFor(serverSeed, clientSeed, nonce);
  switch (game) {
    case "WHEEL": return resolveWheel(rng, p.bet);
    case "DICE": return resolveDice(rng, p.bet, p.winOutcomes!, p.mode!);
    case "PLINKO": return resolvePlinko(rng, p.bet, p.risk!, p.rows!);
    case "SCRATCH": return resolveScratch(rng, p.bet);
    case "GUESS": return resolveGuess(rng, p.bet, p.picks!);
    case "MYSTERY": return resolveMystery(rng, p.bet, p.tier!, p.pick!);
  }
}

const RISKS = ["low", "medium", "high"] as const;
const ROWS = [8, 12, 16] as const;
const TIERS = ["bronze", "silver", "gold"] as const;

const CASES: { game: VerifiableGame; params: (n: number) => RoundParams }[] = [
  { game: "WHEEL", params: () => ({ bet }) },
  { game: "SCRATCH", params: () => ({ bet }) },
  {
    game: "DICE",
    params: (n) => ({ bet, winOutcomes: 100 + ((n * 137) % 9401), mode: n % 2 ? "over" : "under" }),
  },
  {
    game: "PLINKO",
    params: (n) => ({ bet, risk: RISKS[n % 3]!, rows: ROWS[(n >> 1) % 3]! }),
  },
  {
    game: "GUESS",
    params: (n) => ({ bet, picks: Array.from({ length: (n % 9) + 1 }, (_, i) => i + 1) }),
  },
  {
    game: "MYSTERY",
    params: (n) => ({ bet, tier: TIERS[n % 3]!, pick: n % 9 }),
  },
];

const PER_GAME = 400;
console.log(`\nHer oyun için ${PER_GAME} tur yeniden hesaplanıyor`);

for (const c of CASES) {
  let mismatch: string | null = null;
  for (let n = 0; n < PER_GAME && !mismatch; n++) {
    const p = c.params(n);
    const server = serverSide(c.game, n, p);
    const browser = await recomputeRound({
      game: c.game, serverSeed, clientSeed, nonce: n, params: p,
    });
    if (
      server.payout !== browser.payout ||
      server.mult !== browser.mult ||
      JSON.stringify(server.detail) !== JSON.stringify(browser.detail)
    ) {
      mismatch = `nonce ${n}: sunucu ${JSON.stringify(server)} / tarayıcı ${JSON.stringify(browser)}`;
    }
  }
  check(`${c.game}: ${PER_GAME} turun hepsi birebir aynı`, mismatch === null, mismatch ?? "");
}

console.log("\nVeritabanındaki kayıt biçiminden doğrulama");
// GERÇEK BİR HATAYDI: `params` sütunu bahsi içermez — bahis turun
// kendi `bet` sütununda durur. Doğrulama sayfası ikisini birleştirmeyi
// unutunca çözücüye bet=undefined gidiyor ve HER tur "uyuşmadı"
// görünüyordu. Bu bölüm tam olarak sayfanın izlediği yolu taklit eder:
// params (bahissiz) + bet sütunu.
{
  let mismatch: string | null = null;
  for (const c of CASES) {
    for (let n = 0; n < 25 && !mismatch; n++) {
      const full = c.params(n);
      const { bet: betCol, ...storedParams } = full; // sunucunun yazdığı hâli
      const server = serverSide(c.game, n, full);
      const browser = await recomputeRound({
        game: c.game, serverSeed, clientSeed, nonce: n,
        params: { ...storedParams, bet: betCol }, // sayfanın yaptığı birleştirme
      });
      if (server.payout !== browser.payout || server.mult !== browser.mult) {
        mismatch = `${c.game} nonce ${n}`;
      }
    }
  }
  check("params(bahissiz) + bet sütunu ile doğrulama tutuyor", mismatch === null, mismatch ?? "");

  // Birleştirme unutulursa test bunu FARK ETMELİ.
  const p0 = CASES.find((c) => c.game === "PLINKO")!.params(0);
  const { bet: _drop, ...noBet } = p0;
  const broken = await recomputeRound({
    game: "PLINKO", serverSeed, clientSeed, nonce: 0,
    params: noBet as RoundParams,
  });
  const good = serverSide("PLINKO", 0, p0)!;
  check("bet unutulursa sonuç BOZULUR (hata sessizce geçmez)",
    broken.payout !== good.payout || Number.isNaN(broken.payout),
    `bozuk ${broken.payout} / doğru ${good.payout}`);
}

console.log("\nYanlış tohum yakalanıyor mu");
const wrong = await recomputeRound({
  game: "DICE", serverSeed: generateServerSeed(), clientSeed, nonce: 0,
  params: { bet, winOutcomes: 4750, mode: "under" },
});
const right = serverSide("DICE", 0, { bet, winOutcomes: 4750, mode: "under" })!;
check("başka tohum başka sonuç verir",
  JSON.stringify(wrong.detail) !== JSON.stringify(right.detail));

console.log(`\n${passed} geçti, ${failed} başarısız\n`);
process.exit(failed === 0 ? 0 : 1);

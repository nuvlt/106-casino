/**
 * 106 Casino — RTP doğrulaması (Monte Carlo)
 *
 * Yüksek volatiliteli oyunlarda ölçülen RTP'nin teorik değerden sapması
 * NORMALDİR — önemli olan sapmanın örneklem hatasına göre büyüklüğü.
 * Bu yüzden her satırda z-skoru hesaplanır:
 *
 *     z = (ölçülen − teorik) / standart hata
 *
 * |z| > 4 ise gerçek bir sorun vardır (milyonda 1 ihtimalle yanlış alarm).
 * Aksi halde sapma, oyunun doğal oynaklığıdır.
 *
 * Derin Higher/Lower zincirleri buraya dahil DEĞİLDİR; onlar
 * scripts/verify-hilo.ts ile tam sayım yapılarak kanıtlanır.
 */

import { Rng, generateServerSeed } from "../src/lib/games/rng";
import {
  MYSTERY_TIERS,
  PLINKO_TABLES,
  SCRATCH_PRIZES,
  WHEEL_SEGMENTS,
} from "../src/lib/games/config";
import {
  crashPoint,
  hlCashout,
  hlNewRound,
  hlOdds,
  hlStep,
  resolveCrash,
  resolveDice,
  resolveGuess,
  resolveMystery,
  resolvePlinko,
  resolveScratch,
  resolveWheel,
} from "../src/lib/games/engine";

const BET = 10_000; // 100 coin
const N = Number(process.env.N ?? 500_000);

const SERVER_SEED = generateServerSeed();
const CLIENT_SEED = "106-dijital-rtp-testi";
let nonce = 0;
const nextRng = () => new Rng(SERVER_SEED, CLIENT_SEED, nonce++);

interface Row {
  game: string;
  variant: string;
  theoretical: number;
  measured: number;
  stderr: number;
  z: number;
  maxMult: number;
}
const rows: Row[] = [];

/** Bir yapılandırmayı N tur oynatır, ortalama ve standart hatayı ölçer. */
function run(game: string, variant: string, theoretical: number, play: (rng: Rng) => number) {
  let sum = 0;
  let sumSq = 0;
  let maxMult = 0;
  for (let i = 0; i < N; i++) {
    const ratio = play(nextRng()) / BET;
    sum += ratio;
    sumSq += ratio * ratio;
    if (ratio > maxMult) maxMult = ratio;
  }
  const mean = sum / N;
  const variance = Math.max(0, sumSq / N - mean * mean);
  const stderr = Math.sqrt(variance / N);
  rows.push({
    game,
    variant,
    theoretical,
    measured: mean,
    stderr,
    z: stderr > 0 ? (mean - theoretical) / stderr : 0,
    maxMult,
  });
}

const tableRtp = (t: readonly { mult: number; weight: number }[]) =>
  t.reduce((a, x) => a + (x.weight * x.mult) / 100, 0) / t.reduce((a, x) => a + x.weight, 0);

function binom(n: number, k: number): number {
  let r = 1;
  for (let i = 1; i <= k; i++) r = (r * (n - k + i)) / i;
  return r;
}

console.log(`Yapılandırma başına ${N.toLocaleString("tr-TR")} tur, bahis ${BET / 100} coin\n`);
const started = Date.now();

/* --- LUCKY WHEEL --- */
run("Lucky Wheel", "—", tableRtp(WHEEL_SEGMENTS), (r) => resolveWheel(r, BET).payout);

/* --- CRASH --- */
for (const target of [101, 150, 200, 500, 2000, 10000]) {
  run("Crash", `oto. çekim ${(target / 100).toFixed(2)}x`, 0.95, (r) =>
    resolveCrash(r, BET, target).payout,
  );
}
// Çöküş dağılımının kendisi: P(C ≥ 2.00x) teorik olarak 0.95/2 = 0.4750 olmalı.
{
  let above2 = 0;
  let above10 = 0;
  for (let i = 0; i < N; i++) {
    const c = crashPoint(nextRng());
    if (c >= 200) above2++;
    if (c >= 1000) above10++;
  }
  console.log(
    `Çöküş dağılımı kontrolü — P(C≥2x): ölçülen ${(above2 / N).toFixed(5)} / teorik 0.47500` +
      `   |   P(C≥10x): ölçülen ${(above10 / N).toFixed(5)} / teorik 0.09500\n`,
  );
}

/* --- DICE --- */
for (const [w, mode] of [[100, "under"], [950, "under"], [4750, "over"], [9500, "under"]] as const) {
  run("Dice", `%${(w / 100).toFixed(2)} şans / ${mode}`, 0.95, (r) =>
    resolveDice(r, BET, w, mode).payout,
  );
}

/* --- PLINKO --- */
for (const key of Object.keys(PLINKO_TABLES)) {
  const [risk, rowsStr] = key.split("_") as ["low" | "medium" | "high", string];
  const nRows = Number(rowsStr) as 8 | 12 | 16;
  const table = PLINKO_TABLES[key]!;
  const theo = table.reduce((a, m, k) => a + (binom(nRows, k) * m) / 100, 0) / 2 ** nRows;
  run("Plinko", `${risk} / ${nRows} sıra`, theo, (r) => resolvePlinko(r, BET, risk, nRows).payout);
}

/* --- SCRATCH --- */
run("Scratch Card", "—", tableRtp(SCRATCH_PRIZES), (r) => resolveScratch(r, BET).payout);

/* --- NUMBER GUESS --- */
for (const k of [1, 3, 5, 9]) {
  const picks = Array.from({ length: k }, (_, i) => i + 1);
  run("Number Guess", `${k} sayı seçili`, 0.95, (r) => resolveGuess(r, BET, picks).payout);
}

/* --- MYSTERY --- */
let boxCursor = 0;
for (const tier of ["bronze", "silver", "gold"] as const) {
  run("Mystery Boxes", tier, tableRtp(MYSTERY_TIERS[tier]), (r) =>
    resolveMystery(r, BET, tier, boxCursor++ % 9).payout,
  );
}

/* --- HIGHER / LOWER (yalnız sığ zincirler; derinler tam sayımla kanıtlanır) --- */
for (const [steps, pick] of [[1, "best"], [1, "worst"], [2, "best"], [4, "best"]] as const) {
  run("Higher / Lower", `${steps} adım / ${pick}`, 0.95, (rng) => {
    let state = hlNewRound(rng);
    for (let s = 0; s < steps; s++) {
      const odds = hlOdds(state);
      let guess: "higher" | "lower";
      if (odds.higher === 0) guess = "lower";
      else if (odds.lower === 0) guess = "higher";
      else if (pick === "best") guess = odds.higher >= odds.lower ? "higher" : "lower";
      else guess = odds.higher < odds.lower ? "higher" : "lower";
      const r = hlStep(state, guess);
      if (!r.won) return 0;
      state = r.state;
    }
    return hlCashout(state, BET).payout;
  });
}

/* ---------------------------- rapor ---------------------------- */
const pad = (s: string, n: number) => s.padEnd(n);
console.log(
  pad("OYUN", 16) + pad("VARYANT", 24) + "  TEORİK     ÖLÇÜLEN    ±SH      z       EN YÜKSEK  SONUÇ",
);
console.log("-".repeat(104));

let failed = 0;
for (const r of rows) {
  const ok = Math.abs(r.z) <= 4;
  if (!ok) failed++;
  console.log(
    pad(r.game, 16) +
      pad(r.variant, 24) +
      (r.theoretical * 100).toFixed(4).padStart(8) +
      "%" +
      (r.measured * 100).toFixed(4).padStart(10) +
      "%" +
      (r.stderr * 100).toFixed(3).padStart(8) +
      r.z.toFixed(2).padStart(8) +
      (r.maxMult.toFixed(2) + "x").padStart(12) +
      (ok ? "   ✓" : "   ✗ SAPMA"),
  );
}
console.log("-".repeat(104));
console.log(
  `${(rows.length * N).toLocaleString("tr-TR")} tur — ${failed === 0 ? "tüm oyunlar teorik RTP ile uyumlu" : `${failed} yapılandırmada anlamlı sapma`} — ` +
    `${((Date.now() - started) / 1000).toFixed(1)} sn`,
);
console.log("SH = standart hata. |z| ≤ 4 → sapma örneklem gürültüsüyle açıklanıyor.");
process.exit(failed === 0 ? 0 : 1);

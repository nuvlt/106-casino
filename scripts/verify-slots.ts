/**
 * Rulet, Klasik 777 ve Kapalıçarşı — KESİN RTP hesabı (simülasyon değil).
 *
 * Rulet   : her bahis türü için kazanan cep sayısı × ödeme / 38.
 * Klasik  : ağırlıklı sonuç tablosu; ayrıca 216 dizilimin hepsi
 *           classicClassOf ile sınıflanıp tablodaki sınıflarla örtüştüğü
 *           (her sınıfın en az bir görüntüsü olduğu) kontrol edilir.
 * Kapalıçarşı:
 *   • Hücreler bağımsız → tek çizginin beklenen ödemesi, 1. makaradaki
 *     sembol ve ardışık "aynı ya da joker" uzunluğu üzerinden kapalı
 *     biçimde toplanır. Çizgiler aynı hücreleri paylaşsa da beklenti
 *     doğrusaldır: toplam = çizgi sayısı × tek çizgi.
 *   • Anahtar sayısı: 15 bağımsız hücrenin evrişimi.
 *   • Bedava dönüş: oynanan dönüş sayısı N bir durma zamanı olduğundan
 *     (Wald özdeşliği) E[toplam] = E[N] · E[tek dönüş]. E[N], 50'lik üst
 *     sınır dahil dinamik programlamayla kesin bulunur.
 *   • Tek turda 5.000x tavanı RTP'yi ihmal edilebilir ölçüde düşürür
 *     (Monte Carlo ile ayrıca ölçülür, bkz. simulate.ts).
 */

import {
  BAZAAR_FREE_SPINS,
  BAZAAR_FS_CAP,
  BAZAAR_FS_MULT,
  BAZAAR_LINES,
  BAZAAR_PAYING,
  BAZAAR_PAYS,
  BAZAAR_SCATTER_PAYS,
  BAZAAR_SYMBOLS,
  BAZAAR_WEIGHTS,
  CLASSIC_SYMBOLS,
  CLASSIC_TABLE,
  ROULETTE_PAYOUT,
  ROULETTE_POCKETS,
  type BazaarSymbol,
  type ClassicClass,
} from "../src/lib/games/config";
import { classicClassOf, rouletteWins, type RouletteBet } from "../src/lib/games/engine";

let failed = 0;
const check = (name: string, ok: boolean, detail: string) => {
  console.log(`${ok ? "✅" : "❌"} ${name} — ${detail}`);
  if (!ok) failed++;
};
const pct = (x: number, d = 6) => `%${(x * 100).toFixed(d)}`;

/* ---------------------------- RULET ---------------------------- */
console.log("\nRulet (Amerikan, 38 cep)");
const rouletteBets: RouletteBet[] = [
  { kind: "straight", n: 17, amount: 1 },
  { kind: "straight", n: 0, amount: 1 },
  { kind: "straight", n: 37, amount: 1 },
  { kind: "red", amount: 1 }, { kind: "black", amount: 1 },
  { kind: "odd", amount: 1 }, { kind: "even", amount: 1 },
  { kind: "low", amount: 1 }, { kind: "high", amount: 1 },
  { kind: "dozen", n: 1, amount: 1 }, { kind: "dozen", n: 3, amount: 1 },
  { kind: "column", n: 1, amount: 1 }, { kind: "column", n: 2, amount: 1 }, { kind: "column", n: 3, amount: 1 },
];
for (const b of rouletteBets) {
  let wins = 0;
  for (let p = 0; p < ROULETTE_POCKETS; p++) if (rouletteWins(b, p)) wins++;
  const rtp = (wins * ROULETTE_PAYOUT[b.kind]) / ROULETTE_POCKETS;
  check(`${b.kind}${b.n !== undefined ? ` ${b.n}` : ""}`, Math.abs(rtp - 36 / 38) < 1e-12, `${wins} cep kazandırır, RTP ${pct(rtp, 4)}`);
}

/* ---------------------------- KLASİK ---------------------------- */
console.log("\nKlasik 777");
const totalW = CLASSIC_TABLE.reduce((a, t) => a + t.weight, 0);
const classicRtp = CLASSIC_TABLE.reduce((a, t) => a + t.weight * t.mult, 0) / totalW / 100;
check("RTP", Math.abs(classicRtp - 0.95) < 1e-12, `${pct(classicRtp)} (ağırlık toplamı ${totalW})`);
const hit = CLASSIC_TABLE.filter((t) => t.mult > 0).reduce((a, t) => a + t.weight, 0) / totalW;
check("en küçük kazanç ≥ 1,5x", CLASSIC_TABLE.every((t) => t.mult === 0 || t.mult >= 150), `isabet ${pct(hit, 2)}`);
const seen = new Map<ClassicClass, number>();
for (const a of CLASSIC_SYMBOLS) for (const b of CLASSIC_SYMBOLS) for (const c of CLASSIC_SYMBOLS) {
  const k = classicClassOf([a, b, c]);
  seen.set(k, (seen.get(k) ?? 0) + 1);
}
check("her sınıfın görüntüsü var", CLASSIC_TABLE.every((t) => (seen.get(t.cls) ?? 0) > 0),
  CLASSIC_TABLE.map((t) => `${t.cls}:${seen.get(t.cls) ?? 0}`).join(" "));

/* -------------------------- KAPALIÇARŞI -------------------------- */
console.log("\nKapalıçarşı");
const probs = BAZAAR_WEIGHTS.map((w) => {
  const tot = BAZAAR_SYMBOLS.reduce((a, s) => a + w[s], 0);
  return Object.fromEntries(BAZAAR_SYMBOLS.map((s) => [s, w[s] / tot])) as Record<BazaarSymbol, number>;
});

let lineEV = 0;
let lineHit = 0;
for (const f of BAZAAR_PAYING) {
  if (f === "W" || f === "S") continue;
  const pays = BAZAAR_PAYS[f as keyof typeof BAZAAR_PAYS];
  let pRun = probs[0]![f];
  for (let len = 2; len <= 5; len++) {
    const q = probs[len - 1]![f] + probs[len - 1]!.W;
    const exactPrev = pRun * (1 - q);
    if (len - 1 >= 3) {
      lineEV += (exactPrev * pays[len - 4]!) / 100;
      lineHit += exactPrev;
    }
    pRun *= q;
  }
  lineEV += (pRun * pays[2]) / 100;
  lineHit += pRun;
}

let dist = [1];
for (const pr of probs)
  for (let row = 0; row < 3; row++) {
    const next = new Array<number>(dist.length + 1).fill(0);
    dist.forEach((v, k) => {
      next[k]! += v * (1 - pr.S);
      next[k + 1]! += v * pr.S;
    });
    dist = next;
  }
const pTrig = dist.slice(3).reduce((a, b) => a + b, 0);
let scatterEV = 0;
dist.forEach((v, k) => {
  if (k >= 3) scatterEV += (v * BAZAAR_SCATTER_PAYS[Math.min(k, 5) - 3]!) / 100;
});
const spinEV = BAZAAR_LINES.length * lineEV + scatterEV;

const memo = new Map<number, number>();
const expectedSpins = (awarded: number, left: number): number => {
  if (left === 0) return 0;
  const key = awarded * 1000 + left;
  const hitMemo = memo.get(key);
  if (hitMemo !== undefined) return hitMemo;
  const add = Math.min(BAZAAR_FREE_SPINS, BAZAAR_FS_CAP - awarded);
  const r = 1 + pTrig * expectedSpins(awarded + add, left - 1 + add) + (1 - pTrig) * expectedSpins(awarded, left - 1);
  memo.set(key, r);
  return r;
};
const eN = expectedSpins(BAZAAR_FREE_SPINS, BAZAAR_FREE_SPINS);
const bazaarRtp = spinEV * (1 + pTrig * eN * BAZAAR_FS_MULT);

check("RTP (tavan hariç)", Math.abs(bazaarRtp - 0.95) < 1e-5, pct(bazaarRtp));
console.log(`   tek dönüş beklentisi ${spinEV.toFixed(6)} · bedava dönüş tetikleme 1/${(1 / pTrig).toFixed(1)} · ortalama ${eN.toFixed(3)} bedava dönüş`);
console.log(`   tek çizgi isabeti ${pct(lineHit, 3)} · anahtar ödemesi ${pct(scatterEV, 3)}`);
check("en küçük kazanç ≥ 1,5x",
  Object.values(BAZAAR_PAYS).every((p) => p[0] >= 150) && BAZAAR_SCATTER_PAYS[0] >= 150, "çizgi ve anahtar ödemeleri");

export const BAZAAR_EXACT_RTP = bazaarRtp;

console.log(failed === 0 ? "\nHepsi doğrulandı." : `\n${failed} kontrol başarısız.`);
if (process.argv[1]?.endsWith("verify-slots.ts")) process.exit(failed === 0 ? 0 : 1);

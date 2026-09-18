/**
 * Higher / Lower — TAM SAYIM ile RTP kanıtı.
 *
 * Derin zincirler (10+ adım) Monte Carlo ile ölçülemez: kazanma olasılığı
 * milyonda birlere iner, ödül binlerce katına çıkar; 10 milyon tur bile
 * anlamlı bir ortalama vermez. Onun yerine küçük bir desteyle BÜTÜN
 * permütasyonları tek tek oynarız — sonuç örneklem değil, kesin değerdir.
 *
 * Kanıtlanan iddia: ev avantajı yalnız ilk adımda uygulandığı ve sonraki
 * adımlar tam 1/p ödediği için, oyuncunun kaç adım gittiği veya hangi
 * tarafı seçtiği RTP'yi DEĞİŞTİRMEZ — her strateji için tam %95.
 */

import { hlCashout, hlOdds, hlStep, type HlState } from "../src/lib/games/engine";

type Pick = "best" | "worst" | "higher" | "lower" | "alternate";

function* permutations(n: number): Generator<number[]> {
  const arr = Array.from({ length: n }, (_, i) => i);
  const c = new Array<number>(n).fill(0);
  yield arr.slice();
  let i = 0;
  while (i < n) {
    if (c[i]! < i) {
      const j = i % 2 === 0 ? 0 : c[i]!;
      const tmp = arr[i]!;
      arr[i] = arr[j]!;
      arr[j] = tmp;
      yield arr.slice();
      c[i] = c[i]! + 1;
      i = 0;
    } else {
      c[i] = 0;
      i++;
    }
  }
}

const BET = 1_000_000; // 10.000 coin — floor() etkisini ihmal edilebilir kılar

function exactRtp(deckSize: number, steps: number, pick: Pick): number {
  let total = 0;
  let count = 0;

  for (const deck of permutations(deckSize)) {
    count++;
    let state: HlState = { deck, position: 0, mult: 1 };
    let alive = true;

    for (let s = 0; s < steps && alive; s++) {
      const odds = hlOdds(state);
      if (odds.higher === 0 && odds.lower === 0) break; // deste bitti

      let guess: "higher" | "lower";
      if (odds.higher === 0) guess = "lower";
      else if (odds.lower === 0) guess = "higher";
      else if (pick === "best") guess = odds.higher >= odds.lower ? "higher" : "lower";
      else if (pick === "worst") guess = odds.higher < odds.lower ? "higher" : "lower";
      else if (pick === "higher") guess = "higher";
      else if (pick === "lower") guess = "lower";
      else guess = s % 2 === 0 ? "higher" : "lower";

      const r = hlStep(state, guess);
      if (!r.won) { alive = false; break; }
      state = r.state;
    }
    if (alive) total += hlCashout(state, BET).payout;
  }
  return total / (count * BET);
}

const deckSize = Number(process.env.DECK ?? 8);
console.log(
  `${deckSize} kartlık deste — ${factorial(deckSize).toLocaleString("tr-TR")} permütasyonun TAMAMI oynanıyor\n`,
);
console.log("adım  strateji      kesin RTP        sapma");
console.log("-".repeat(52));

let worst = 0;
for (const steps of [1, 2, 3, 4, 5, 6, 7]) {
  for (const pick of ["best", "worst", "higher", "alternate"] as Pick[]) {
    const rtp = exactRtp(deckSize, steps, pick);
    const dev = (rtp - 0.95) * 100;
    worst = Math.max(worst, Math.abs(dev));
    console.log(
      `${String(steps).padStart(4)}  ${pick.padEnd(12)} ${(rtp * 100).toFixed(10)}%  ${dev >= 0 ? "+" : ""}${dev.toExponential(2)} pp`,
    );
  }
}
console.log("-".repeat(52));
console.log(`En büyük sapma: ${worst.toExponential(2)} puan (kayan nokta gürültüsü seviyesinde)`);

function factorial(n: number): number {
  let r = 1;
  for (let i = 2; i <= n; i++) r *= i;
  return r;
}

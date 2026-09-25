/**
 * Blackjack — kurallarımızda temel strateji ve RTP.
 *
 * Kurallar (config.ts): 6 deste, 6:5, krupiye yumuşak 17'de çeker (H17),
 * peek, ilk iki kartta ikiye katlama, bölme/sigorta/teslim yok.
 *
 * 1. Kesin hesap (sonsuz deste yaklaşımı): her el için çek/dur/katla
 *    beklentisi dinamik programlamayla çözülür → temel strateji + RTP.
 * 2. Gerçek motorla Monte Carlo: engine.ts'deki bjStart/bjAct/bjSettle
 *    ile, her elde yeni karılan 6 desteyle üç oyuncu tipi oynatılır:
 *      • temel strateji (kusursuz)
 *      • "krupiye gibi" — 17'ye kadar çek, asla katlama
 *      • "hiç batma" — 12 ve üstünde dur
 *
 *   N=2000000 npx tsx scripts/verify-blackjack.ts
 */

import { generateServerSeed, rngFor } from "../src/lib/games/rng";
import { bjAct, bjCanDouble, bjCardValue, bjSettle, bjStart, bjTotal, type BjState } from "../src/lib/games/engine";
import { BJ_PAY_DEN, BJ_PAY_NUM } from "../src/lib/games/config";

/* ------------------ 1. Kesin çözüm (sonsuz deste) ------------------ */

const P: number[] = [];
for (let v = 1; v <= 10; v++) P[v] = v === 10 ? 4 / 13 : 1 / 13; // 1 = as

const best = (hard: number, ace: boolean) => (ace && hard + 10 <= 21 ? hard + 10 : hard);
const isSoft = (hard: number, ace: boolean) => ace && hard + 10 <= 21;
type Dist = Map<number, number>;

function dealerDist(up: number): Dist {
  const out: Dist = new Map();
  const add = (k: number, p: number) => out.set(k, (out.get(k) ?? 0) + p);
  const rec = (hard: number, ace: boolean, n: number, p: number) => {
    const t = best(hard, ace);
    if (hard > 21) return add(22, p);
    if (t > 17 || (t === 17 && !isSoft(hard, ace))) return add(t, p); // H17
    let excl = 0; // peek: gizli kart krupiyeye blackjack vermiyor
    if (n === 1 && up === 1) excl = P[10]!;
    if (n === 1 && up === 10) excl = P[1]!;
    for (let v = 1; v <= 10; v++) {
      if (n === 1 && ((up === 1 && v === 10) || (up === 10 && v === 1))) continue;
      rec(hard + v, ace || v === 1, n + 1, (p * P[v]!) / (1 - excl));
    }
  };
  rec(up, up === 1, 1, 1);
  return out;
}
const DD: Dist[] = [];
for (let up = 1; up <= 10; up++) DD[up] = dealerDist(up);

function evStand(t: number, d: Dist): number {
  if (t > 21) return -1;
  let ev = 0;
  for (const [dt, p] of d) ev += dt === 22 || dt < t ? p : dt > t ? -p : 0;
  return ev;
}
const memo = new Map<string, number>();
function evPlay(hard: number, ace: boolean, up: number): number {
  if (hard > 21) return -1;
  const k = `${hard}|${ace}|${up}`;
  const c = memo.get(k);
  if (c !== undefined) return c;
  const r = Math.max(evStand(best(hard, ace), DD[up]!), evHit(hard, ace, up));
  memo.set(k, r);
  return r;
}
function evHit(hard: number, ace: boolean, up: number): number {
  let h = 0;
  for (let v = 1; v <= 10; v++) h += P[v]! * evPlay(hard + v, ace || v === 1, up);
  return h;
}
function evDouble(hard: number, ace: boolean, up: number): number {
  let e = 0;
  for (let v = 1; v <= 10; v++) {
    const nh = hard + v;
    e += P[v]! * 2 * (nh > 21 ? -1 : evStand(best(nh, ace || v === 1), DD[up]!));
  }
  return e;
}

const bjPay = BJ_PAY_NUM / BJ_PAY_DEN;
let exactEV = 0;
for (let up = 1; up <= 10; up++) {
  const pDealerBJ = up === 1 ? P[10]! : up === 10 ? P[1]! : 0;
  for (let a = 1; a <= 10; a++)
    for (let b = 1; b <= 10; b++) {
      const pr = P[up]! * P[a]! * P[b]!;
      if ((a === 1 && b === 10) || (a === 10 && b === 1)) {
        exactEV += pr * (1 - pDealerBJ) * bjPay;
        continue;
      }
      const hard = a + b, ace = a === 1 || b === 1;
      const m = Math.max(evStand(best(hard, ace), DD[up]!), evHit(hard, ace, up), evDouble(hard, ace, up));
      exactEV += pr * (-pDealerBJ + (1 - pDealerBJ) * m);
    }
}

/** Temel strateji: el + krupiyenin açık kartı → hamle. */
function basicStrategy(s: BjState): "hit" | "stand" | "double" {
  let hard = 0, ace = false;
  for (const c of s.player) {
    const v = bjCardValue(c);
    if (v === 11) { ace = true; hard += 1; } else hard += v;
  }
  const upV = bjCardValue(s.dealer[0]!);
  const up = upV === 11 ? 1 : upV;
  const st = evStand(best(hard, ace), DD[up]!);
  const h = evHit(hard, ace, up);
  if (bjCanDouble(s) && evDouble(hard, ace, up) > Math.max(st, h)) return "double";
  return h > st ? "hit" : "stand";
}
const mimicDealer = (s: BjState) => (bjTotal(s.player).total < 17 ? "hit" : "stand") as "hit" | "stand";
const neverBust = (s: BjState) => (bjTotal(s.player).total < 12 ? "hit" : "stand") as "hit" | "stand";

/* ------------------ 2. Gerçek motorla Monte Carlo ------------------ */

const N = Number(process.env.N ?? 1_000_000);
const BET = 10_000;
const seed = generateServerSeed();

function simulate(name: string, strat: (s: BjState) => "hit" | "stand" | "double") {
  let sum = 0, sumSq = 0, staked = 0;
  const counts: Record<string, number> = {};
  for (let i = 0; i < N; i++) {
    let s = bjStart(rngFor(seed, name, i));
    while (s.phase === "player") s = bjAct(s, strat(s));
    const r = bjSettle(s, BET);
    const net = (r.payout - r.stake) / BET;
    sum += net;
    sumSq += net * net;
    staked += r.stake;
    counts[r.result] = (counts[r.result] ?? 0) + 1;
  }
  const mean = sum / N;
  const se = Math.sqrt((sumSq / N - mean * mean) / N);
  // RTP'yi platformun diğer oyunlarıyla aynı tanımla veriyoruz: ilk bahis
  // başına geri dönen / ilk bahis (katlama ek bahsi de ödemede sayılır).
  console.log(
    `${name.padEnd(24)} RTP %${((1 + mean) * 100).toFixed(3)} ±${(se * 100).toFixed(3)}` +
      `   (ortalama yatırılan ${(staked / N / BET).toFixed(3)}× bahis)`,
  );
  return { rtp: 1 + mean, se, counts };
}

console.log(`Kesin hesap (sonsuz deste), temel strateji: RTP %${((1 + exactEV) * 100).toFixed(3)}\n`);
console.log(`Gerçek motor, 6 deste, ${N.toLocaleString("tr-TR")} el:`);
const bs = simulate("Temel strateji", basicStrategy);
simulate("Krupiye gibi (17'ye çek)", mimicDealer);
simulate("Hiç batma (12'de dur)", neverBust);

const diff = Math.abs(bs.rtp - (1 + exactEV));
const ok = diff < 5 * bs.se + 0.002; // 6 deste ile sonsuz deste arasında ~0,1 puan fark doğal
console.log(`\n${ok ? "✅" : "❌"} Motor ile kesin hesap uyumlu (fark ${(diff * 100).toFixed(3)} puan)`);
const tot = Object.values(bs.counts).reduce((a, b) => a + b, 0);
console.log(
  "Sonuç dağılımı (temel strateji): " +
    Object.entries(bs.counts).map(([k, v]) => `${k} %${((v / tot) * 100).toFixed(1)}`).join(" · "),
);
process.exit(ok ? 0 : 1);

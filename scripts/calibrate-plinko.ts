/**
 * Plinko ödeme tablolarını tam %95 RTP'ye kalibre eder.
 *
 * Top her sıradaki çividen %50 sola / %50 sağa sapar → kova dağılımı
 * binom(n, 1/2). k kovasının olasılığı C(n,k) / 2^n.
 *
 * Çarpanlar YÜZDE BİRLİK tam sayı olarak tutulur (150 = 1.50x), böylece
 * kayan nokta hatası yok. Şart:  Σ C(n,k) * m_k = 95 * 2^n   (tam eşitlik)
 *
 * Yöntem:
 *  1) Şekil eğrisini %95'e ölçekle; alt sınıra (0.10x) takılan kovalar için
 *     sabit nokta yinelemesiyle kalan kovaları yeniden ölçekle.
 *  2) Tam sayıya çevirirken "en büyük artık" (largest remainder) yöntemi —
 *     toplam hedefi tam tutturur, hiçbir kovayı 0.01'den fazla kaydırmaz.
 */

type Risk = "low" | "medium" | "high";

const MIN_MULT = 10; // 0.10x
const RTP_HUNDREDTHS = 95;

const SHAPES: Record<Risk, { base: number; peak: number; power: number }> = {
  low: { base: 0.55, peak: 5.5, power: 3 },
  medium: { base: 0.32, peak: 28, power: 4.2 },
  high: { base: 0.16, peak: 260, power: 6.2 },
};

function binomials(n: number): number[] {
  const row = [1];
  for (let k = 1; k <= n; k++) row.push((row[k - 1]! * (n - k + 1)) / k);
  return row.map((v) => Math.round(v));
}

/** Alt sınırı gözeterek gerçek sayılı çarpanları %95'e oturtur. */
function realMultipliers(rows: number, risk: Risk): number[] {
  const C = binomials(rows);
  const total = 2 ** rows;
  const { base, peak, power } = SHAPES[risk];
  const half = rows / 2;
  const target = RTP_HUNDREDTHS * total; // yüzde birlik cinsinden

  const shape = C.map((_, k) => {
    const d = Math.abs(k - half) / half;
    return base + (peak - base) * Math.pow(d, power);
  });

  const pinned = new Array<boolean>(C.length).fill(false);
  let result = new Array<number>(C.length).fill(0);

  for (let iter = 0; iter < 50; iter++) {
    const pinnedMass = C.reduce(
      (acc, c, k) => acc + (pinned[k] ? c * MIN_MULT : 0),
      0,
    );
    const freeShape = C.reduce((acc, c, k) => acc + (pinned[k] ? 0 : c * shape[k]!), 0);
    const scale = (target - pinnedMass) / freeShape;

    result = shape.map((s, k) => (pinned[k] ? MIN_MULT : s * scale));

    const newlyPinned = result.some((m, k) => !pinned[k] && m < MIN_MULT);
    if (!newlyPinned) break;
    result.forEach((m, k) => {
      if (m < MIN_MULT) pinned[k] = true;
    });
  }
  return result;
}

/**
 * Tam sayıya çevirir; Σ C_k·m_k = 95·2^n eşitliğini TAM sağlar ve
 * tabloyu simetrik tutar (k ile n-k kovası daima aynı çarpan).
 *
 * Simetri için yarım vektör üzerinde çalışırız; k < n/2 kovasının etkin
 * ağırlığı 2·C_k, orta kovanınki C_{n/2}. Tüm bu ağırlıklar çift ve hedef
 * de çift olduğundan (w_0 = 2), artık her zaman tam kapatılabilir.
 */
function toExactIntegers(real: number[], C: number[], target: number): number[] {
  const n = C.length - 1;
  const half = n / 2;
  const w: number[] = [];
  for (let k = 0; k <= half; k++) w.push(k === half ? C[k]! : 2 * C[k]!);

  const halfReal = real.slice(0, half + 1);
  const mult = halfReal.map((m) => Math.max(MIN_MULT, Math.floor(m)));
  const frac = halfReal.map((m, k) =>
    m < MIN_MULT ? -1 : m - Math.floor(m) + (mult[k]! === MIN_MULT ? 0 : 0),
  );

  let deficit = target - mult.reduce((acc, m, k) => acc + m * w[k]!, 0);

  const order = frac
    .map((f, k) => ({ f, k }))
    .sort((a, b) => b.f - a.f)
    .map((x) => x.k);

  let guard = 0;
  while (deficit !== 0 && guard++ < 100_000) {
    let moved = false;
    for (const k of order) {
      if (deficit === 0) break;
      const weight = w[k]!;
      if (deficit >= weight) {
        mult[k] = mult[k]! + 1;
        deficit -= weight;
        moved = true;
      } else if (deficit <= -weight && mult[k]! - 1 >= MIN_MULT) {
        mult[k] = mult[k]! - 1;
        deficit += weight;
        moved = true;
      }
    }
    if (!moved) break;
  }
  if (deficit !== 0) throw new Error(`kalan artık kapatılamadı: ${deficit}`);

  const full = new Array<number>(n + 1);
  for (let k = 0; k <= half; k++) {
    full[k] = mult[k]!;
    full[n - k] = mult[k]!;
  }
  return full;
}

function calibrate(rows: number, risk: Risk) {
  const C = binomials(rows);
  const total = 2 ** rows;
  const target = RTP_HUNDREDTHS * total;
  const mult = toExactIntegers(realMultipliers(rows, risk), C, target);
  const achieved = mult.reduce((acc, m, k) => acc + m * C[k]!, 0) / (100 * total);
  const monotonic = mult
    .slice(0, rows / 2 + 1)
    .every((m, i, arr) => i === 0 || m <= arr[i - 1]!);
  return { mult, achieved, monotonic, C, total };
}

const out: Record<string, number[]> = {};
console.log("sıra risk     RTP           tek↑  çarpanlar (x)");
console.log("-".repeat(112));
for (const rows of [8, 12, 16]) {
  for (const risk of ["low", "medium", "high"] as Risk[]) {
    const r = calibrate(rows, risk);
    out[`${risk}_${rows}`] = r.mult;
    const pretty = r.mult.map((m) => (m / 100).toFixed(2)).join(" ");
    console.log(
      `${String(rows).padStart(4)} ${risk.padEnd(7)} ${(r.achieved * 100).toFixed(8)}%  ` +
        `${r.monotonic ? " ok " : "BOZUK"}  ${pretty}`,
    );
  }
}

console.log("\n// --- config.ts içine gömülecek tablo (yüzde birlik tam sayı) ---");
console.log("export const PLINKO_TABLES: Record<string, readonly number[]> = {");
for (const [key, mult] of Object.entries(out)) {
  console.log(`  ${key}: [${mult.join(", ")}],`);
}
console.log("};");

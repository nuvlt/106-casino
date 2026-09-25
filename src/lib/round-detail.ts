/**
 * Geçmiş listesinde her turun altına yazılan tek satırlık özet.
 *
 * Tur sonuçları (`rounds.result`) oyuna göre farklı biçimde saklanıyor;
 * burada her biri insanın okuyacağı kısa bir cümleye çevrilir. Beklenmeyen
 * bir biçimde boş döner — liste yine düzgün görünür.
 */

const n2 = new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 2 });
const x = (v: unknown) => (typeof v === "number" ? `${n2.format(v)}x` : "");
const RISK: Record<string, string> = { low: "düşük", medium: "orta", high: "yüksek" };
const TIER: Record<string, string> = { bronze: "bronz", silver: "gümüş", gold: "altın" };

type R = Record<string, unknown>;

export function roundDetail(game: string, result: unknown): string {
  if (!result || typeof result !== "object") return "";
  const r = result as R;
  try {
    switch (game) {
      case "WHEEL":
        return typeof r.label === "string" ? `Dilim: ${r.label}` : "";
      case "CRASH":
        return r.cashedOutAt != null
          ? `${x(r.cashedOutAt)}'te çekildi · ${x(r.crashPoint)}'te patladı`
          : `${x(r.crashPoint)}'te patladı`;
      case "DICE": {
        const roll = typeof r.roll === "number" ? n2.format(r.roll) : "?";
        const th = typeof r.threshold === "number" ? n2.format(r.threshold) : "?";
        return `Zar ${roll} · hedef ${r.mode === "under" ? `${th} altı` : `${th} ve üstü`}`;
      }
      case "PLINKO":
        return `${r.rows ?? "?"} sıra · ${RISK[String(r.risk)] ?? r.risk} risk`;
      case "SCRATCH":
        return typeof r.symbol === "string" && r.symbol !== "—" ? `Üç ${r.symbol}` : "Eşleşme yok";
      case "GUESS": {
        const picks = Array.isArray(r.picks) ? (r.picks as number[]).join(", ") : "?";
        return `Çekilen ${r.drawn ?? "?"} · seçtiklerin ${picks}`;
      }
      case "MYSTERY":
        return typeof r.pick === "number"
          ? `${TIER[String(r.tier)] ?? ""} kasa · ${r.pick + 1}. kutu`.trim()
          : "";
      case "ROULETTE":
        return typeof r.label === "string" ? `Top: ${r.label}` : "";
      case "SLOT_CLASSIC":
        return typeof r.label === "string" ? r.label : "";
      case "SLOT_BAZAAR": {
        const free = Array.isArray(r.free) ? r.free.length : 0;
        return free > 0 ? `${free} bedava dönüş` : "Normal dönüş";
      }
      case "BLACKJACK": {
        const RESULT: Record<string, string> = {
          blackjack: "Blackjack", win: "Kazandı", push: "Berabere", lose: "Krupiye kazandı",
          bust: "Battı", dealer_blackjack: "Krupiye blackjack",
        };
        const pt = typeof r.playerTotal === "number" ? r.playerTotal : "?";
        const dt = typeof r.dealerTotal === "number" ? r.dealerTotal : "?";
        const res = typeof r.result === "string" ? RESULT[r.result] ?? "" : "Süresi doldu";
        return `${res} · ${pt} – ${dt}${r.doubled ? " · katlandı" : ""}`;
      }
      case "HIGHERLOWER": {
        const cards = Array.isArray(r.cards)
          ? (r.cards as { label?: string }[]).map((c) => c.label ?? "?")
          : [];
        const shown = cards.length > 6 ? ["…", ...cards.slice(-6)] : cards;
        return shown.length ? `Kartlar: ${shown.join(" → ")}` : "";
      }
      default:
        return "";
    }
  } catch {
    return "";
  }
}

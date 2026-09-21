/**
 * Sonuç gösterimi — net kazanç testi.
 *
 * Bu dosyanın var olma sebebi gerçek bir hatadır: ekran "ödeme > 0" ise
 * yeşil "+" basıyordu. 50 coin yatırıp 0,5x alan oyuncuya "+25" yazıyordu;
 * oysa oyuncu 25 coin KAYBETMİŞTİ. Ölçüt artık nettir.
 */

import { outcomeOf } from "../src/lib/outcome.ts";
import { COIN } from "../src/lib/games/config.ts";

let pass = 0;
let fail = 0;

function check(label: string, ok: boolean, detail?: string) {
  if (ok) {
    pass++;
    console.log(`  ✅ ${label}`);
  } else {
    fail++;
    console.log(`  ❌ ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

const bet = 50 * COIN;

console.log("\nNet sonuç sınıflandırması");

const win = outcomeOf(150 * COIN, bet, 3);
check("3x kazanç 'win'", win.kind === "win", win.kind);
check("başlık net kârı gösterir (+100)", win.headline === "+100", win.headline);
check("kazançta yeşil", win.tone === "text-win", win.tone);
check("kazançta rakam bayrağı açık", win.numeric === true, String(win.numeric));

const partial = outcomeOf(25 * COIN, bet, 0.5);
check("0,5x kısmi iade 'partial'", partial.kind === "partial", partial.kind);
check("kısmi kayıpta tutar YAZILMAZ", partial.headline === "kaybettin", partial.headline);
check("kısmi kayıpta rakam bayrağı kapalı", partial.numeric === false, String(partial.numeric));
check("kısmi iade YEŞİL DEĞİL", partial.tone !== "text-win", partial.tone);
check("başlıkta rakam yok", !/\d/.test(partial.headline), partial.headline);
check("geri gelen tutar alt satırda", partial.note.includes("25"), partial.note);

const even = outcomeOf(bet, bet, 1);
check("1x başa baş 'even'", even.kind === "even", even.kind);
check("başa başta '+' yok", !even.headline.includes("+"), even.headline);
check("başa baş YEŞİL DEĞİL", even.tone !== "text-win", even.tone);

const loss = outcomeOf(0, bet, 0);
check("sıfır ödeme 'loss'", loss.kind === "loss", loss.kind);
check("tam kayıpta da tutar YAZILMAZ", loss.headline === "kaybettin", loss.headline);
check("tam kayıpta rakam bayrağı kapalı", loss.numeric === false, String(loss.numeric));

// Hilo'nun ilk adımı kesin tahminde 0,95x öder — bu bir kayıptır.
const hiloEdge = outcomeOf(Math.floor(bet * 0.95), bet, 0.95);
check("Hilo 0,95x kayıp sayılır", hiloEdge.kind === "partial", hiloEdge.kind);
check("Hilo 0,95x yeşil değil", hiloEdge.tone !== "text-win", hiloEdge.tone);

console.log("\nSınır durumları");
// Bir centicoin kâr bile kazançtır.
const hair = outcomeOf(bet + 1, bet, 1.0002);
check("+1 centicoin kazanç sayılır", hair.kind === "win", hair.kind);
// Bir centicoin eksik kayıptır.
const hairLoss = outcomeOf(bet - 1, bet, 0.9998);
check("−1 centicoin kayıp sayılır", hairLoss.kind === "partial", hairLoss.kind);

console.log(`\n${pass} geçti, ${fail} başarısız\n`);
process.exit(fail === 0 ? 0 : 1);

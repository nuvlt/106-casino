/**
 * Prisma şemasını veritabanına ve motor ikililerine ihtiyaç duymadan
 * doğrular (WASM ile). CI'da `prisma validate` yerine kullanılabilir.
 *
 *   node scripts/validate-schema.mjs
 */
import fs from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

// wasm-bindgen panik kaydı — bu global olmadan hata mesajları okunamıyor.
globalThis.PRISMA_WASM_PANIC_REGISTRY = {
  set_message(m) {
    this.message = m;
  },
};

const wasm = require("@prisma/prisma-schema-wasm");
const path = "prisma/schema.prisma";
const schema = fs.readFileSync(path, "utf8");

try {
  wasm.validate(JSON.stringify({ prismaSchema: [[path, schema]], noColor: true }));
  const models = [...schema.matchAll(/^model\s+(\w+)/gm)].map((m) => m[1]);
  const enums = [...schema.matchAll(/^enum\s+(\w+)/gm)].map((m) => m[1]);
  console.log(`✅ Şema geçerli — ${models.length} model, ${enums.length} enum`);
  console.log(`   ${models.join(", ")}`);
  process.exit(0);
} catch (e) {
  console.error("❌ Şema geçersiz:\n" + String(e.message ?? e));
  process.exit(1);
}

"use server";

/**
 * Sunucu eylemleri (server actions) — istemci bileşenlerinden çağrılabilir.
 * `signOut` doğrudan bir istemci bileşeninde "use server" ile satır içi
 * tanımlanamadığı için (yalnızca sunucu bileşenlerinde mümkün), ayrı bir
 * dosyada dışa aktarılıyor.
 */

import { signOut } from "@/auth";

export async function signOutAction() {
  await signOut({ redirectTo: "/giris" });
}

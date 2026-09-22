import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { AdminScreen } from "@/components/AdminScreen";

/**
 * Sayfa sunucuda da korunur: yönetici olmayan için sayfa hiç var
 * olmamış gibi 404 döner. Uçlar ayrıca kendi başlarına requireAdmin
 * çağırır — yani arayüzü atlayıp doğrudan API'ye gitmek de işe yaramaz.
 */
export default async function AdminPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/giris");

  // Rol, API'lerle aynı kaynaktan (ADMIN_EMAILS, bkz. auth.ts) gelir:
  // listeye eklenen hemen girer, çıkarılan hemen düşer.
  if (session.user.role !== "ADMIN") notFound();

  return <AdminScreen />;
}

import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { AdminScreen } from "@/components/AdminScreen";

/**
 * Sayfa sunucuda da korunur: yönetici olmayan için sayfa hiç var
 * olmamış gibi 404 döner. Uçlar ayrıca kendi başlarına requireAdmin
 * çağırır — yani arayüzü atlayıp doğrudan API'ye gitmek de işe yaramaz.
 */
export default async function AdminPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/giris");

  const [me] = await db
    .select({ role: users.role })
    .from(users)
    .where(eq(users.id, session.user.id))
    .limit(1);

  if (me?.role !== "ADMIN") notFound();

  return <AdminScreen />;
}

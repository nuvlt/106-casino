import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { HistoryScreen } from "@/components/HistoryScreen";

export default async function HistoryPage() {
  const session = await auth();
  if (!session?.user) redirect("/giris");
  return <HistoryScreen />;
}

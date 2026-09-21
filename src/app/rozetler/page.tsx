import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { BadgesScreen } from "@/components/BadgesScreen";

export default async function BadgesPage() {
  const session = await auth();
  if (!session?.user) redirect("/giris");
  return <BadgesScreen />;
}

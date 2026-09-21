import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { RankScreen } from "@/components/RankScreen";

export default async function RankPage() {
  const session = await auth();
  if (!session?.user) redirect("/giris");
  return <RankScreen />;
}

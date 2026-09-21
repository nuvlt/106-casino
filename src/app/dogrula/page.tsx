import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { VerifyScreen } from "@/components/VerifyScreen";

export default async function VerifyPage() {
  const session = await auth();
  if (!session?.user) redirect("/giris");
  return <VerifyScreen />;
}

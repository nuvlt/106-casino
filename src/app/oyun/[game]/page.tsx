import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { gameBySlug } from "@/lib/catalog";
import { GameScreen } from "@/components/GameScreen";

export default async function GamePage({ params }: { params: Promise<{ game: string }> }) {
  const session = await auth();
  if (!session?.user) redirect("/giris");

  const { game } = await params;
  const meta = gameBySlug(game);
  if (!meta || !meta.ready) notFound();

  return <GameScreen slug={meta.slug} />;
}

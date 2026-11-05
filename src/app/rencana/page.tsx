import type { Metadata } from "next";
import { PlanScreen } from "@/components/plan";

export const metadata: Metadata = { title: "Rencana Porsi" };

export default async function Page({ searchParams }: { searchParams: Promise<{ menu?: string; tanggal?: string }> }) {
  const { menu, tanggal } = await searchParams;
  return <PlanScreen key={JSON.stringify([menu, tanggal])} requestedMenu={menu} requestedDate={tanggal}/>;
}

import type { Metadata } from "next";
import { SalesScreen } from "@/components/sales";

export const metadata: Metadata = { title: "Catat Penjualan" };

export default async function Page({ searchParams }: { searchParams: Promise<{ menu?: string; tanggal?: string }> }) {
  const { menu, tanggal } = await searchParams;
  return <SalesScreen key={JSON.stringify([menu, tanggal])} requestedMenu={menu} requestedDate={tanggal}/>;
}

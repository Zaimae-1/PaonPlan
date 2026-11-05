import type { Metadata } from "next";
import { HistoryScreen } from "@/components/history";

export const metadata: Metadata = { title: "Riwayat" };

export default function Page() {
  return <HistoryScreen/>;
}

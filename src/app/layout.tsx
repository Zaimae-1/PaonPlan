import type { Metadata } from "next";
import { Kitchen } from "@/components/kitchen";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "PaonPlan | Rencana porsi warung", template: "%s | PaonPlan" },
  description: "Tahu berapa porsi sebelum mulai masak. Rencanakan porsi warung dari catatan penjualan harian.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="id"><body><Kitchen>{children}</Kitchen></body></html>;
}

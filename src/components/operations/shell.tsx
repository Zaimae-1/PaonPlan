"use client";

import Link from "next/link";
import { CookingPot, CalendarDays, ClipboardList, House, LogOut, Package, Settings, ShoppingBasket, SquarePen, Users } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import type { Role } from "@/lib/operations/types";
import { AdminHome, Reports, Settings as SettingsScreen } from "./admin";
import { Cashier, Receipts } from "./cashier";
import { Orders } from "./orders";
import { CloseDay, Planning } from "./planning";
import { Stock } from "./stock";
import { api, request, TaskStatus, useTask } from "./shared";

const adminNav = [
  ["/usaha", "Ringkasan", House], ["/usaha/penjualan", "Penjualan", ClipboardList], ["/usaha/stok", "Menu & Stok", Package],
  ["/usaha/rencana", "Rencana Porsi", CalendarDays], ["/usaha/pesanan", "Pesanan & Booking", Users],
  ["/usaha/tutup-hari", "Tutup Hari", SquarePen], ["/usaha/kasir", "Buka Kasir", ShoppingBasket],
  ["/usaha/pengaturan", "Warung & Akun", Settings],
] as const;
const cashierNav = [
  ["/usaha/kasir", "Kasir", ShoppingBasket], ["/usaha/pesanan", "Pesanan online", Users], ["/usaha/struk", "Struk saya", ClipboardList],
] as const;

export function OperationsShell({ role, name, section, demo }: { role: Role; name: string; section: string; demo: boolean }) {
  const path = usePathname();
  const router = useRouter();
  const task = useTask();
  const navigation = role === "admin" ? adminNav : cashierNav;
  const forbidden = role !== "admin" && !["kasir", "pesanan", "struk"].includes(section);
  let screen: React.ReactNode;
  if (forbidden) screen = <section className="panel"><h1>Akses khusus Admin</h1><p>Buka Kasir untuk melayani penjualan.</p><Link className="button primary" href="/usaha/kasir">Buka Kasir</Link></section>;
  else {
    switch (section) {
      case "": screen = <AdminHome/>; break;
      case "kasir": screen = <Cashier/>; break;
      case "struk": screen = <Receipts/>; break;
      case "pesanan": screen = <Orders role={role}/>; break;
      case "stok": screen = <Stock/>; break;
      case "rencana": screen = <Planning/>; break;
      case "tutup-hari": screen = <CloseDay/>; break;
      case "penjualan": screen = <Reports/>; break;
      case "pengaturan": screen = <SettingsScreen/>; break;
      default: screen = <p className="panel">Halaman ruang usaha tidak ditemukan.</p>;
    }
  }
  return <div className="ops-shell">
    <a className="skip" href="#konten-usaha">Lewati ke konten</a>
    <aside className="sidebar ops-sidebar">
      <Link className="brand" href="/usaha"><span className="brand-mark"><CookingPot size={24}/></span><span><strong>PaonPlan</strong><small>RUANG USAHA WARUNG</small></span></Link>
      <div className="nav-group"><p className="nav-label">{role === "admin" ? "PEMILIK WARUNG" : "MEJA KASIR"}</p>
        <nav aria-label="Navigasi ruang usaha">{navigation.map(([href, label, Icon]) => <Link key={href} href={href} aria-current={path === href ? "page" : undefined}><Icon size={19}/><span>{label}</span></Link>)}</nav>
      </div>
      <div className="sidebar-note"><span>{name}</span><span className="pill demo-tag">{role === "admin" ? "Admin" : "Kasir"}</span>
        <Link className="text-action" href="/">Data browser lama</Link></div>
    </aside>
    <div className="main-column">
      <div className="topline ops-top"><span><span className="status-dot"/>Stok & catatan bersama</span>{demo && <span className="pill demo-tag">Data contoh · warung fiktif</span>}
        <button className="text-action" type="button" disabled={task.busy} onClick={() => void task.run(async () => {
          await request(api, { action: "logout" }); router.replace("/usaha"); router.refresh();
        })}><LogOut size={17}/>Keluar</button></div>
      <main className="main-content ops-main" id="konten-usaha" tabIndex={-1}><TaskStatus status={task.status}/>{screen}</main>
      <footer><span>PaonPlan · Tahu berapa porsi sebelum mulai masak.</span><span>Waktu Bali · WITA</span></footer>
    </div>
  </div>;
}

"use client";

import Image from "next/image";
import Link from "next/link";
import { ArrowDownRight, ArrowRight, CalendarDays, ClipboardList, CookingPot, Leaf, Plus, Sparkles, TriangleAlert } from "lucide-react";
import { useKitchen } from "@/components/kitchen";
import { Empty, ModeBanner, ModeButton } from "@/components/ui";
import { fullDate, number, shiftDate, shortDate, todayWita } from "@/lib/dates";

export default function Home() {
  const { workspace, mode } = useKitchen();
  const today = todayWita();
  const tomorrow = shiftDate(today, 1);
  const plans = workspace.plans.filter((row) => row.date === tomorrow);
  const latest = workspace.sales.filter((row) => row.menuId === workspace.activeMenu).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 3);
  const menuName = (id: string) => workspace.menus.find((menu) => menu.id === id)?.name ?? "Menu";
  const current = workspace.sales.filter((row) => row.menuId === workspace.activeMenu && row.date <= today);
  const recent = current.filter((row) => row.date >= shiftDate(today, -6));
  const stats = [
    { label: "Catatan penjualan", value: current.length, unit: "hari tercatat", icon: ClipboardList },
    { label: "Terjual 7 hari terakhir", value: recent.length ? recent.reduce((sum, row) => sum + row.sold, 0) : null, unit: "porsi terjual", icon: CookingPot },
    { label: "Habis sebelum tutup", value: current.filter((row) => row.stockout).length, unit: "hari tercatat", icon: TriangleAlert },
  ];

  return <div className="page-stack">
    <ModeBanner/>
    <header className="hero">
      <div className="hero-copy">
        <p className="eyebrow"><Leaf size={16}/> RENCANA DAPUR HARIAN</p>
        <h1>Besok masak<br className="hero-break"/> berapa?</h1>
        <p>Tahu berapa porsi sebelum mulai masak. Rencanakan porsi dari catatan penjualan warung Anda.</p>
        <div className="actions">
          <Link className="button primary" href="/rencana">Buat rencana besok <ArrowRight size={19}/></Link>
          <Link className="button hero-secondary" href="/penjualan/catat"><Plus size={18}/>Catat penjualan</Link>
        </div>
      </div>
      <Image className="hero-art" src="/dapur.svg" alt="" width={455} height={290} priority/>
    </header>

    <div className="home-grid">
      <section className="panel">
        <div className="panel-head"><span className="icon-chip"><CalendarDays size={21}/></span>
          <div><h2>Rencana besok</h2><p>{fullDate(tomorrow)} · WITA</p></div></div>
        {plans.length ? <div className="rows">
          {plans.map((plan) => <Link className="data-row plan-row" key={plan.menuId} href={`/rencana?menu=${encodeURIComponent(plan.menuId)}&tanggal=${plan.date}`}>
            <span><strong>{menuName(plan.menuId)}</strong><small>Rencana tersimpan</small></span>
            <span className="row-figure"><strong>{number(plan.portions)}</strong> porsi <ArrowRight size={17}/></span>
          </Link>)}
        </div> : <Empty title="Belum ada rencana">Simpan jumlah porsi untuk besok agar bisa dilihat di sini.</Empty>}
      </section>
      <section className="panel">
        <div className="panel-head"><span className="icon-chip chip-1"><ClipboardList size={21}/></span>
          <div><h2>Catatan terakhir</h2><p>{workspace.activeMenu ? menuName(workspace.activeMenu) : "Penjualan yang baru dicatat"}</p></div></div>
        {latest.length ? <>
          <div className="rows">{latest.map((row) => <Link className="data-row" key={row.menuId + row.date} href={`/penjualan/catat?menu=${encodeURIComponent(row.menuId)}&tanggal=${row.date}`}>
            <span><strong>{menuName(row.menuId)}</strong><small>{shortDate(row.date)}</small></span>
            <span className="row-figure"><strong>{number(row.sold)}</strong> terjual</span>
          </Link>)}</div>
          <Link className="text-action" href="/riwayat">Lihat riwayat <ArrowRight size={17}/></Link>
        </> : <Empty title="Belum ada penjualan">Porsi yang dibuat dan terjual akan muncul setelah Anda mencatatnya.</Empty>}
      </section>
    </div>

    <section aria-label="Ringkasan menu aktif" className="stats">
      {stats.map(({ label, value, unit, icon: Icon }, index) => <article className="stat" key={label}>
        <span className={`icon-chip chip-${index}`}><Icon size={20} strokeWidth={1.8}/></span>
        <div><h2>{label}</h2><p><strong>{value === null ? "—" : number(value)}</strong> <span>{unit}</span></p></div>
      </article>)}
    </section>

    {!current.length && mode === "business" && <section className="start-strip">
      <span className="icon-chip chip-1"><Sparkles size={23}/></span>
      <div><h2>Mulai dari catatan pertama</h2><p>Catat penjualan warung Anda, atau coba alurnya dengan data fiktif Nasi Ayam.</p></div>
      <div className="actions"><ModeButton/><Link className="text-action" href="/penjualan/catat">Mulai catat penjualan <ArrowDownRight size={17}/></Link></div>
    </section>}
    {!!current.length && mode === "business" && <ModeButton/>}
  </div>;
}

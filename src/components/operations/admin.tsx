"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowRight, CalendarCheck, Download, ShoppingBasket, TriangleAlert } from "lucide-react";
import { number } from "@/lib/dates";
import { rupiah, type Account, type Expense, type MenuItem, type Receipt, type Report, type Restock } from "@/lib/operations/types";
import { DateFilter, ReceiptList } from "./cashier";
import { api, Check, Figure, Input, Loading, num, on, OpHeading, Refresh, request, Select, ShopLink, showDate,
  str, SummaryFigures, Supplies, TaskForm, useView, type BaseView, type Change } from "./shared";

type HomeView = BaseView & { report: Report; low: MenuItem[]; supplies: { items: Restock[]; incomplete: string[] };
  counts: { orders: number; bookings: number; closed: boolean } };

export function AdminHome() {
  const view = useView<HomeView>(api + "?view=home");
  if (!view.data) return <Loading error={view.error} retry={view.refresh}/>;
  const data = view.data;
  return <div className="ops-stack">
    <section className="public-banner">
      <p className="eyebrow">RUANG KERJA PEMILIK</p><h1>Bagaimana dapur hari ini?</h1>
      <p>{showDate(data.today)} · WITA. Lihat penjualan, cek stok, dan siapkan porsi untuk besok.</p>
      <div className="actions"><Link className="button primary" href="/usaha/tutup-hari"><CalendarCheck size={18}/>Tutup Hari</Link>
        <Link className="button secondary" href="/usaha/rencana">Rencana Porsi <ArrowRight size={17}/></Link></div>
    </section>
    <SummaryFigures report={data.report}/>
    <div className="ops-grid">
      <section className="panel ops-list"><div className="ops-panel-heading"><p className="eyebrow">PERLU PERHATIAN</p><h2>Antrean & stok hari ini</h2></div>
        <Link className="ops-row" href="/usaha/pesanan"><div><h3><ShoppingBasket size={19}/> Pesanan menunggu</h3><p className="hint">Buka antrean untuk mengonfirmasi alokasi porsi.</p></div>
          <strong className="estimate-number">{number(data.counts.orders)}</strong></Link>
        <Link className="ops-row" href="/usaha/pesanan"><div><h3>Booking menunggu</h3><p className="hint">Periksa kapasitas sebelum menerima.</p></div><strong>{number(data.counts.bookings)}</strong></Link>
        {data.low.map((menu) => <Link className="ops-row" key={menu.id} href="/usaha/stok"><div><h3>{menu.name}</h3>
          <span className="pill stockout-tag"><TriangleAlert size={14}/>{menu.stock} porsi tersedia</span></div><ArrowRight size={17}/></Link>)}
        {!data.low.length && <p>Belum ada menu aktif dengan stok 5 porsi atau kurang.</p>}
        <span className={data.counts.closed ? "pill forecast-tag" : "pill demo-tag"}>{data.counts.closed ? "Rekap hari ini sudah ditutup" : "Rekap hari ini masih terbuka"}</span>
      </section>
      <Supplies date={data.tomorrow} data={data.supplies} compact/>
    </div>
    <div className="actions"><ShopLink slug={data.slug}/><Refresh action={view.refresh}/></div>
  </div>;
}

type ReportView = BaseView & { report: Report; transactions: Receipt[]; expenses: Expense[] };
export function Reports() {
  const [period, setPeriod] = useState({ start: "", end: "" });
  const view = useView<ReportView>(api + "?view=report" + (period.start ? "&" + new URLSearchParams(period) : ""));
  const [target, setTarget] = useState("");
  return <div className="ops-stack">
    <OpHeading tag="PENJUALAN & PENGELUARAN" title="Catatan keuangan" description="Cocokkan penjualan, pajak, dan pengeluaran dengan transaksi sumber."/>
    <section className="panel ops-list">
      <DateFilter today={view.data?.today ?? ""} {...period} submit={(start, end) => setPeriod({ start, end })}/>
      {view.data && <a className="button secondary" href={"/api/usaha/laporan?" + new URLSearchParams({
        start: period.start || view.data.today, end: period.end || view.data.today,
      })}><Download size={18}/>Unduh PDF</a>}
    </section>
    {view.data ? <>
      <SummaryFigures report={view.data.report}/>
      <div className="ops-figures">
        <Figure label="Pajak dipungut" value={rupiah(view.data.report.tax)}/>
        <Figure label="Selisih kas operasional tercatat" value={rupiah(view.data.report.cash + view.data.report.qris - view.data.report.expenses)}
          note="Berdasarkan catatan · penerimaan termasuk pajak"/>
        <Figure label="Gaji sudah dibayar" value={rupiah(view.data.report.salary)}
          note={view.data.report.subtotal ? number(view.data.report.salary / view.data.report.subtotal * 100) + "% dari penjualan sebelum pajak" : "Belum ada penjualan sebagai pembagi"}/>
      </div>
      <div className="ops-grid">
        <section className="panel ops-list"><div className="ops-panel-heading"><h2>Target dana yang ingin disisihkan</h2><p>Hitungan target dari penjualan sebelum pajak pada periode terpilih.</p></div>
          <Input label="Target (%)" name="target" type="number" min={0} max={100} step="0.1" required={false}
            value={target} onChange={(e) => setTarget(e.target.value)}/>
          <Figure label="Dana target" value={target !== "" && Number(target) >= 0 && Number(target) <= 100
            ? rupiah(Math.round(view.data.report.subtotal * Number(target) / 100)) : "—"}/>
        </section>
        <ExpenseForm today={view.data.today} refresh={view.refresh}/>
      </div>
      <ReceiptList transactions={view.data.transactions} admin changed={view.refresh}/>
      <section className="panel ops-list"><h2>Daftar pengeluaran</h2>
        {view.data.expenses.map((expense) => <article className="ops-row" key={expense.id}>
          <div><strong>{expense.description}</strong><p className="hint">{showDate(expense.date)} · {expense.category === "salary" ? "Gaji" : expense.category === "ingredient" ? "Bahan" : "Operasional"} · {expense.method === "cash" ? "Tunai" : "Non-tunai"}</p></div>
          <strong>{rupiah(expense.amount)}</strong>
        </article>)}
        {!view.data.expenses.length && <p>Belum ada pengeluaran pada periode ini.</p>}
      </section>
    </> : <Loading error={view.error} retry={view.refresh}/>}
  </div>;
}

function ExpenseForm({ today, refresh }: { today: string; refresh: Change }) {
  return <section className="panel ops-list"><h2>Catat pengeluaran</h2>
    <p className="hint">Pembelian stok dicatat melalui Menu & Stok agar jumlah bahan dan pengeluaran terhubung.</p>
    <TaskForm submit="Simpan pengeluaran" send={async (values) => {
      await request(api, { action: "expense", date: str(values, "date"), category: str(values, "category"),
        description: str(values, "description"), amount: num(values, "amount"), method: str(values, "method") });
      refresh();
    }}>
      <Input name="date" label="Tanggal dibayar" type="date" max={today} defaultValue={today}/>
      <Select name="category" label="Kategori"><option value="operational">Biaya operasional</option><option value="salary">Gaji yang sudah dibayar</option></Select>
      <Input name="description" label="Keterangan pengeluaran" maxLength={160}/>
      <Input name="amount" label="Jumlah dibayar (Rp)" type="number" min={1} max={1000000000000}/>
      <Select name="method" label="Dibayar dari"><option value="cash">Kas tunai</option><option value="other">Non-tunai / rekening</option></Select>
    </TaskForm>
  </section>;
}

type SettingsView = BaseView & { capacity: number; accounts: Account[] };
export function Settings() {
  const view = useView<SettingsView>(api + "?view=settings");
  return <div className="ops-stack"><OpHeading tag="PENGATURAN PEMILIK" title="Warung & Akun" description="Atur identitas struk, pajak, kapasitas booking, dan akses kasir."/>
    {view.data ? <div className="ops-grid">
      <section className="panel ops-list"><h2>Pengaturan warung</h2>
        <TaskForm key={JSON.stringify([view.data.name, view.data.taxBps, view.data.capacity])} submit="Simpan pengaturan" send={async (values) => {
          await request(api, { action: "settings", name: str(values, "name"), taxBps: Math.round(num(values, "tax") * 100), capacity: num(values, "capacity") });
          view.refresh();
        }}>
          <Input name="name" label="Nama warung pada struk" maxLength={80} defaultValue={view.data.name}/>
          <Input name="tax" label="Pajak penjualan (%) · 0 untuk nonaktif" type="number" min={0} max={100} step="0.01" defaultValue={view.data.taxBps / 100}/>
          <Input name="capacity" label="Kapasitas orang per slot 30 menit" type="number" min={0} max={500} defaultValue={view.data.capacity}/>
        </TaskForm>
        <ShopLink slug={view.data.slug}/>
      </section>
      <section className="panel ops-list"><h2>Akun kasir</h2>
        {view.data.accounts.map((account) => <details className="ops-disclosure" key={account.id}>
          <summary>{account.name} · {account.active ? "Aktif" : "Nonaktif"}</summary><AccountForm account={account} refresh={view.refresh}/>
        </details>)}
        <details className="ops-disclosure"><summary>Tambah akun kasir</summary><AccountForm refresh={view.refresh}/></details>
      </section>
    </div> : <Loading error={view.error} retry={view.refresh}/>}
  </div>;
}

function AccountForm({ account, refresh }: { account?: Account; refresh: Change }) {
  return <TaskForm key={JSON.stringify(account)} submit={account ? "Simpan akun kasir" : "Buat akun kasir"} send={async (values) => {
    await request(api, { action: "account", id: account?.id, name: str(values, "name"), email: str(values, "email"),
      password: String(values.get("password") ?? "") || undefined, active: on(values, "active") });
    refresh();
  }}>
    <Input name="name" label="Nama kasir" maxLength={80} defaultValue={account?.name}/>
    <Input name="email" label="Email kasir" type="email" maxLength={160} defaultValue={account?.email}/>
    <Input name="password" label={account ? "Sandi baru (opsional)" : "Sandi kasir"} type="password" minLength={12} maxLength={128} required={!account} autoComplete="new-password"/>
    <Check name="active" defaultChecked={account?.active ?? true}>Akun kasir aktif</Check>
  </TaskForm>;
}

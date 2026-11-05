"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowRight, CalendarCheck, CircleAlert, Sparkles } from "lucide-react";
import { ForecastCard } from "@/components/plan";
import { number, shiftDate } from "@/lib/dates";
import type { Estimate, Forecast } from "@/lib/forecast";
import { rupiah, type Closing, type CloseRow, type Daily, type MenuItem, type PlanRow, type Report, type Restock } from "@/lib/operations/types";
import { api, Check, Figure, Input, Loading, num, on, OpHeading, optionalNum, Refresh, request, Select, showDate, str, SummaryFigures,
  Supplies, TaskForm, TaskStatus, useTask, useView, type BaseView, type Change } from "./shared";

type PlanView = BaseView & { menus: MenuItem[]; plans: PlanRow[]; history: Daily[]; supplies: { items: Restock[]; incomplete: string[] } };
type ForecastResult = { result: Forecast; quote: string };

export function Planning() {
  const view = useView<PlanView>(api + "?view=plan");
  return <div className="ops-stack">
    <OpHeading tag="SEBELUM MASAK" title="Rencana Porsi" description="Gunakan rekap kasir dan riwayat manual untuk menentukan porsi serta bahan yang perlu disiapkan."
      aside={<Link className="button secondary" href="/usaha/tutup-hari">Buka Tutup Hari <ArrowRight size={17}/></Link>}/>
    {view.data ? <PlanContent data={view.data} refresh={view.refresh}/> : <Loading error={view.error} retry={view.refresh}/>}
  </div>;
}

function PlanContent({ data, refresh }: { data: PlanView; refresh: Change }) {
  const [menu, setMenu] = useState(data.menus.find((item) => item.name === "Nasi Ayam")?.id ?? data.menus[0]?.id ?? "");
  const [date, setDate] = useState(data.tomorrow);
  const [result, setResult] = useState<(ForecastResult & { event: boolean }) | null>(null);
  const stored = data.plans.find((plan) => plan.menu_id === menu && plan.date === date);
  const active = result?.result;
  const shown = active && active.method !== "insufficient" ? active : null;
  const related = data.history.filter((row) => row.menu_id === menu);
  const [saved, setSaved] = useState<PlanRow | null>(null);
  const snapshot = saved?.menu_id === menu && saved.date === date ? saved : stored;
  const reset = () => { setResult(null); setSaved(null); };
  const analysis = useTask();
  return <>
    <div className="ops-grid">
      <section className="panel ops-list">
        <div className="ops-panel-heading"><h2>Pilih menu dan tanggal</h2><p>Perkiraan memakai catatan sebelum tanggal rencana.</p></div>
        <form className="ops-form" onSubmit={(event) => {
          event.preventDefault();
          const flag = on(new FormData(event.currentTarget), "event");
          void analysis.run(async () => {
            setResult(null);
            const value = await request<ForecastResult>(api, { action: "forecast", menuId: menu, date, event: flag });
            setResult({ ...value, event: flag });
          });
        }}>
          <fieldset className="form-fields" disabled={analysis.busy}>
            <MenuSelect menus={data.menus} name="menu" value={menu} onChange={(e) => { setMenu(e.target.value); reset(); }}/>
            <Input name="date" label="Tanggal rencana" type="date" value={date} onChange={(e) => { setDate(e.target.value); reset(); }}/>
            {date && <p className="hint">{showDate(date)} · WITA</p>}
            <div onChange={reset}><Check name="event">Ada acara di sekitar warung</Check></div>
            <button className="button primary" type="submit" disabled={!menu || date < data.today}><Sparkles size={18}/>
              {analysis.busy ? "Menghitung…" : "Hitung perkiraan"}</button>
            {date < data.today && <p className="hint">Rencana tanggal lampau dapat dilihat dari daftar rencana tersimpan.</p>}
          </fieldset>
        </form>
        <TaskStatus status={analysis.status}/>
      </section>
      <section className="panel ops-list" aria-label="Hasil perkiraan">
        {active?.method === "insufficient" ? <div className="notice"><CircleAlert size={20}/><div>
          <strong>Catatan belum cukup untuk memperkirakan porsi</strong>
          <p>{active.observed} hari tanpa kehabisan stok, {active.stockouts} hari habis sebelum tutup. Minimal 3 hari teramati.</p>
        </div></div> : shown && result ? <>
          <div><ForecastCard result={shown}/></div>
          <TaskForm key={result.quote} submit="Simpan rencana" send={async (values) => {
            const portions = num(values, "portions");
            await request(api, { action: "plan", menuId: menu, date, event: result.event, portions, quote: result.quote });
            setSaved({ menu_id: menu, date, event: result.event, portions, forecast: shown,
              name: data.menus.find((item) => item.id === menu)?.name ?? "Menu" });
            refresh();
          }} success="Rencana tersimpan. Kebutuhan bahan sudah dihitung ulang.">
            <Input label="Jumlah yang akan saya siapkan" name="portions" type="number" min={0} max={100000} defaultValue={snapshot?.portions ?? shown.portions}/>
          </TaskForm>
          {snapshot && <p className="success">{number(snapshot.portions)} porsi pada rencana tersimpan</p>}
        </> : snapshot ? <>
          <p className="saved-strip"><strong>{number(snapshot.portions)} porsi direncanakan</strong></p><div><ForecastCard result={snapshot.forecast} saved/></div>
        </> : <div className="empty"><CalendarCheck size={26}/><h3>Perkiraan porsi muncul di sini</h3><p>Tutup hari atau catat riwayat manual untuk memberi model data.</p></div>}
      </section>
    </div>
    <Supplies date={data.tomorrow} data={data.supplies}/>
    <div className="ops-grid">
      <section className="panel ops-list">
        <div className="ops-panel-heading"><h2>Riwayat menu terpilih</h2><p>100 rekap terbaru untuk semua menu</p></div>
        {related.slice(0, 10).map((row) => <article className="ops-row" key={row.date}>
          <div><strong>{showDate(row.date)}</strong><p className="hint">{row.sold} terjual · {row.prepared} disiapkan · {row.prepared - row.sold} sisa</p></div>
          <div><span className="pill plain-tag">{row.source === "pos" ? "Kasir · Tutup Hari" : "Riwayat manual"}</span>
            {row.stockout && <span className="pill stockout-tag">Habis sebelum tutup</span>}</div>
        </article>)}
        {!related.length && <p>Belum ada riwayat untuk menu ini.</p>}
        <details className="ops-disclosure"><summary>Masukkan atau koreksi riwayat manual</summary>
          <ManualForm menus={data.menus} history={data.history.filter((row) => row.source === "manual")} today={data.today} refresh={refresh}/>
        </details>
      </section>
      <section className="panel ops-list">
        <div className="ops-panel-heading"><h2>Rencana tersimpan</h2><p>Angka pilihan pemilik dan perkiraan saat disimpan</p></div>
        {data.plans.slice(0, 15).map((plan) => <details className="ops-disclosure" key={plan.menu_id + plan.date}>
          <summary>{plan.name} · {number(plan.portions)} porsi</summary>
          <p className="hint">{showDate(plan.date)}</p><p>Perkiraan saat disimpan {number((plan.forecast as Estimate).portions)} porsi.</p>
        </details>)}
        {!data.plans.length && <p>Belum ada rencana tersimpan.</p>}
      </section>
    </div>
  </>;
}

export function MenuSelect({ menus, name, label = "Menu", ...props }: {
  menus: MenuItem[]; name: string; label?: string;
} & React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <Select name={name} label={label} {...props}><option value="">Pilih menu</option>
    {menus.map((menu) => <option key={menu.id} value={menu.id}>{menu.name}</option>)}</Select>;
}

function ManualForm({ menus, history, today, refresh }: { menus: MenuItem[]; history: Daily[]; today: string; refresh: Change }) {
  const [menu, setMenu] = useState("");
  const [date, setDate] = useState(shiftDate(today, -1));
  const current = history.find((row) => row.menu_id === menu && row.date === date);
  return <div className="ops-list">
    <p className="hint">Untuk tanggal sebelum memakai kasir. Satu catatan per menu dan tanggal.</p>
    <MenuSelect menus={menus} name="menu" value={menu} onChange={(e) => setMenu(e.target.value)}/>
    <Input name="date" label="Tanggal riwayat manual" type="date" max={shiftDate(today, -1)} value={date} onChange={(e) => setDate(e.target.value)}/>
    <TaskForm key={menu + date} submit={current ? "Simpan koreksi manual" : "Simpan riwayat manual"} disabled={!menu || !date}
      send={async (values) => {
        await request(api, { action: "manual", menuId: menu, date, prepared: num(values, "prepared"), sold: num(values, "sold"),
          stockout: on(values, "stockout"), event: on(values, "event") });
        refresh();
      }}>
      {current && <p className="notice">Sedang mengoreksi catatan manual yang tersimpan.</p>}
      <div className="form-pair">
        <Input name="prepared" label="Porsi disiapkan" type="number" min={0} max={100000} defaultValue={current?.prepared}/>
        <Input name="sold" label="Porsi terjual" type="number" min={0} max={100000} defaultValue={current?.sold}/>
      </div>
      <Check name="stockout" defaultChecked={current?.stockout}>Habis sebelum tutup</Check>
      <Check name="event" defaultChecked={current?.event}>Ada acara di sekitar warung</Check>
    </TaskForm>
  </div>;
}

type CloseView = BaseView & { closing: Closing | null; rows: CloseRow[]; report: Report; pending: number };
export function CloseDay() {
  const [selected, setSelected] = useState("");
  const view = useView<CloseView>(api + "?view=close" + (selected ? "&date=" + encodeURIComponent(selected) : ""));
  return <div className="ops-stack">
    <OpHeading tag="REKAP SETELAH JUALAN" title="Tutup Hari" description="Konfirmasi porsi yang disiapkan dan kondisi stok. Porsi terjual diambil dari transaksi selesai."
      aside={<Refresh action={view.refresh}/>}/>
    {view.data ? <>
      <section className="panel actions">
        <Input name="date" label="Tanggal rekap" type="date" max={view.data.today} value={selected || view.data.today} onChange={(e) => {
          if (e.target.value) setSelected(e.target.value);
        }}/>
        <span className={view.data.closing ? "pill forecast-tag" : "pill demo-tag"}>{view.data.closing ? "Hari ditutup" : "Hari terbuka"}</span>
      </section>
      <SummaryFigures report={view.data.report}/>
      <CloseContent key={(selected || view.data.today) + "/" + !!view.data.closing} data={view.data} date={selected || view.data.today} refresh={view.refresh}/>
    </> : <Loading error={view.error} retry={view.refresh}/>}
  </div>;
}

function CloseContent({ data, date, refresh }: { data: CloseView; date: string; refresh: Change }) {
  const [note, setNote] = useState<{ kind: string; text: string } | null>(null);
  const noteTask = useTask();
  const closing = data.closing;
  const expected = closing && closing.opening_cash !== null ? closing.opening_cash + data.report.cash - data.report.cashExpenses + closing.other_cash : null;
  return <div className="ops-grid">
    <section className="panel ops-list">
      <div className="ops-panel-heading"><h2>Rekap porsi</h2><p>{showDate(date)} · WITA</p></div>
      {data.pending > 0 && <p className="notice stockout">{data.pending} pesanan untuk tanggal ini masih terbuka dan belum dihitung sebagai penjualan.</p>}
      {closing ? <>
        {data.rows.filter((row) => row.included).map((row) => <article key={row.id} className="ops-row">
          <div><strong>{row.name}</strong><p>{row.prepared} disiapkan · {row.sold} terjual · {row.prepared - row.sold} sisa rekap</p></div>
          {row.stockout && <span className="pill stockout-tag">Habis sebelum tutup</span>}
        </article>)}
        <Link className="button primary" href="/usaha/rencana">Buat rencana porsi <ArrowRight size={17}/></Link>
        <details className="ops-disclosure"><summary>Buka kembali hari ini</summary>
          <p className="hint">Rekap kasir tanggal ini dilepas dari model hingga ditutup kembali. Struk dan rencana tersimpan tetap tersedia.</p>
          <TaskForm submit="Buka kembali rekap" send={async (values) => { await request(api, { action: "reopen", date, reason: str(values, "reason") }); refresh(); }}>
            <Input name="reason" label="Alasan membuka kembali" maxLength={240}/>
          </TaskForm>
        </details>
      </> : <TaskForm submit="Simpan dan tutup hari" send={async (values) => {
        const rows = data.rows.filter((row) => row.sold > 0 || on(values, "include-" + row.id)).map((row) => ({
          id: row.id, sold: row.sold, prepared: num(values, "prepared-" + row.id),
          stockout: on(values, "stockout-" + row.id), event: on(values, "event-" + row.id),
        }));
        await request(api, { action: "close", date, rows, opening: optionalNum(values, "opening"),
          counted: optionalNum(values, "counted"), other: num(values, "other") });
        refresh();
      }}>
        <p className="hint">Jumlah awal berasal dari batch hari tersebut atau porsi terjual. Periksa kembali jika memakai stok dari hari sebelumnya.</p>
        {data.rows.map((row) => <CloseMenu key={row.id} row={row}/>)}
        {!data.rows.length && <p>Belum ada menu untuk direkap.</p>}
        <h3>Kas fisik (opsional)</h3>
        <div className="form-pair">
          <Input name="opening" label="Saldo awal kas (Rp)" type="number" min={0} required={false}/>
          <Input name="counted" label="Uang fisik yang dihitung (Rp)" type="number" min={0} required={false}/>
        </div>
        <Input name="other" label="Pergerakan kas lain bersih (Rp)" type="number" defaultValue={0}/>
        <p className="hint">Gunakan angka negatif untuk kas keluar lain. Penjualan tunai dan pengeluaran tunai sudah dihitung sistem.</p>
      </TaskForm>}
    </section>
    <div className="ops-stack">
      <section className="panel ops-list">
        <div className="ops-panel-heading"><h2>Pencocokan kas</h2><p>Saldo awal + pembayaran tunai − pengeluaran tunai + pergerakan lain.</p></div>
        <Figure label="Kas yang seharusnya ada" value={expected === null ? "—" : rupiah(expected)}/>
        {closing?.counted_cash !== null && closing?.counted_cash !== undefined && <Figure label="Uang fisik yang dihitung" value={rupiah(closing.counted_cash)}/>}
        {expected !== null && closing?.counted_cash !== null && closing?.counted_cash !== undefined
          && <Figure label="Selisih kas fisik" value={rupiah(closing.counted_cash - expected)}/>}
      </section>
      <section className="panel ops-list">
        <div className="ops-panel-heading"><h2>Catatan penutupan</h2><p>Ringkasan kegiatan hari ini dan persiapan hari berikutnya.</p></div>
        <button className="button secondary" type="button" disabled={!closing || noteTask.busy} onClick={() => void noteTask.run(async () => {
          setNote(await request(api, { action: "note", date }));
        })}>{noteTask.busy ? "Menyusun catatan…" : "Buat catatan penutupan"}</button>
        {note && <div><h3>{note.kind}</h3>{note.text.split("\n").filter(Boolean).map((line, i) => <p key={i}>{line}</p>)}
          <div className="actions"><Link className="text-action" href="/usaha/penjualan">Lihat laporan penjualan</Link>
            <Link className="text-action" href="/usaha/rencana">Lihat rencana dan bahan</Link></div></div>}
        <TaskStatus status={noteTask.status}/>
      </section>
    </div>
  </div>;
}

function CloseMenu({ row }: { row: CloseRow }) {
  const [prepared, setPrepared] = useState(row.prepared);
  return <article className="close-card">
    <h3>{row.name}</h3>
    <p className="hint">{number(row.sold)} terjual · {prepared >= row.sold ? number(prepared - row.sold) : "—"} sisa rekap</p>
    {row.sold === 0 && <Check name={"include-" + row.id} defaultChecked={row.included}>Masukkan menu ini ke rekap</Check>}
    <Input name={"prepared-" + row.id} label={"Porsi disiapkan · " + row.name} type="number" min={row.sold} max={100000}
      defaultValue={row.prepared} onChange={(e) => setPrepared(Number(e.target.value))}/>
    <Check name={"stockout-" + row.id}>Habis sebelum tutup</Check>
    <Check name={"event-" + row.id}>Ada acara di sekitar warung</Check>
  </article>;
}

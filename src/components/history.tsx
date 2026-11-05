"use client";

import Link from "next/link";
import { useState } from "react";
import { ClipboardList, Pencil, Plus } from "lucide-react";
import { useKitchen } from "./kitchen";
import { Empty, ModeBanner, PageIntro, RecordLink } from "./ui";
import { shortDate, number } from "@/lib/dates";
import type { Plan, Sale } from "@/lib/data";

type Row = { date: string; menuId: string; sale?: Sale; plan?: Plan };
const fields = ["Direncanakan", "Disiapkan", "Terjual", "Sisa"];
const dash = (value?: number) => value === undefined ? "—" : number(value);

export function HistoryScreen() {
  const { workspace } = useKitchen();
  const [menuId, setMenuId] = useState("");
  const [limit, setLimit] = useState(10);
  const days = new Map<string, Row>();
  for (const sale of workspace.sales) days.set(sale.menuId + "/" + sale.date, { date: sale.date, menuId: sale.menuId, sale });
  for (const plan of workspace.plans) {
    const key = plan.menuId + "/" + plan.date;
    days.set(key, { ...days.get(key), date: plan.date, menuId: plan.menuId, plan });
  }
  const rows = [...days.values()]
    .filter((row) => !menuId || row.menuId === menuId)
    .sort((a, b) => b.date.localeCompare(a.date) || a.menuId.localeCompare(b.menuId));
  const visible = rows.slice(0, limit).map((row) => {
    const { sale, plan } = row;
    const name = workspace.menus.find((menu) => menu.id === row.menuId)?.name ?? "Menu";
    const params = `?menu=${encodeURIComponent(row.menuId)}&tanggal=${row.date}`;
    return { ...row, name, params, key: row.menuId + "/" + row.date,
      values: [plan?.portions, sale?.prepared, sale?.sold, sale ? sale.prepared - sale.sold : undefined],
    };
  });

  function status(row: Row) {
    if (row.sale?.stockout) return <span className="pill stockout-tag">Habis sebelum tutup</span>;
    if (row.sale?.event) return <span className="pill plain-tag">Ada acara</span>;
    if (!row.sale) return <span className="pill plain-tag">Belum dicatat</span>;
    return <span className="pill forecast-tag">Tercatat</span>;
  }

  return <div className="page-stack">
    <ModeBanner/>
    <PageIntro eyebrow="03 / LIHAT KEMBALI" title="Riwayat">Bandingkan rencana porsi dengan hasil jualan. Koreksi catatan jika ada isian yang keliru.</PageIntro>
    <section className="panel history-panel">
      <div className="history-head">
        <div className="panel-head"><span className="icon-chip"><ClipboardList size={21}/></span>
          <div><h2>Rencana dan penjualan</h2><p>{number(rows.length)} hari menu tercatat</p></div></div>
        {!!workspace.menus.length && <div className="field filter">
          <label htmlFor="filter-menu">Saring menu</label>
          <select id="filter-menu" value={menuId} onChange={(event) => { setMenuId(event.target.value); setLimit(10); }}>
            <option value="">Semua menu</option>
            {workspace.menus.map((menu) => <option key={menu.id} value={menu.id}>{menu.name}</option>)}
          </select>
        </div>}
      </div>
      {rows.length ? <>
        <table className="history-table">
          <caption className="sr-only">Perbandingan rencana dan penjualan per tanggal dan menu</caption>
          <thead><tr><th scope="col">Tanggal / Menu</th>{fields.map((field) => <th scope="col" key={field}>{field}</th>)}
            <th scope="col">Status</th><th scope="col">Tindakan</th></tr></thead>
          <tbody>{visible.map((row) => <tr key={row.key}>
            <th scope="row"><strong>{row.name}</strong><small>{shortDate(row.date)}</small></th>
            {row.values.map((value, i) => <td key={fields[i]}>
              {i === 0 && row.plan ? <Link href={"/rencana" + row.params} aria-label={`Lihat rencana ${row.name} ${shortDate(row.date)}`}>{dash(value)}</Link> : dash(value)}
            </td>)}
            <td>{status(row)}</td>
            <td><Link className="text-action" href={"/penjualan/catat" + row.params} aria-label={`${row.sale ? "Koreksi" : "Catat"} ${row.name} ${shortDate(row.date)}`}>
              {row.sale ? <Pencil size={16}/> : <Plus size={17}/>} {row.sale ? "Koreksi" : "Catat"}</Link></td>
          </tr>)}</tbody>
        </table>
        <div className="history-cards">{visible.map((row) => <article key={row.key} className="history-card">
          <div className="card-top"><div><h3>{row.name}</h3><p>{shortDate(row.date)}</p></div>{status(row)}</div>
          <dl>{row.values.map((value, i) => <div key={fields[i]}><dt>{fields[i]}</dt><dd>{dash(value)}</dd></div>)}</dl>
          <div className="actions">
            <Link className="text-action" href={"/penjualan/catat" + row.params}>{row.sale ? <Pencil size={16}/> : <Plus size={17}/>}
              {row.sale ? "Koreksi catatan" : "Catat penjualan"}</Link>
            {row.plan && <Link className="text-action" href={"/rencana" + row.params}>Lihat rencana</Link>}
          </div>
        </article>)}</div>
        {rows.length > limit && <button className="button secondary" type="button" onClick={() => setLimit(limit + 10)}>Tampilkan 10 lagi</button>}
      </> : <>
        <Empty title="Belum ada riwayat">Rencana dan penjualan yang disimpan akan muncul di sini.</Empty>
        <RecordLink/>
      </>}
    </section>
  </div>;
}

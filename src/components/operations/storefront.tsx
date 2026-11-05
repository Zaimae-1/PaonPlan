"use client";

import Link from "next/link";
import { useState } from "react";
import { CalendarDays, CookingPot, ExternalLink, ShoppingBasket } from "lucide-react";
import { bookingLabels, orderLabels, slots, type PublicMenu, type PublicStatus } from "@/lib/operations/types";
import { Basket, BasketJump, Catalog, Totals, useAttempt, useCart } from "./cashier";
import { Input, Loading, num, OpHeading, Refresh, request, Select, showDate, str, TaskForm, TaskStatus, useTask, useView } from "./shared";
import { shiftDate, todayWita } from "@/lib/dates";

type CatalogView = { name: string; demo: boolean; taxBps: number; menus: PublicMenu[] };

export function Storefront({ slug, reference }: { slug: string; reference?: string }) {
  const endpoint = "/api/warung/" + encodeURIComponent(slug);
  const view = useView<CatalogView>(endpoint);
  const [tab, setTab] = useState<"order" | "booking" | "status">(reference ? "status" : "order");
  const [ref, setRef] = useState(reference ?? "");
  const [sent, setSent] = useState("");
  const cart = useCart(view.data?.menus ?? [], view.data?.taxBps ?? 0);
  const attempt = useAttempt("public:" + slug);
  const [sending, setSending] = useState(false);
  const today = todayWita();
  const success = (value: { reference: string }) => {
    setSent(value.reference);
    setRef(value.reference);
    setTab("status");
    history.replaceState(null, "", location.pathname + "?ref=" + encodeURIComponent(value.reference));
    cart.clear();
    attempt.clear();
    window.scrollTo({ top: 0, behavior: "instant" });
  };
  return <main className="public-wrap ops-stack">
    <header className="ops-intro">
      <Link className="login-brand" href={"/warung/" + slug}><CookingPot size={27}/>PaonPlan</Link>
      <Link className="text-action" href="/usaha">Masuk staf <ExternalLink size={16}/></Link>
    </header>
    {view.data ? <>
      {view.data.demo && <p className="mode-banner"><strong>Data contoh</strong>Warung fiktif untuk mencoba pesanan dan booking.</p>}
      <section className="public-banner"><p className="eyebrow">DARI DAPUR WARUNG</p><h1>{view.data.name}</h1>
        <p>Pilih makanan untuk diambil di warung, atau kirim permintaan meja. Staf akan mengonfirmasi permintaan Anda.</p></section>
      <nav className="book-tabs" aria-label="Pilihan pelanggan">
        <button className="button secondary" aria-pressed={tab === "order"} onClick={() => setTab("order")} type="button"><ShoppingBasket size={18}/>Pesan makanan</button>
        <button className="button secondary" aria-pressed={tab === "booking"} onClick={() => setTab("booking")} type="button"><CalendarDays size={18}/>Booking meja</button>
        <button className="button secondary" aria-pressed={tab === "status"} onClick={() => setTab("status")} type="button">Cek status</button>
        <Refresh action={view.refresh}/>
      </nav>
      {tab === "order" && <>
        <BasketJump state={cart}/>
        <div className="catalog-layout">
          <Catalog menus={view.data.menus} cart={cart.cart} add={(id) => cart.change(id, 1)} busy={sending}/>
          <Basket state={cart} busy={sending}>
            <TaskForm submit="Kirim pesanan" success="" onWorking={setSending} disabled={!cart.items.length || cart.unavailable || sending} send={async (values) => {
              const body = { action: "order", ...customerValues(values), items: cart.items, expected: cart.quoted.total };
              success(await request(endpoint, { ...body, key: await attempt.get(body) }));
              view.refresh();
            }}>
              <CustomerFields today={today} maxDays={1} order/>
              <p className="notice">Bayar saat pengambilan. Harga pada pesanan disimpan ketika dikirim. Stok disisihkan setelah staf menerima.</p>
            </TaskForm>
          </Basket>
        </div>
      </>}
      {tab === "booking" && <section className="panel ops-list">
        <OpHeading tag="MEJA WARUNG" title="Booking meja" description="Satu slot berlangsung 30 menit. Booking dikonfirmasi setelah staf memeriksa kapasitas."/>
        <TaskForm submit="Kirim permintaan booking" success="" send={async (values) => {
          const body = { action: "booking", ...customerValues(values), guests: num(values, "guests") };
          success(await request(endpoint, { ...body, key: await attempt.get(body) }));
        }}>
          <CustomerFields today={today} maxDays={30}/>
          <Input label="Jumlah orang" name="guests" type="number" min={1} max={500} defaultValue={2}/>
          <p className="hint">Jika ingin memesan makanan, gunakan tombol Pesan makanan secara terpisah.</p>
        </TaskForm>
      </section>}
      {tab === "status" && <Status endpoint={endpoint} refValue={ref} setRef={setRef} sent={sent}/>}
    </> : <Loading error={view.error} retry={view.refresh}/>}
    <footer><span>PaonPlan · Tahu berapa porsi sebelum mulai masak.</span><span>Jadwal mengikuti WITA</span></footer>
  </main>;
}

function customerValues(values: FormData) {
  return { date: str(values, "date"), slot: str(values, "slot"), name: str(values, "name"), contact: str(values, "contact") };
}

function CustomerFields({ today, maxDays, order }: { today: string; maxDays: number; order?: boolean }) {
  const tomorrow = shiftDate(today, 1);
  return <>
    <Input name="name" label="Nama pelanggan" maxLength={80} autoComplete="name"/>
    <Input name="contact" label="Kontak yang bisa dihubungi" maxLength={80} autoComplete="tel"/>
    <div className="form-pair">
      <Input name="date" label={order ? "Tanggal pengambilan" : "Tanggal booking"} type="date" min={today} max={shiftDate(today, maxDays)} defaultValue={tomorrow}/>
      <Select name="slot" label={order ? "Jam pengambilan (WITA)" : "Awal slot (WITA)"} defaultValue="12:00">
        {slots.map((slot) => <option key={slot}>{slot}</option>)}
      </Select>
    </div>
  </>;
}

function Status({ endpoint, refValue, setRef, sent }: { endpoint: string; refValue: string; setRef: (value: string) => void; sent: string }) {
  const [selected, setSelected] = useState(refValue);
  const view = useView<PublicStatus>(endpoint + "?ref=" + encodeURIComponent(selected));
  const task = useTask();
  return <section className="panel ops-list">
    <div className="ops-panel-heading"><h2>Status permintaan</h2><p>Simpan kode atau tautan ini untuk melihat status kembali.</p></div>
    {sent && <p className="success" role="status">Permintaan terkirim. Referensi {sent}</p>}
    <form className="actions ops-form" onSubmit={(event) => { event.preventDefault(); setSelected(refValue.trim()); view.refresh(); }}>
      <Input name="reference" label="Kode referensi" maxLength={24} value={refValue} onChange={(e) => setRef(e.target.value)}/>
      <button className="button primary" type="submit">Cek status</button>
    </form>
    {selected && <>
      {view.data ? <>
        <p><span className="pill forecast-tag">{view.data.kind === "order" ? orderLabels[view.data.status] : bookingLabels[view.data.status]}</span></p>
        <p>{showDate(view.data.date)} · {view.data.slot} WITA</p>
        {view.data.kind === "order" ? <><ul>{view.data.items.map((item) => <li key={item.id}>{item.quantity} × {item.name}</li>)}</ul><Totals quote={view.data}/></>
          : <p>{view.data.guests} orang · slot meja 30 menit</p>}
        <div className="actions">
          <Refresh action={view.refresh}/>
          <button type="button" className="button secondary" onClick={() => void task.run(async () => {
            await navigator.clipboard.writeText(location.origin + location.pathname + "?ref=" + encodeURIComponent(selected));
          }, "Tautan status tersalin.")}>Salin tautan status</button>
        </div>
        <TaskStatus status={task.status}/>
      </> : <Loading error={view.error} retry={view.refresh}/>}
    </>}
  </section>;
}

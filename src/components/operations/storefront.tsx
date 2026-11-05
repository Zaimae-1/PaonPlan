"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowRight, CalendarDays, CookingPot, ExternalLink, Leaf } from "lucide-react";
import { bookingLabels, orderLabels, rupiah, slots, type PublicMenu, type PublicStatus } from "@/lib/operations/types";
import { MenuArt } from "./menu-art";
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
  const featured = view.data?.menus.find((menu) => /betutu/i.test(menu.name) && menu.stock > 0)
    ?? view.data?.menus.find((menu) => menu.stock > 0) ?? view.data?.menus[0];
  function chooseTab(next: typeof tab) {
    setTab(next);
    requestAnimationFrame(() => document.getElementById("pilih-menu")?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }
  const success = (value: { reference: string }) => {
    setSent(value.reference);
    setRef(value.reference);
    setTab("status");
    history.replaceState(null, "", location.pathname + "?ref=" + encodeURIComponent(value.reference));
    cart.clear();
    attempt.clear();
    window.scrollTo({ top: 0, behavior: "instant" });
  };
  return <main className="storefront">
    <header className="shop-header">
      <div className="shop-header-inner">
        <Link className="shop-brand" href={"/warung/" + slug}><span className="shop-brand-mark"><CookingPot size={25}/></span>
          <span><strong>PAONPLAN</strong><small>{view.data?.name ?? "DARI DAPUR WARUNG"}</small></span></Link>
        <nav className="shop-navigation" aria-label="Pilihan pelanggan">
          <button aria-pressed={tab === "order"} onClick={() => chooseTab("order")} type="button">Menu kami</button>
          <button aria-pressed={tab === "booking"} onClick={() => chooseTab("booking")} type="button">Booking meja</button>
          <button aria-pressed={tab === "status"} onClick={() => chooseTab("status")} type="button">Cek status</button>
        </nav>
        <Link className="shop-staff" href="/usaha">Masuk staf <ExternalLink size={15}/></Link>
      </div>
    </header>
    {view.data ? <>
      {tab === "order" && <section className="shop-hero">
        <div className="shop-hero-inner"><div className="shop-hero-copy">
          <p className="eyebrow"><Leaf size={17}/> DARI DAPUR, UNTUK MEJA ANDA</p>
          <h1>Rasa yang akrab.<br/><em>Hangat di setiap porsi.</em></h1>
          <p className="shop-introduction">Selamat datang di {view.data.name}. Pilih sajian kesukaan, pesan untuk diambil, atau siapkan meja untuk makan bersama.</p>
          <div className="actions"><button className="button primary" type="button" onClick={() => chooseTab("order")}>Pesan makanan <ArrowRight size={19}/></button>
            <button className="button hero-secondary" type="button" onClick={() => chooseTab("booking")}><CalendarDays size={18}/>Booking meja</button></div>
          <p className="shop-hero-note"><span>✦ Pesan dari mana saja</span><span>Ambil sesuai jadwal WITA</span></p>
        </div>
        {featured && <div className="shop-featured"><div className="shop-stamp">DARI DAPUR<br/><strong>{view.data.name}</strong></div>
          <MenuArt name={featured.name} category={featured.category}/>
          <div className="shop-featured-caption"><div><small>PILIHAN DI DAPUR</small><h2>{featured.name}</h2></div><strong>{rupiah(featured.price)}</strong></div>
        </div>}
        </div>
      </section>}
      <div className="shop-content ops-stack" id="pilih-menu">
      {view.data.demo && <p className="mode-banner"><strong>Data contoh</strong>Warung fiktif untuk mencoba pesanan dan booking.</p>}
      <div className="shop-content-heading"><div><p className="eyebrow">{view.data.name}</p><h2>{tab === "order" ? "Sajian untuk setiap selera." : tab === "booking" ? "Satu meja untuk Anda." : "Kabar dari dapur."}</h2></div><Refresh action={view.refresh}/></div>
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
      </div>
    </> : <div className="shop-content"><Loading error={view.error} retry={view.refresh}/></div>}
    <footer className="shop-footer"><div><strong>PaonPlan</strong><p>Tahu berapa porsi sebelum mulai masak.</p></div>
      <span>Jadwal pengambilan & booking mengikuti WITA</span><Link href="/usaha">Panel Admin & Kasir <ArrowRight size={16}/></Link></footer>
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

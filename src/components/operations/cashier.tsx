"use client";

import { useRef, useState } from "react";
import { ArrowDown, Banknote, Minus, Plus, Printer, QrCode, Search, ShoppingBasket, Trash2 } from "lucide-react";
import { CategoryIcon, MenuArt } from "./menu-art";
import { number, todayWita } from "@/lib/dates";
import { bill, receiptCode, rupiah, witaTime, type Bill, type Item, type Payment, type PublicMenu, type Receipt } from "@/lib/operations/types";
import { api, attemptStorage, bodyHash, Input, Loading, OpHeading, Refresh, request, str, TaskForm, TaskStatus, useTask, useView, type BaseView } from "./shared";

type Cart = Record<string, number>;

export function useCart(menus: PublicMenu[], tax: number) {
  const [cart, setCart] = useState<Cart>({});
  function change(id: string, delta: number) {
    const menu = menus.find((item) => item.id === id);
    if (!menu && delta > 0) return;
    setCart((previous) => {
      const next = { ...previous };
      const count = Math.min(999, (next[id] ?? 0) + delta);
      if (count <= 0) delete next[id];
      else if (count <= (menu?.stock ?? 0) || delta < 0) next[id] = count;
      return next;
    });
  }
  const items = Object.entries(cart).map(([id, quantity]) => ({ id, quantity }));
  const priced = items.flatMap((item) => {
    const menu = menus.find((entry) => entry.id === item.id);
    return menu ? [{ ...item, name: menu.name, price: menu.price }] : [];
  });
  const unavailable = items.some((item) => item.quantity > (menus.find((entry) => entry.id === item.id)?.stock ?? 0));
  return { cart, change, items, quoted: bill(priced, tax), unavailable, clear: () => setCart({}) };
}

export function Catalog({ menus, cart, add, busy }: { menus: PublicMenu[]; cart: Cart; add: (id: string) => void; busy?: boolean }) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const categories = [...new Set(menus.map((menu) => menu.category))];
  const shown = menus.filter((menu) => (!category || menu.category === category)
    && menu.name.toLocaleLowerCase("id-ID").includes(query.trim().toLocaleLowerCase("id-ID")));
  return <section className="panel ops-list catalog-panel" aria-label="Katalog menu">
    <div className="catalog-heading"><div className="ops-panel-heading"><p className="eyebrow">DARI DAPUR WARUNG</p><h2>Pilih yang ingin dinikmati.</h2></div>
      <span className="catalog-count">{number(shown.length)} pilihan menu</span></div>
    <label className="field catalog-search"><span>Cari menu</span><span className="search-input"><Search size={20}/>
      <input name="search" type="search" placeholder="Lagi ingin makan atau minum apa?" value={query} onChange={(e) => setQuery(e.target.value)}/>
    </span></label>
    <div className="category-tabs" role="group" aria-label="Kategori menu">
      <button type="button" aria-pressed={!category} onClick={() => setCategory("")}><CategoryIcon name="Semua"/>Semua <span>{menus.length}</span></button>
      {categories.map((name) => <button type="button" key={name} aria-pressed={category === name} onClick={() => setCategory(name)}>
        <CategoryIcon name={name}/>{name}<span>{menus.filter((menu) => menu.category === name).length}</span>
      </button>)}
    </div>
    {!shown.length && <p>Belum ada menu yang cocok.</p>}
    <div className="menu-grid">{shown.map((menu) => <button className={"menu-tile" + (cart[menu.id] ? " is-selected" : "")} key={menu.id} type="button"
      disabled={busy || menu.stock <= (cart[menu.id] ?? 0)} onClick={() => add(menu.id)}
      aria-label={`${menu.name}, ${rupiah(menu.price)}, ${menu.stock} porsi tersedia`}>
      <span className="menu-tile-art"><MenuArt name={menu.name} category={menu.category}/><span className="menu-category">{menu.category}</span>
        {!!cart[menu.id] && <span className="tile-quantity">{cart[menu.id]} di keranjang</span>}</span>
      <span className="menu-tile-content"><strong>{menu.name}</strong>
        <span className="menu-stock"><span className={menu.stock > 0 ? "status-dot" : "status-dot sold-dot"}/>{menu.stock > 0 ? number(menu.stock) + " porsi tersedia" : "Porsi habis"}</span>
        <span className="tile-bottom"><span className="tile-price">{rupiah(menu.price)}</span><span className="tile-add"><Plus size={19}/></span></span>
      </span>
    </button>)}</div>
  </section>;
}

export function Totals({ quote }: { quote: Pick<Bill, "subtotal" | "tax" | "total"> }) {
  return <dl className="totals">
    <div><dt>Subtotal</dt><dd>{rupiah(quote.subtotal)}</dd></div>
    {quote.tax > 0 && <div><dt>Pajak</dt><dd>{rupiah(quote.tax)}</dd></div>}
    <div><dt>Total</dt><dd>{rupiah(quote.total)}</dd></div>
  </dl>;
}

export function Basket({ state, children, busy }: { state: ReturnType<typeof useCart>; children?: React.ReactNode; busy?: boolean }) {
  return <section className="panel basket ops-list" id="keranjang" tabIndex={-1}>
    <div className="basket-heading"><span className="basket-symbol"><ShoppingBasket size={23}/></span>
      <div className="ops-panel-heading"><p className="eyebrow">RINCIAN PESANAN</p><h2>Keranjang Anda</h2></div>
      <span className="basket-count">{state.items.reduce((sum, item) => sum + item.quantity, 0)}</span></div>
    {state.items.length ? <div>{state.items.map((item) => {
      const line = state.quoted.items.find((entry) => entry.id === item.id);
      return <article className="basket-item" key={item.id}>
        <div className="basket-menu"><MenuArt name={line?.name ?? "Menu"} compact/>
          <div><strong>{line?.name ?? "Menu sudah tidak tersedia"}</strong><p className="hint">{line ? rupiah(line.price * item.quantity) : "Hapus dari keranjang."}</p></div></div>
        <div className="counter">
          <button className="button secondary" type="button" disabled={busy} onClick={() => state.change(item.id, -1)} aria-label={"Kurangi " + (line?.name ?? "menu")}><Minus size={16}/></button>
          <span>{item.quantity}</span>
          <button className="button secondary" type="button" disabled={busy || !line} onClick={() => state.change(item.id, 1)} aria-label={"Tambah " + (line?.name ?? "menu")}><Plus size={16}/></button>
          <button className="button secondary" type="button" disabled={busy} onClick={() => state.change(item.id, -item.quantity)} aria-label={"Hapus " + (line?.name ?? "menu")}><Trash2 size={16}/></button>
        </div>
      </article>;
    })}</div> : <div className="basket-empty"><ShoppingBasket size={34} strokeWidth={1.3}/><strong>Masih kosong, nih.</strong><p>Ketuk menu untuk menambahkan porsi.</p></div>}
    <Totals quote={state.quoted}/>
    {state.unavailable && <p role="alert" className="error-box">Stok atau menu berubah. Sesuaikan isi keranjang.</p>}
    {children}
  </section>;
}

export function BasketJump({ state }: { state: ReturnType<typeof useCart> }) {
  return <a className="basket-jump text-action" href="#keranjang">
    <span><ShoppingBasket size={17}/> {state.items.reduce((sum, item) => sum + item.quantity, 0)} porsi</span>
    <span>{rupiah(state.quoted.total)} <ArrowDown size={16}/></span>
  </a>;
}

export function useAttempt(scope = "checkout") {
  const current = useRef<{ fingerprint: string; key: string } | null>(null);
  const storageKey = "paonplan:attempt:" + scope;
  async function get(body: unknown) {
    const fingerprint = await bodyHash(body);
    if (!current.current) {
      try { current.current = JSON.parse(attemptStorage(storageKey) ?? "null"); }
      catch { current.current = null; }
    }
    if (fingerprint !== current.current?.fingerprint) current.current = { fingerprint, key: crypto.randomUUID() };
    attemptStorage(storageKey, JSON.stringify(current.current));
    return current.current!.key;
  }
  return { get, clear: () => { current.current = null; attemptStorage(storageKey, null); } };
}

export function PaymentForm({ total, disabled, send, onWorking }: { total: number; disabled?: boolean; send: (payment: Payment) => Promise<void>; onWorking?: (busy: boolean) => void }) {
  const [method, setMethod] = useState<Payment["method"]>("cash");
  const [received, setReceived] = useState("");
  const sufficient = received !== "" && Number(received) >= total;
  return <TaskForm submit={method === "cash" ? "Selesaikan pembayaran tunai" : "Konfirmasi pembayaran QRIS"}
    onWorking={onWorking}
    disabled={disabled || (method === "cash" && !sufficient)} success="" send={async () => {
      await send(method === "cash" ? { method, received: Number(received) } : { method, confirmed: true });
      setReceived("");
    }}>
    <fieldset className="radio-field">
      <legend>Metode bayar</legend>
      <div className="radio-options">
        <label className="check-card"><input type="radio" name="method" checked={method === "cash"} onChange={() => setMethod("cash")}/><Banknote size={18}/>Tunai</label>
        <label className="check-card"><input type="radio" name="method" checked={method === "qris"} onChange={() => setMethod("qris")}/><QrCode size={18}/>QRIS</label>
      </div>
    </fieldset>
    {method === "cash" ? <>
      <Input label="Uang diterima (Rp)" name="received" type="number" inputMode="numeric" min={0} step={1}
        value={received} onChange={(event) => setReceived(event.target.value)}/>
      <p className={received && !sufficient ? "field-error" : "hint"} aria-live="polite">
        {sufficient ? "Kembalian " + rupiah(Number(received) - total) : received ? "Uang diterima masih kurang." : "Isi uang yang diterima dari pelanggan."}</p>
    </> : <p className="notice">Periksa pembayaran pada aplikasi merchant. Tombol ini mencatat konfirmasi manual kasir.</p>}
  </TaskForm>;
}

export function ReceiptPanel({ receipt, onClose, reprint = false }: { receipt: Receipt; onClose: () => void; reprint?: boolean }) {
  const [width, setWidth] = useState(80);
  return <section className="panel receipt-layout" aria-label="Struk transaksi">
    <style media="print">{`@page { size: ${width}mm 220mm; margin: 2mm; } .receipt-paper { --receipt-width: ${width - 4}mm; }`}</style>
    <div className="receipt-paper">
      <h2>{receipt.shop_name}</h2><p className="hint">{receiptCode(receipt.id)}</p><p className="hint">{witaTime(receipt.created_at)}</p>
      {receipt.voided_at && <p><strong>DIBATALKAN</strong> · {receipt.void_reason}</p>}
      <hr/>
      {receipt.items.map((item) => <div key={item.id}>
        <strong>{item.name}</strong><div className="receipt-line"><span>{item.quantity} × {rupiah(item.price)}</span><span>{rupiah(item.price * item.quantity)}</span></div>
      </div>)}
      <hr/><Totals quote={receipt}/>
      <p>Bayar {receipt.method === "cash" ? "Tunai" : "QRIS · konfirmasi kasir"}</p>
      {receipt.method === "cash" && <><p>Diterima {rupiah(receipt.received!)}</p><p>Kembalian {rupiah(receipt.change_due!)}</p></>}
    </div>
    <label className="field"><span>Lebar kertas struk</span><select value={width} onChange={(event) => setWidth(Number(event.target.value))}>
      <option value={58}>58 mm</option><option value={80}>80 mm</option>
    </select></label>
    <div className="actions">
      <button className="button primary" type="button" onClick={() => window.print()}><Printer size={18}/>{reprint ? "Cetak ulang" : "Cetak struk"}</button>
      <button className="button secondary" type="button" onClick={onClose}>Tutup struk</button>
    </div>
  </section>;
}

export function Cashier() {
  const view = useView<BaseView & { menus: PublicMenu[]; closed: boolean }>(api + "?view=cashier");
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [paying, setPaying] = useState(false);
  const cart = useCart(view.data?.menus ?? [], view.data?.taxBps ?? 0);
  const attempt = useAttempt();
  if (!view.data) return <Loading error={view.error} retry={view.refresh}/>;
  return <div className="ops-stack">
    <OpHeading tag="MEJA KASIR" title="Kasir" description="Pilih menu, cek total, lalu catat pembayaran." aside={<Refresh action={view.refresh}/>}/>
    {view.data.closed && <p role="status" className="notice">Hari ini sudah ditutup. Hubungi Admin jika masih perlu mencatat transaksi.</p>}
    {receipt && <ReceiptPanel receipt={receipt} onClose={() => setReceipt(null)}/>}
    <BasketJump state={cart}/>
    <div className="catalog-layout">
      <Catalog menus={view.data.menus} cart={cart.cart} add={(id) => cart.change(id, 1)} busy={view.data.closed || paying}/>
      <Basket state={cart} busy={paying}>
        <PaymentForm total={cart.quoted.total} onWorking={setPaying} disabled={!cart.items.length || cart.unavailable || view.data.closed || paying} send={async (payment) => {
          const body = { action: "checkout", items: cart.items satisfies Item[], payment, expected: cart.quoted.total };
          const result = await request<Receipt>(api, { ...body, key: await attempt.get(body) });
          setReceipt(result);
          cart.clear();
          attempt.clear();
          view.refresh();
          window.scrollTo({ top: 0, behavior: "instant" });
        }}/>
      </Basket>
    </div>
  </div>;
}

export function DateFilter({ today, start, end, submit }: { today: string; start: string; end: string; submit: (start: string, end: string) => void }) {
  return <form className="actions ops-form" onSubmit={(event) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    submit(str(data, "start"), str(data, "end"));
  }}>
    <Input name="start" label="Dari tanggal" type="date" max={today} defaultValue={start || today}/>
    <Input name="end" label="Sampai tanggal" type="date" max={today} defaultValue={end || today}/>
    <button className="button secondary" type="submit">Tampilkan</button>
  </form>;
}

export function ReceiptList({ transactions, admin, changed }: { transactions: Receipt[]; admin?: boolean; changed?: () => void }) {
  const [selected, setSelected] = useState<string | null>(null);
  const task = useTask();
  const receipt = transactions.find((item) => item.id === selected);
  return <section className="panel ops-list">
    <div className="ops-panel-heading"><h2>Daftar transaksi</h2><p>{number(transactions.length)} struk dalam periode</p></div>
    {receipt && <ReceiptPanel receipt={receipt} onClose={() => setSelected(null)} reprint/>}
    {transactions.map((item) => <article className="ops-row" key={item.id}>
      <div><strong>{receiptCode(item.id)}</strong><p className="hint">{witaTime(item.created_at)} · {item.method === "cash" ? "Tunai" : "QRIS"}{item.order_id ? " · Online" : ""}</p>
        {item.voided_at && <span className="pill stockout-tag">Dibatalkan · {item.void_reason}</span>}</div>
      <div className="actions"><strong>{rupiah(item.total)}</strong><button type="button" className="button secondary" onClick={() => {
        setSelected(item.id);
        requestAnimationFrame(() => document.querySelector(".receipt-layout")?.scrollIntoView({ block: "start" }));
      }}>Buka struk</button></div>
      {admin && !item.voided_at && <details className="ops-disclosure">
        <summary>Batalkan transaksi</summary>
        <form onSubmit={(event) => {
          event.preventDefault();
          const data = new FormData(event.currentTarget);
          void task.run(async () => {
            await request(api, { action: "void", id: item.id, reason: str(data, "reason"), restock: data.get("restock") === "on" });
            changed?.();
          }, "Transaksi dibatalkan.");
        }}>
          <fieldset className="form-fields" disabled={task.busy}>
            <p className="hint">Cocokkan pengembalian uang di kas atau aplikasi merchant sebelum mencatat pembatalan.</p>
            <Input name="reason" label="Alasan pembatalan" maxLength={240}/>
            <label className="check-card"><input type="checkbox" name="restock"/>Porsi masih bisa dijual kembali</label>
            <button className="button primary" type="submit">Konfirmasi pembatalan</button>
          </fieldset>
        </form>
      </details>}
    </article>)}
    {!transactions.length && <p>Belum ada transaksi pada periode ini.</p>}
    <TaskStatus status={task.status}/>
  </section>;
}

export function Receipts() {
  const [period, setPeriod] = useState({ start: "", end: "" });
  const params = period.start ? "&" + new URLSearchParams(period) : "";
  const view = useView<BaseView & { transactions: Receipt[] }>(api + "?view=receipts" + params);
  return <div className="ops-stack">
    <OpHeading tag="MEJA KASIR" title="Struk saya" description="Temukan transaksi Anda dan cetak ulang struk."/>
    <section className="panel"><DateFilter today={view.data?.today ?? todayWita()} {...period} submit={(start, end) => setPeriod({ start, end })}/></section>
    {view.data ? <ReceiptList transactions={view.data.transactions}/> : <Loading error={view.error} retry={view.refresh}/>}
  </div>;
}

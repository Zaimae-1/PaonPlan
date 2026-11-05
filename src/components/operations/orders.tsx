"use client";

import Link from "next/link";
import { useState } from "react";
import { bookingLabels, orderLabels, rupiah, type Booking, type BookingStatus, type CustomerOrder, type OrderStatus, type Receipt, type Role } from "@/lib/operations/types";
import { PaymentForm, ReceiptPanel, Totals, useAttempt } from "./cashier";
import { api, Loading, OpHeading, Refresh, request, showDate, TaskStatus, useTask, useView, type BaseView } from "./shared";

type Queue = BaseView & { orders: CustomerOrder[]; bookings: Booking[]; capacity: number | null };
export function Orders({ role }: { role: Role }) {
  const view = useView<Queue>(api + "?view=orders");
  const [tab, setTab] = useState("orders");
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  return <div className="ops-stack">
    <OpHeading tag="ANTREAN WARUNG" title={role === "admin" ? "Pesanan & Booking" : "Pesanan online"}
      description="Konfirmasi permintaan pelanggan dan ikuti perkembangannya sampai selesai." aside={<Refresh action={view.refresh}/>}/>
    {receipt && <ReceiptPanel receipt={receipt} onClose={() => setReceipt(null)}/>}
    {role === "admin" && <div className="book-tabs">
      <button className="button secondary" aria-pressed={tab === "orders"} onClick={() => setTab("orders")} type="button">Pesanan makanan</button>
      <button className="button secondary" aria-pressed={tab === "bookings"} onClick={() => setTab("bookings")} type="button">Booking meja</button>
    </div>}
    {view.data ? <>
      {tab === "orders" ? <section className="ops-list">
        {view.data.orders.map((order) => <OrderCard key={order.id + order.status} order={order}
          refresh={view.refresh} receipt={(result) => { setReceipt(result); view.refresh(); window.scrollTo({ top: 0, behavior: "instant" }); }}/>)}
        {!view.data.orders.length && <p className="panel">Belum ada permintaan pesanan.</p>}
      </section> : <section className="panel ops-list">
        <div className="ops-panel-heading"><h2>Permintaan meja</h2><p>Kapasitas {view.data.capacity} orang per slot 30 menit.</p></div>
        {view.data.bookings.map((booking) => <BookingCard key={booking.id + booking.status} booking={booking} refresh={view.refresh}/>)}
        {!view.data.bookings.length && <p>Belum ada permintaan booking.</p>}
      </section>}
      <p className="hint">Menampilkan hingga 100 permintaan terbaru.</p>
      <Link className="text-action" href={"/warung/" + view.data.slug}>Buka halaman pelanggan</Link>
    </> : <Loading error={view.error} retry={view.refresh}/>}
  </div>;
}

function OrderCard({ order, refresh, receipt }: { order: CustomerOrder; refresh: () => void; receipt: (result: Receipt) => void }) {
  const task = useTask();
  const attempt = useAttempt("fulfil:" + order.id);
  const next: Partial<Record<OrderStatus, [OrderStatus, string]>> = {
    pending: ["accepted", "Terima & alokasikan porsi"], accepted: ["preparing", "Mulai siapkan"], preparing: ["ready", "Tandai siap diambil"],
  };
  const step = next[order.status];
  const terminal = ["completed", "cancelled"].includes(order.status);
  async function update(status: OrderStatus) {
    await request(api, { action: "orderStatus", id: order.id, status });
    refresh();
  }
  return <article className="panel ops-list">
    <div className="ops-row"><div><h2>{order.name}</h2><p className="hint">Ambil {showDate(order.date)} · {order.slot} WITA</p>
      <p className="hint">Kontak {order.contact}</p></div>
      <span className={terminal ? "pill plain-tag" : "pill demo-tag"}>{orderLabels[order.status]}</span>
    </div>
    <p className="hint">Referensi {order.reference}</p>
    {order.items.map((item) => <div className="ops-row" key={item.id}><strong>{item.quantity} × {item.name}</strong><span>{rupiah(item.price * item.quantity)}</span></div>)}
    <Totals quote={order}/>
    {order.status === "pending" && <p className="hint">Stok belum dialokasikan. Porsi akan disisihkan saat permintaan diterima.</p>}
    <div className="actions">
      {step && <button className="button primary" type="button" disabled={task.busy} onClick={() => void task.run(() => update(step[0]))}>{step[1]}</button>}
      {!terminal && <details className="ops-disclosure"><summary>Batalkan pesanan</summary>
        <p>Pesanan yang sudah diterima akan melepaskan alokasi kembali ke stok porsi.</p>
        <button className="button secondary" type="button" disabled={task.busy} onClick={() => void task.run(() => update("cancelled"))}>Konfirmasi pembatalan pesanan</button>
      </details>}
    </div>
    {order.status === "ready" && <details className="ops-disclosure"><summary>Catat pembayaran saat diambil</summary>
      <PaymentForm total={order.total} send={async (payment) => {
        const body = { action: "fulfil", id: order.id, payment, expected: order.total };
        const result = await request<Receipt>(api, { ...body, key: await attempt.get(body) });
        attempt.clear();
        receipt(result);
      }}/>
    </details>}
    <TaskStatus status={task.status}/>
  </article>;
}

function BookingCard({ booking, refresh }: { booking: Booking; refresh: () => void }) {
  const task = useTask();
  function update(status: BookingStatus) {
    void task.run(async () => {
      await request(api, { action: "bookingStatus", id: booking.id, status });
      refresh();
    });
  }
  return <article className="ops-row">
    <div><h3>{booking.name} · {booking.guests} orang</h3><p className="hint">{showDate(booking.date)} · {booking.slot}–{nextSlot(booking.slot)} WITA</p>
      <p className="hint">Kontak {booking.contact}</p><span className="pill plain-tag">{bookingLabels[booking.status]}</span></div>
    <div className="actions">
      {booking.status === "pending" && <>
        <button className="button primary" disabled={task.busy} type="button" onClick={() => update("confirmed")}>Terima booking</button>
        <button className="button secondary" disabled={task.busy} type="button" onClick={() => update("declined")}>Tolak booking</button>
      </>}
      {booking.status === "confirmed" && <button className="button secondary" disabled={task.busy} type="button" onClick={() => update("cancelled")}>Batalkan booking</button>}
    </div>
    <TaskStatus status={task.status}/>
  </article>;
}

function nextSlot(slot: string) {
  const [hour, minute] = slot.split(":").map(Number);
  return String(hour + Math.floor((minute + 30) / 60)).padStart(2, "0") + ":" + String((minute + 30) % 60).padStart(2, "0");
}

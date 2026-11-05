import type { PoolClient } from "pg";
import { randomBytes } from "node:crypto";
import { shiftDate, todayWita } from "../dates";
import { database, one, requireCondition, rows, transaction } from "./db";
import { idempotent, insertReceipt, lockShop, moveStock, quoteCart, requireOpen } from "./inventory";
import type { Actor, Booking, CustomerOrder, PublicMenu, PublicStatus, Shop } from "./types";
import type { AdminAction, PublicAction, StaffAction } from "./validation";

export async function publicShop(slug: string) {
  const shop = await one<Shop>(database(), "SELECT * FROM shops WHERE slug=$1", [slug]);
  requireCondition(shop, "Warung tidak ditemukan.", 404);
  return shop;
}

export async function publicCatalog(slug: string) {
  const shop = await publicShop(slug);
  const menus = await rows<PublicMenu>(database(), `SELECT id,name,category,price,stock FROM menus
    WHERE shop_id=$1 AND active AND public ORDER BY category,name`, [shop.id]);
  return { name: shop.name, demo: shop.demo, taxBps: shop.tax_bps, menus };
}

export async function publicStatus(slug: string, reference: string) {
  const shop = await publicShop(slug);
  const order = await one<PublicStatus>(database(), `SELECT 'order' kind,reference,date,slot,status,items,subtotal,tax,total
    FROM orders WHERE shop_id=$1 AND reference=$2`, [shop.id, reference]);
  if (order) return order;
  const booking = await one<PublicStatus>(database(), `SELECT 'booking' kind,reference,date,slot,status,guests
    FROM bookings WHERE shop_id=$1 AND reference=$2`, [shop.id, reference]);
  requireCondition(booking, "Kode referensi tidak ditemukan.", 404);
  return booking;
}

function customerTime() {
  return new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Makassar", hourCycle: "h23" }).format(new Date());
}

export async function submitPublic(slug: string, input: PublicAction) {
  const current = await publicShop(slug);
  return transaction(async (db) => {
    const shop = await lockShop(db, current.id);
    return idempotent(db, shop.id, input.key, input, async () => {
      const today = todayWita();
      requireCondition(input.date >= today && input.date <= shiftDate(today, input.action === "order" ? 1 : 30)
        && (input.date !== today || input.slot > customerTime()), "Pilih jadwal WITA yang masih akan datang.");
      const reference = randomBytes(18).toString("base64url");
      if (input.action === "order") {
        await requireOpen(db, shop.id, input.date);
        const quoted = await quoteCart(db, shop, input.items, true);
        requireCondition(input.expected === quoted.total, "Harga berubah. Perbarui katalog sebelum mengirim.", 409);
        await db.query(`INSERT INTO orders(shop_id,reference,name,contact,date,slot,items,tax_bps,subtotal,tax,total)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`, [shop.id, reference, input.name, input.contact, input.date, input.slot,
          JSON.stringify(quoted.items), quoted.tax_bps, quoted.subtotal, quoted.tax, quoted.total]);
      } else {
        requireCondition(input.guests <= shop.slot_capacity, "Jumlah orang melebihi kapasitas slot.", 409);
        const occupied = await one<{ used: number }>(db, `SELECT COALESCE(sum(guests),0) used FROM bookings
          WHERE shop_id=$1 AND date=$2 AND slot=$3 AND status='confirmed'`, [shop.id, input.date, input.slot]);
        requireCondition((occupied?.used ?? 0) + input.guests <= shop.slot_capacity, "Slot penuh untuk jumlah orang ini. Pilih jam lain.", 409);
        await db.query(`INSERT INTO bookings(shop_id,reference,name,contact,date,slot,guests) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
          [shop.id, reference, input.name, input.contact, input.date, input.slot, input.guests]);
      }
      return { reference };
    });
  });
}

export async function orderAction(db: PoolClient, shop: Shop, actor: Actor, input: Extract<StaffAction, { action: "orderStatus" | "fulfil" }>) {
  const order = await one<CustomerOrder>(db, "SELECT * FROM orders WHERE id=$1 AND shop_id=$2", [input.id, shop.id]);
  requireCondition(order, "Pesanan tidak ditemukan.", 404);
  if (input.action === "fulfil") {
    return idempotent(db, shop.id, input.key, { actor: actor.id, ...input }, async () => {
      requireCondition(order.status === "ready", "Siapkan pesanan sebelum mencatat pembayaran.", 409);
      const date = todayWita();
      requireCondition(date >= order.date, "Pembayaran dicatat saat tanggal pengambilan atau setelahnya.", 409);
      await requireOpen(db, shop.id, date);
      requireCondition(order.total === input.expected, "Total pembayaran sudah berubah.", 409);
      const receipt = await insertReceipt(db, shop, actor, order, input.payment, date, order.id);
      await db.query("UPDATE orders SET status='completed' WHERE id=$1", [order.id]);
      return receipt;
    });
  }
  const allowed: Record<CustomerOrder["status"], string[]> = { pending: ["accepted","cancelled"], accepted: ["preparing","cancelled"], preparing: ["ready","cancelled"],
    ready: ["cancelled"], completed: [], cancelled: [] };
  if (order.status === input.status) return { ok: true };
  requireCondition(allowed[order.status].includes(input.status), "Status pesanan sudah berubah. Muat ulang antrean.", 409);
  if (input.status === "accepted") {
    requireCondition(order.date > todayWita() || (order.date === todayWita() && order.slot > customerTime()),
      "Waktu pengambilan telah lewat. Batalkan permintaan ini.", 409);
    await requireOpen(db, shop.id, todayWita());
    await requireOpen(db, shop.id, order.date);
    for (const item of order.items) {
      const active = await one(db, "SELECT 1 FROM menus WHERE shop_id=$1 AND id=$2 AND active AND public", [shop.id, item.id]);
      requireCondition(active, `Menu ${item.name} sudah tidak tersedia.`, 409);
      await moveStock(db, actor, "menu", item.id, -item.quantity, "reserve", "Alokasi pesanan " + order.id);
    }
  } else if (input.status === "cancelled" && order.status !== "pending") {
    for (const item of order.items) await moveStock(db, actor, "menu", item.id, item.quantity, "release", "Pembatalan pesanan " + order.id);
  }
  await db.query("UPDATE orders SET status=$2 WHERE id=$1", [order.id, input.status]);
  return { ok: true };
}

export async function bookingAction(db: PoolClient, shop: Shop, input: Extract<AdminAction, { action: "bookingStatus" }>) {
  const booking = await one<Booking>(db, "SELECT * FROM bookings WHERE shop_id=$1 AND id=$2", [shop.id, input.id]);
  requireCondition(booking, "Booking tidak ditemukan.", 404);
  if (booking.status === input.status) return;
  requireCondition(booking.status === "pending" || (booking.status === "confirmed" && input.status === "cancelled"),
    "Status booking sudah berubah.", 409);
  if (input.status === "confirmed") {
    requireCondition(booking.date > todayWita() || (booking.date === todayWita() && booking.slot > customerTime()),
      "Waktu booking telah lewat.", 409);
    const capacity = await one<{ used: number }>(db, `SELECT COALESCE(SUM(guests),0) used FROM bookings
      WHERE shop_id=$1 AND date=$2 AND slot=$3 AND status='confirmed'`, [shop.id, booking.date, booking.slot]);
    requireCondition((capacity?.used ?? 0) + booking.guests <= shop.slot_capacity, "Slot penuh untuk jumlah orang ini.", 409);
  }
  await db.query("UPDATE bookings SET status=$2 WHERE id=$1", [booking.id, input.status]);
}

import type { PoolClient } from "pg";
import { todayWita } from "../dates";
import { one, requireCondition, rows } from "./db";
import type { Actor, Bill, Item, MenuItem, Payment, Receipt, Shop } from "./types";
import { bill } from "./types";
import { digest } from "./password";

export async function lockShop(db: PoolClient, shopId: string) {
  const shop = await one<Shop>(db, "SELECT * FROM shops WHERE id=$1 FOR UPDATE", [shopId]);
  requireCondition(shop, "Warung tidak ditemukan.", 404);
  return shop;
}

export async function requireOpen(db: PoolClient, shopId: string, date: string) {
  const closed = await one(db, "SELECT 1 FROM day_closings WHERE shop_id=$1 AND date=$2", [shopId, date]);
  requireCondition(!closed, "Hari sudah ditutup. Admin dapat membuka kembali hari ini di Tutup Hari.", 409);
}

export async function menuFor(db: PoolClient, shopId: string, id: string) {
  const menu = await one<MenuItem>(db, "SELECT * FROM menus WHERE shop_id=$1 AND id=$2", [shopId, id]);
  requireCondition(menu, "Menu tidak ditemukan.", 404);
  return menu;
}

export async function quoteCart(db: PoolClient, shop: Shop, items: Item[], publicOnly = false) {
  const menus = await rows<MenuItem>(db, "SELECT * FROM menus WHERE shop_id=$1 AND id=ANY($2::uuid[])", [shop.id, items.map(({ id }) => id)]);
  return bill(items.map((item) => {
    const menu = menus.find((entry) => entry.id === item.id);
    requireCondition(menu && menu.active && (!publicOnly || menu.public), "Menu sudah tidak tersedia. Perbarui katalog.", 409);
    requireCondition(menu.stock >= item.quantity, `Stok ${menu.name} tinggal ${menu.stock} porsi.`, 409);
    return { ...item, name: menu.name, price: menu.price };
  }), shop.tax_bps);
}

export async function moveStock(db: PoolClient, actor: Actor, type: "menu" | "ingredient", id: string, delta: number, kind: string, reason: string) {
  const table = type === "menu" ? "menus" : "ingredients";
  const changed = await db.query(`UPDATE ${table} SET stock=stock+$3 WHERE shop_id=$1 AND id=$2
    AND stock::bigint+$3 BETWEEN 0 AND 100000000`, [actor.shop_id, id, delta]);
  requireCondition(changed.rowCount, "Stok tidak cukup atau item tidak ditemukan. Perbarui data dan periksa jumlahnya.", 409);
  await db.query(`INSERT INTO stock_moves(shop_id,${type === "menu" ? "menu_id" : "ingredient_id"},date,delta,kind,reason,account_id)
    VALUES ($1,$2,$3,$4,$5,$6,$7)`, [actor.shop_id, id, todayWita(), delta, kind, reason, actor.id]);
}

export async function insertReceipt(db: PoolClient, shop: Shop, actor: Actor, quoted: Bill, payment: Payment, date: string, orderId?: string) {
  const received = payment.method === "cash" ? payment.received : null;
  requireCondition(received === null || received >= quoted.total, "Uang tunai yang diterima masih kurang.");
  const receipt = await one<Receipt>(db, `INSERT INTO transactions
    (shop_id,shop_name,account_id,order_id,date,items,tax_bps,subtotal,tax,total,method,received,change_due)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`, [
    shop.id, shop.name, actor.id, orderId ?? null, date, JSON.stringify(quoted.items),
    quoted.tax_bps, quoted.subtotal, quoted.tax, quoted.total, payment.method, received, received === null ? null : received - quoted.total,
  ]);
  requireCondition(receipt, "Transaksi gagal tersimpan.", 503);
  return receipt;
}

// The caller holds the shop row lock. Retries return the original committed result.
export async function idempotent<T>(db: PoolClient, shopId: string, key: string, payload: unknown, work: () => Promise<T>) {
  const fingerprint = digest(JSON.stringify(payload));
  const previous = await one<{ fingerprint: string; result: T }>(db, "SELECT fingerprint,result FROM operations_keys WHERE shop_id=$1 AND key=$2", [shopId, key]);
  if (previous) {
    requireCondition(previous.fingerprint === fingerprint, "Kode percobaan sudah digunakan untuk isian lain.", 409);
    return previous.result;
  }
  const result = await work();
  await db.query("INSERT INTO operations_keys(shop_id,key,fingerprint,result) VALUES ($1,$2,$3,$4)",
    [shopId, key, fingerprint, JSON.stringify(result)]);
  return result;
}

export async function audit(db: PoolClient, actor: Actor, action: string, detail: unknown) {
  await db.query("INSERT INTO audit_events(shop_id,account_id,action,detail) VALUES ($1,$2,$3,$4)",
    [actor.shop_id, actor.id, action, JSON.stringify(detail)]);
}

import { shiftDate, todayWita } from "../dates";
import { database, one, requireCondition, rows } from "./db";
import { closeData, planData, receipts, reportData, restock, summary } from "./reporting";
import type { Account, Actor, Booking, CustomerOrder, Ingredient, MenuItem, Recipe, Shop } from "./types";
import { date, period } from "./validation";

export async function readView(actor: Actor, params: URLSearchParams) {
  const db = database();
  const shop = await one<Shop>(db, "SELECT * FROM shops WHERE id=$1", [actor.shop_id]);
  requireCondition(shop, "Warung tidak ditemukan.", 404);
  const today = todayWita();
  const tomorrow = shiftDate(today, 1);
  const section = params.get("view") ?? "cashier";
  const allowedStaff = ["cashier", "orders", "receipts"];
  requireCondition(actor.role === "admin" || allowedStaff.includes(section), "Halaman ini khusus Admin.", 403);
  const base = { today, tomorrow, name: shop.name, slug: shop.slug, demo: shop.demo, taxBps: shop.tax_bps };
  const menus = (activeOnly = false) => rows<MenuItem>(db, `SELECT id,name,category,price,stock,active,public,recipe_complete
    FROM menus WHERE shop_id=$1 AND ($2::boolean=false OR active) ORDER BY category,name`, [shop.id, activeOnly]);
  switch (section) {
    case "cashier": return { ...base, menus: (await menus(true)).map(({ id, name, category, price, stock }) => ({ id, name, category, price, stock })),
      closed: !!(await one(db, "SELECT 1 FROM day_closings WHERE shop_id=$1 AND date=$2", [shop.id, today])) };
    case "receipts": {
      const { start, end } = period.parse({ start: params.get("start") ?? today, end: params.get("end") ?? today });
      return { ...base, transactions: await receipts(db, shop.id, start, end, actor.role === "cashier" ? actor.id : undefined) };
    }
    case "orders": {
      const orders = await rows<CustomerOrder>(db, `SELECT id,reference,name,contact,date,slot,status,items,tax_bps,subtotal,tax,total
        FROM orders WHERE shop_id=$1 ORDER BY status IN ('completed','cancelled'),date,slot,created_at DESC LIMIT 100`, [shop.id]);
      const bookings = actor.role === "admin" ? await rows<Booking>(db, `SELECT id,reference,name,contact,date,slot,guests,status FROM bookings
        WHERE shop_id=$1 ORDER BY status <> 'pending',date DESC,slot LIMIT 100`, [shop.id]) : [];
      return { ...base, orders, bookings, capacity: actor.role === "admin" ? shop.slot_capacity : null };
    }
    case "home": {
      const [report, low, supplies, counts] = await Promise.all([
        summary(db, shop.id, today, today),
        rows<MenuItem>(db, "SELECT id,name,stock FROM menus WHERE shop_id=$1 AND active AND stock<=5 ORDER BY stock,name", [shop.id]),
        restock(db, shop.id, tomorrow),
        one<{ orders: number; bookings: number; closed: boolean }>(db, `SELECT
          (SELECT count(*) FROM orders WHERE shop_id=$1 AND status='pending') orders,
          (SELECT count(*) FROM bookings WHERE shop_id=$1 AND status='pending') bookings,
          EXISTS(SELECT 1 FROM day_closings WHERE shop_id=$1 AND date=$2) closed`, [shop.id, today]),
      ]);
      return { ...base, report, low, supplies, counts };
    }
    case "stock": {
      const [catalog, ingredients, recipes, supplies, movements] = await Promise.all([
        menus(), rows<Ingredient>(db, "SELECT id,name,unit,stock,minimum FROM ingredients WHERE shop_id=$1 ORDER BY name", [shop.id]),
        rows<Recipe>(db, `SELECT r.menu_id,r.ingredient_id,r.quantity FROM recipes r JOIN menus m ON m.id=r.menu_id
          WHERE m.shop_id=$1`, [shop.id]),
        restock(db, shop.id, tomorrow),
        rows(db, `SELECT s.id,s.date,s.delta,s.kind,s.reason,COALESCE(m.name,i.name) name FROM stock_moves s
          LEFT JOIN menus m ON m.id=s.menu_id LEFT JOIN ingredients i ON i.id=s.ingredient_id
          WHERE s.shop_id=$1 ORDER BY s.created_at DESC,s.id DESC LIMIT 20`, [shop.id]),
      ]);
      return { ...base, menus: catalog, ingredients, recipes, supplies, movements };
    }
    case "plan": return { ...base, menus: await menus(), ...await planData(shop.id) };
    case "close": {
      const selected = date.parse(params.get("date") ?? today);
      requireCondition(selected <= today, "Tanggal belum terjadi.");
      return { ...base, ...await closeData(shop.id, selected) };
    }
    case "report": {
      const { start, end } = period.parse({ start: params.get("start") ?? today, end: params.get("end") ?? today });
      return { ...base, ...await reportData(shop.id, start, end) };
    }
    case "settings": return { ...base, capacity: shop.slot_capacity,
      accounts: await rows<Account>(db, "SELECT id,email,name,active FROM accounts WHERE shop_id=$1 AND role='cashier' ORDER BY name", [shop.id]) };
    default: throw new Error("Unknown operations view");
  }
}

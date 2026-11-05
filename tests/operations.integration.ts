import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import test from "node:test";
import { database, one } from "../src/lib/operations/db.ts";
import { hashPassword, digest } from "../src/lib/operations/password.ts";
import { makeDemo } from "../src/lib/data.ts";
import type { CloseRow, PlanRow, Receipt, Report, Restock } from "../src/lib/operations/types.ts";
import type { Forecast } from "../src/lib/forecast.ts";
import { todayWita, shiftDate } from "../src/lib/dates.ts";

const origin = process.env.TEST_ORIGIN ?? "http://127.0.0.1:3000";
const db = database();
const password = "VerifyPaonPlan2026!";
const fixtureId = randomUUID().slice(0, 8);
const emails = ["admin", "cashier", "second"].map((role) => role + "-" + fixtureId + "@paonplan.test");
const shopIds: string[] = [];
type TestPayload = {
  id: string; reference: string; change_due: number; kind: string;
  result: Forecast; quote: string; rows: CloseRow[]; transactions: Receipt[]; report: Report;
  supplies: { items: Restock[] }; plans: PlanRow[]; latest: Receipt[];
};
type HttpResult = { status: number; data: TestPayload };
type Session = { call: (body: Record<string, unknown>) => Promise<HttpResult>; get: (path: string) => Promise<HttpResult>; cookie: string };

async function login(email: string): Promise<Session> {
  const response = await fetch(origin + "/api/usaha", { method: "POST",
    headers: { "Content-Type": "application/json", Origin: origin }, body: JSON.stringify({ action: "login", email, password }) });
  assert.equal(response.status, 200, await response.clone().text());
  const cookie = response.headers.get("set-cookie")!.split(";")[0];
  return {
    cookie,
    async call(body) {
      const result = await fetch(origin + "/api/usaha", { method: "POST",
        headers: { "Content-Type": "application/json", Origin: origin, Cookie: cookie }, body: JSON.stringify({ operationKey: randomUUID(), ...body }) });
      return { status: result.status, data: await result.json() as TestPayload };
    },
    async get(path) {
      const result = await fetch(origin + path, { headers: { Cookie: cookie } });
      return { status: result.status, data: await result.json() as TestPayload };
    },
  };
}

async function fixture() {
  const hash = await hashPassword(password);
  const shop = await one<{ id: string }>(db, "INSERT INTO shops(slug,name,tax_bps,slot_capacity,demo) VALUES ($1,$2,1000,4,true) RETURNING id",
    ["verify-" + fixtureId, "Warung Verifikasi · Data Fiktif"]);
  const other = await one<{ id: string }>(db, "INSERT INTO shops(slug,name,demo) VALUES ($1,'Warung verifikasi lain',true) RETURNING id", ["other-" + fixtureId]);
  shopIds.push(shop!.id, other!.id);
  for (const [index, role] of ["admin","cashier","cashier"].entries()) {
    await db.query("INSERT INTO accounts(shop_id,email,name,password_hash,role) VALUES ($1,$2,$3,$4,$5)",
      [shop!.id, emails[index], "Akun verifikasi " + role + index, hash, role]);
  }
  const main = await one<{ id: string }>(db, `INSERT INTO menus(shop_id,name,category,price,stock,recipe_complete)
    VALUES ($1,'Nasi Ayam','Makanan',25000,20,true) RETURNING id`, [shop!.id]);
  const last = await one<{ id: string }>(db, "INSERT INTO menus(shop_id,name,category,price,stock) VALUES ($1,'Porsi terakhir','Uji',10000,1) RETURNING id", [shop!.id]);
  const foreign = await one<{ id: string }>(db, "INSERT INTO menus(shop_id,name,category,price) VALUES ($1,'Menu warung lain','Uji',1000) RETURNING id", [other!.id]);
  const ingredient = await one<{ id: string }>(db, "INSERT INTO ingredients(shop_id,name,unit,stock,minimum) VALUES ($1,'Merica','g',50,45) RETURNING id", [shop!.id]);
  await db.query("INSERT INTO recipes(menu_id,ingredient_id,quantity) VALUES ($1,$2,2)", [main!.id, ingredient!.id]);
  for (const row of makeDemo().sales.filter((row) => row.menuId === "nasi-ayam")) {
    await db.query("INSERT INTO daily_sales(shop_id,menu_id,date,source,prepared,sold,stockout,event) VALUES ($1,$2,$3,'manual',$4,$5,$6,$7)",
      [shop!.id, main!.id, row.date, row.prepared, row.sold, row.stockout, row.event]);
  }
  return { shop: shop!.id, main: main!.id, last: last!.id, foreign: foreign!.id, ingredient: ingredient!.id, slug: "verify-" + fixtureId };
}

async function cleanup() {
  if (!shopIds.length) return;
  await db.query("DELETE FROM sessions WHERE account_id IN (SELECT id FROM accounts WHERE shop_id=ANY($1))", [shopIds]);
  for (const table of ["operations_keys","audit_events","day_closings","daily_sales","production_plans","stock_moves","purchases","expenses","transactions","orders","bookings"]) {
    await db.query(`DELETE FROM ${table} WHERE shop_id=ANY($1::uuid[])`, [shopIds]);
  }
  await db.query("DELETE FROM recipes WHERE menu_id IN (SELECT id FROM menus WHERE shop_id=ANY($1))", [shopIds]);
  for (const table of ["ingredients","menus","accounts"]) await db.query(`DELETE FROM ${table} WHERE shop_id=ANY($1::uuid[])`, [shopIds]);
  await db.query("DELETE FROM shops WHERE id=ANY($1::uuid[])", [shopIds]);
  await db.query("DELETE FROM login_attempts WHERE identity=ANY($1)", [emails.map(digest)]);
}

test("shared PostgreSQL operations through authenticated HTTP entry points", { timeout: 120000 }, async (t) => {
  try {
    const f = await fixture();
    const admin = await login(emails[0]);
    const cashier = await login(emails[1]);
    const second = await login(emails[2]);
    const today = todayWita();
    const tomorrow = shiftDate(today, 1);
    const stock = async (id: string) => (await one<{ stock: number }>(db, "SELECT stock FROM menus WHERE id=$1", [id]))!.stock;
    const pepper = async () => (await one<{ stock: number }>(db, "SELECT stock FROM ingredients WHERE id=$1", [f.ingredient]))!.stock;
    const checkout = (id: string, key = randomUUID(), qty = 1, received = 1000000) => ({
      action: "checkout", key, items: [{ id, quantity: qty }], expected: id === f.main ? 27500 * qty : 11000 * qty,
      payment: { method: "cash", received },
    });
    let firstReceipt = "";
    await t.test("cashier cannot read admin views, mutate prices or cross tenant boundaries", async () => {
      assert.equal((await cashier.get("/api/usaha?view=report")).status, 403);
      assert.equal((await cashier.get("/api/usaha?view=settings")).status, 403);
      assert.equal((await cashier.get("/api/usaha?view=home")).status, 403);
      assert.equal((await cashier.call({ action: "settings", name: "X", taxBps: 0, capacity: 4 })).status, 403);
      assert.equal((await admin.call({ action: "adjust", type: "menu", id: f.foreign, delta: 1, reason: "Uji batas warung" })).status, 409);
      const unauth = await fetch(origin + "/api/usaha?view=stock");
      assert.equal(unauth.status, 401);
    });
    await t.test("atomic checkout rejects underpayment and unconfirmed QRIS, deduplicates parallel retries", async () => {
      assert.equal((await cashier.call(checkout(f.main, randomUUID(), 1, 20000))).status, 400);
      assert.equal(await stock(f.main), 20);
      assert.equal((await cashier.call({ ...checkout(f.main), payment: { method: "qris", confirmed: false } })).status, 400);
      const input = checkout(f.main);
      const results = await Promise.all([cashier.call(input), cashier.call(input)]);
      assert.deepEqual(results.map((row) => row.status), [200, 200]);
      assert.equal(results[0].data.id, results[1].data.id);
      firstReceipt = results[0].data.id;
      assert.equal(results[0].data.change_due, 972500);
      assert.equal(await stock(f.main), 19);
      assert.equal((await cashier.call({ ...input, payment: { method: "cash", received: 50000 } })).status, 409);
    });
    await t.test("two cashiers race for the last portion with one winner", async () => {
      const results = await Promise.all([cashier.call(checkout(f.last)), second.call(checkout(f.last))]);
      assert.deepEqual(results.map((row) => row.status).sort(), [200, 409]);
      assert.equal(await stock(f.last), 0);
    });
    await t.test("production consumes ingredients once, purchases link one expense and old receipt prices remain", async () => {
      const batch = { operationKey: randomUUID(), action: "produce", menuId: f.main, portions: 5, mode: "recipe", usage: [], reason: "Batch uji" };
      const made = await admin.call(batch);
      assert.equal(made.status, 200, JSON.stringify(made.data));
      assert.equal((await admin.call(batch)).status, 200);
      assert.equal(await pepper(), 40);
      const paid = await cashier.call({ ...checkout(f.main), payment: { method: "qris", confirmed: true } });
      assert.equal(paid.status, 200);
      assert.equal(await pepper(), 40);
      const purchaseInput = { operationKey: randomUUID(), action: "purchase", ingredientId: f.ingredient, date: today, quantity: 100, packageSize: 100, amount: 12000, method: "cash" };
      const purchase = await admin.call(purchaseInput);
      assert.equal(purchase.status, 200, JSON.stringify(purchase.data));
      assert.equal((await admin.call(purchaseInput)).status, 200);
      assert.equal(await pepper(), 140);
      const expenseCount = await one<{ n: number }>(db, "SELECT count(*) n FROM expenses WHERE shop_id=$1", [f.shop]);
      assert.equal(expenseCount!.n, 1);
      const updated = await admin.call({ action: "menu", id: f.main, name: "Nasi Ayam baru", category: "Makanan", price: 30000, active: true, public: true });
      assert.equal(updated.status, 200);
      const old = await one<{ items: { price: number; name: string }[] }>(db, "SELECT items FROM transactions WHERE id=$1", [firstReceipt]);
      assert.equal(old!.items[0].price, 25000);
      assert.equal(old!.items[0].name, "Nasi Ayam");
      assert.equal((await cashier.call(checkout(f.main))).status, 409);
      await admin.call({ action: "menu", id: f.main, name: "Nasi Ayam", category: "Makanan", price: 25000, active: true, public: true });
    });
    const publicPost = async (body: Record<string, unknown>) => {
      const result = await fetch(origin + "/api/warung/" + f.slug, { method: "POST", headers: { "Content-Type": "application/json", Origin: origin }, body: JSON.stringify({ operationKey: randomUUID(), ...body }) });
      return { status: result.status, data: await result.json() as TestPayload };
    };
    const orderInput = (id: string, qty = 1) => ({ action: "order", key: randomUUID(), name: "Pelanggan fiktif", contact: "Kontak uji", date: tomorrow,
      slot: "12:00", items: [{ id, quantity: qty }], expected: (id === f.main ? 27500 : 11000) * qty });
    await t.test("public order acceptance and cashier share the last portion, cancellation releases allocations", async () => {
      await admin.call({ action: "adjust", type: "menu", id: f.last, delta: 1, reason: "Skenario alokasi" });
      const order = await publicPost(orderInput(f.last));
      assert.equal(order.status, 201);
      const entry = await one<{ id: string }>(db, "SELECT id FROM orders WHERE reference=$1", [order.data.reference]);
      const result = await Promise.all([cashier.call(checkout(f.last)), admin.call({ action: "orderStatus", id: entry!.id, status: "accepted" })]);
      assert.deepEqual(result.map((row) => row.status).sort(), [200, 409]);
      assert.equal(await stock(f.last), 0);
      if (result[1].status === 200) {
        assert.equal((await admin.call({ action: "orderStatus", id: entry!.id, status: "cancelled" })).status, 200);
        assert.equal(await stock(f.last), 1);
      }
    });
    await t.test("online fulfilment records payment without a second stock deduction and status hides contacts", async () => {
      const input = orderInput(f.main, 2);
      const submitted = await publicPost(input);
      assert.equal((await publicPost(input)).data.reference, submitted.data.reference);
      const ref = submitted.data.reference;
      const entry = await one<{ id: string }>(db, "SELECT id FROM orders WHERE reference=$1", [ref]);
      const before = await stock(f.main);
      for (const status of ["accepted", "preparing", "ready"]) {
        assert.equal((await cashier.call({ action: "orderStatus", id: entry!.id, status })).status, 200);
      }
      assert.equal(await stock(f.main), before - 2);
      const fulfill = { action: "fulfil", id: entry!.id, key: randomUUID(), expected: 55000, payment: { method: "cash", received: 60000 } };
      assert.equal((await cashier.call(fulfill)).status, 409);
      // Represent arrival of the scheduled pickup day while retaining the real request transitions.
      await db.query("UPDATE orders SET date=$2 WHERE id=$1", [entry!.id, today]);
      const completed = await cashier.call(fulfill);
      assert.equal(completed.status, 200, JSON.stringify(completed.data));
      assert.equal(completed.data.change_due, 5000);
      assert.equal((await cashier.call(fulfill)).data.id, completed.data.id);
      assert.equal(await stock(f.main), before - 2);
      const response = await fetch(origin + "/api/warung/" + f.slug + "?ref=" + ref);
      const status = await response.json();
      assert.equal(status.status, "completed");
      assert.equal(status.contact, undefined);
      assert.equal(status.name, undefined);
      assert.equal((await fetch(origin + "/api/warung/" + f.slug + "?ref=" + "a".repeat(24))).status, 404);
    });
    await t.test("booking capacity confirmation is atomic and never changes portions", async () => {
      const before = await stock(f.main);
      const create = () => publicPost({ action: "booking", key: randomUUID(), name: "Tamu fiktif", contact: "Kontak uji", date: tomorrow, slot: "14:00", guests: 3 });
      const first = await create();
      const second = await create();
      const bookings = (await db.query<{ id: string }>("SELECT id FROM bookings WHERE shop_id=$1 ORDER BY id", [f.shop])).rows;
      assert.equal(first.status, 201); assert.equal(second.status, 201);
      const confirmed = await Promise.all(bookings.map((row) => admin.call({ action: "bookingStatus", id: row.id, status: "confirmed" })));
      assert.deepEqual(confirmed.map((row) => row.status).sort(), [200, 409]);
      assert.equal(await stock(f.main), before);
    });
    await t.test("closed POS recap feeds the forecast, excludes future records and computes 30g restock from 70g need", async () => {
      const before = await admin.call({ action: "forecast", menuId: f.main, date: tomorrow, event: false });
      assert.equal(before.status, 200);
      await db.query("INSERT INTO daily_sales(shop_id,menu_id,date,source,prepared,sold,stockout,event) VALUES ($1,$2,$3,'manual',999,999,false,false)",
        [f.shop, f.main, tomorrow]);
      assert.deepEqual((await admin.call({ action: "forecast", menuId: f.main, date: tomorrow, event: false })).data, before.data);
      const close = await admin.get("/api/usaha?view=close");
      const closeRows = close.data.rows.filter((row) => row.sold > 0 || row.included)
        .map((row) => ({ id: row.id, sold: row.sold, prepared: Math.max(10, row.sold), stockout: false, event: false }));
      const closed = await admin.call({ action: "close", date: today, rows: closeRows, opening: 100000, counted: 200000, other: 0 });
      assert.equal(closed.status, 200, JSON.stringify(closed.data));
      assert.equal((await cashier.call(checkout(f.main))).status, 409);
      const after = await admin.call({ action: "forecast", menuId: f.main, date: tomorrow, event: false });
      assert.equal(after.data.result.observed, before.data.result.observed + 1);
      const records = await db.query("SELECT * FROM daily_sales WHERE shop_id=$1 AND menu_id=$2 AND date=$3", [f.shop, f.main, today]);
      assert.equal(records.rowCount, 1); assert.equal(records.rows[0].source, "pos"); assert.equal(records.rows[0].sold, 4);
      const saved = await admin.call({ action: "plan", menuId: f.main, date: tomorrow, event: false, portions: 35, quote: after.data.quote });
      assert.equal(saved.status, 200);
      const home = await admin.get("/api/usaha?view=home");
      assert.equal(home.status, 200);
      assert.equal(home.data.plans.find((row) => row.menu_id === f.main)?.portions, 35);
      assert.ok(home.data.latest.length > 0 && home.data.latest.length <= 3);
      assert.ok(home.data.latest.every((row) => row.items.every((item) => [f.main, f.last].includes(item.id))));
      await admin.call({ action: "adjust", type: "ingredient", id: f.ingredient, delta: -100, reason: "Skenario stok 40g" });
      const plan = await admin.get("/api/usaha?view=plan");
      const pepperRow = plan.data.supplies.items.find((item) => item.id === f.ingredient);
      assert.ok(pepperRow);
      assert.deepEqual([pepperRow.stock, pepperRow.needed, pepperRow.shortage, pepperRow.cost, pepperRow.packCost], [40,70,30,3600,12000]);
      assert.equal((await admin.call({ action: "void", id: firstReceipt, reason: "Uji hari tertutup", restock: true })).status, 409);
      assert.equal((await admin.call({ action: "note", date: today })).data.kind, "Ringkasan dari catatan usaha");
      const report = await admin.get("/api/usaha?view=report");
      assert.equal(report.data.report.expenses, 12000);
      const sales = report.data.transactions.filter((row) => !row.voided_at);
      assert.equal(sales.reduce((sum, row) => sum + row.total, 0), report.data.report.cash + report.data.report.qris);
      const reopen = await admin.call({ action: "reopen", date: today, reason: "Uji koreksi admin" });
      assert.equal(reopen.status, 200);
      const preVoid = await stock(f.main);
      assert.equal((await admin.call({ action: "void", id: firstReceipt, reason: "Porsi kembali layak jual dan dana dikembalikan", restock: true })).status, 200);
      assert.equal(await stock(f.main), preVoid + 1);
    });
    await t.test("a many-row PDF report is downloadable only by admin", async () => {
      for (let index = 0; index < 85; index++) {
        await db.query(`INSERT INTO transactions(shop_id,shop_name,account_id,date,items,tax_bps,subtotal,tax,total,method)
          SELECT shop_id,'Warung Verifikasi - Data Fiktif',id,$2,$3,1000,25000,2500,27500,'qris'
          FROM accounts WHERE email=$1`, [emails[1], shiftDate(today, -1), JSON.stringify([{ id: f.main, name: "Nasi Ayam verifikasi laporan " + index, price: 25000, quantity: 1 }])]);
      }
      const path = "/api/usaha/laporan?start=" + shiftDate(today,-1) + "&end=" + today;
      assert.equal((await fetch(origin + path, { headers: { Cookie: cashier.cookie } })).status, 403);
      const pdf = await fetch(origin + path, { headers: { Cookie: admin.cookie } });
      assert.equal(pdf.status, 200, await pdf.clone().text());
      const buffer = Buffer.from(await pdf.arrayBuffer());
      assert.equal(buffer.subarray(0,4).toString(), "%PDF");
      await mkdir("output/pdf", { recursive: true });
      await writeFile("output/pdf/laporan-verifikasi.pdf", buffer);
    });
  } finally {
    await cleanup();
    await db.end();
  }
});

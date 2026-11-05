import { database, one, transaction } from "../src/lib/operations/db.ts";
import { makeDemo } from "../src/lib/data.ts";
import { todayWita, shiftDate } from "../src/lib/dates.ts";
import { hashPassword } from "../src/lib/operations/password.ts";
import { email, password, slug } from "../src/lib/operations/validation.ts";

const demo = process.argv.includes("--demo");
const ownerEmail = demo ? "admin@paonplan.test" : email.parse(process.env.OWNER_EMAIL);
const ownerPassword = demo ? "PaonPlanDemo2026!" : password.parse(process.env.OWNER_PASSWORD);
const shopSlug = demo ? "demo" : slug.parse(process.env.SHOP_SLUG);
const name = demo ? "Warung Paon Sari" : process.env.SHOP_NAME?.trim();
if (!name || name.length > 80 || (!demo && shopSlug === "demo")) throw new Error("Isi SHOP_NAME dan SHOP_SLUG usaha.");

try {
  const hash = await hashPassword(ownerPassword);
  await transaction(async (db) => {
    await db.query("SELECT pg_advisory_xact_lock(752010902)");
    const shop = await one<{ id: string }>(db, `INSERT INTO shops(slug,name,demo,slot_capacity) VALUES ($1,$2,$3,$4)
      ON CONFLICT(slug) DO NOTHING RETURNING id`, [shopSlug, name, demo, demo ? 6 : 12]);
    if (!shop) {
      console.log("Warung sudah tersedia. Data dan akun yang ada dipertahankan.");
      return;
    }
    const owner = await one<{ id: string }>(db, `INSERT INTO accounts(shop_id,email,name,password_hash,role)
      VALUES ($1,$2,$3,$4,'admin') RETURNING id`, [shop.id, ownerEmail, demo ? "Ayu · Admin" : "Pemilik", hash]);
    if (!demo) return;
    await db.query("INSERT INTO accounts(shop_id,email,name,password_hash,role) VALUES ($1,$2,$3,$4,'cashier')",
      [shop.id, "kasir@paonplan.test", "Made · Kasir", hash]);
    const names = [["Nasi Ayam", "Nasi", 25000, 14, true], ["Sate Lilit", "Lauk", 18000, 8, false],
      ["Es Jeruk", "Minuman", 10000, 12, false], ["Nasi Jinggo", "Nasi", 12000, 10, false]];
    const menuIds = new Map<string, string>();
    for (const [menu, category, price, stock, complete] of names) {
      const entry = await one<{ id: string }>(db, `INSERT INTO menus(shop_id,name,category,price,stock,recipe_complete)
        VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`, [shop.id, menu, category, price, stock, complete]);
      menuIds.set(String(menu), entry!.id);
    }
    const history = makeDemo();
    const sampleIds = new Map([["nasi-ayam","Nasi Ayam"],["nasi-jinggo","Nasi Jinggo"],["sate-lilit","Sate Lilit"]]);
    for (const sale of history.sales) {
      await db.query(`INSERT INTO daily_sales(shop_id,menu_id,date,source,prepared,sold,stockout,event)
        VALUES ($1,$2,$3,'manual',$4,$5,$6,$7)`, [shop.id, menuIds.get(sampleIds.get(sale.menuId)!), sale.date,
        sale.prepared, sale.sold, sale.stockout, sale.event]);
    }
    for (const [ingredient, stock, minimum, perPortion, unit, amount, purchaseQuantity, pack] of [
      ["Merica", 40, 50, 2, "g", 12000, 100, 100],
      ["Beras", 3500, 1000, 60, "g", 75000, 5000, 5000],
      ["Ayam", 1800, 500, 50, "g", 96000, 3000, null],
    ]) {
      const item = await one<{ id: string }>(db, `INSERT INTO ingredients(shop_id,name,unit,stock,minimum)
        VALUES ($1,$2,$3,$4,$5) RETURNING id`, [shop.id, ingredient, unit, stock, minimum]);
      await db.query("INSERT INTO recipes(menu_id,ingredient_id,quantity) VALUES ($1,$2,$3)", [menuIds.get("Nasi Ayam"), item!.id, perPortion]);
      const expense = await one<{ id: string }>(db, `INSERT INTO expenses(shop_id,date,category,description,amount,method,account_id)
        VALUES ($1,$2,'ingredient',$3,$4,'cash',$5) RETURNING id`, [shop.id, shiftDate(todayWita(), -2), "Pembelian " + ingredient, amount, owner!.id]);
      await db.query("INSERT INTO purchases(shop_id,ingredient_id,expense_id,quantity,package_size) VALUES ($1,$2,$3,$4,$5)",
        [shop.id, item!.id, expense!.id, purchaseQuantity, pack]);
    }
  });
  console.log(demo ? "Demo terpisah tersedia di /usaha dan /warung/demo." : "Akun pemilik dan warung siap.");
} finally { await database().end(); }

import type { PoolClient } from "pg";
import { todayWita } from "../dates";
import { validSale } from "../data";
import { bookingAction, orderAction } from "./customers";
import { one, requireCondition, rows, transaction } from "./db";
import { audit, idempotent, insertReceipt, lockShop, menuFor, moveStock, quoteCart, requireOpen } from "./inventory";
import { hashPassword } from "./password";
import { calculate, soldByMenu } from "./reporting";
import type { Actor, Ingredient, Receipt, Recipe, Shop } from "./types";
import type { AdminAction, StaffAction } from "./validation";

async function staff(db: PoolClient, shop: Shop, actor: Actor, input: StaffAction) {
  if (input.action !== "checkout") return orderAction(db, shop, actor, input);
  return idempotent(db, shop.id, input.key, { actor: actor.id, ...input }, async () => {
    const date = todayWita();
    await requireOpen(db, shop.id, date);
    const quoted = await quoteCart(db, shop, input.items);
    requireCondition(quoted.total === input.expected, "Harga atau pajak berubah. Muat ulang katalog sebelum menerima pembayaran.", 409);
    const receipt = await insertReceipt(db, shop, actor, quoted, input.payment, date);
    for (const item of quoted.items) await moveStock(db, actor, "menu", item.id, -item.quantity, "sale", "Penjualan " + receipt.id);
    return receipt;
  });
}

async function ingredientFor(db: PoolClient, shopId: string, id: string) {
  const ingredient = await one<Ingredient>(db, "SELECT * FROM ingredients WHERE id=$1 AND shop_id=$2", [id, shopId]);
  requireCondition(ingredient, "Bahan tidak ditemukan.", 404);
  return ingredient;
}

function validDaily(date: string, menuId: string, input: { prepared: number; sold: number; stockout: boolean; event: boolean }) {
  requireCondition(validSale({ date, menuId, ...input }),
    "Porsi disiapkan harus cukup untuk porsi terjual. Jika habis sebelum tutup, semua porsi disiapkan harus terjual.", 409);
}

async function admin(db: PoolClient, shop: Shop, actor: Actor, input: AdminAction) {
  switch (input.action) {
    case "settings": {
      const booked = await one<{ guests: number }>(db, `SELECT COALESCE(max(used),0)::bigint guests FROM (
        SELECT sum(guests) used FROM bookings WHERE shop_id=$1 AND date>=$2 AND status='confirmed' GROUP BY date,slot) AS slots`, [shop.id, todayWita()]);
      requireCondition(input.capacity >= (booked?.guests ?? 0), "Kapasitas baru lebih kecil dari booking yang telah dikonfirmasi.", 409);
      await db.query("UPDATE shops SET name=$2,tax_bps=$3,slot_capacity=$4 WHERE id=$1", [shop.id, input.name, input.taxBps, input.capacity]);
      break;
    }
    case "account": {
      const passwordHash = input.password ? await hashPassword(input.password) : null;
      if (input.id) {
        const updated = await db.query(`UPDATE accounts SET name=$3,email=$4,active=$5,password_hash=COALESCE($6,password_hash)
          WHERE id=$1 AND shop_id=$2 AND role='cashier'`, [input.id, shop.id, input.name, input.email, input.active, passwordHash]);
        requireCondition(updated.rowCount, "Akun kasir tidak ditemukan.", 404);
        if (!input.active || passwordHash) await db.query("DELETE FROM sessions WHERE account_id=$1", [input.id]);
      } else {
        requireCondition(passwordHash, "Isi sandi kasir minimal 12 karakter.");
        await db.query("INSERT INTO accounts(shop_id,name,email,active,password_hash,role) VALUES ($1,$2,$3,$4,$5,'cashier')",
          [shop.id, input.name, input.email, input.active, passwordHash]);
      }
      break;
    }
    case "menu": {
      if (input.id) {
        await menuFor(db, shop.id, input.id);
        await db.query("UPDATE menus SET name=$2,category=$3,price=$4,active=$5,public=$6 WHERE id=$1",
          [input.id, input.name, input.category, input.price, input.active, input.public]);
      } else {
        await db.query("INSERT INTO menus(shop_id,name,category,price,active,public) VALUES ($1,$2,$3,$4,$5,$6)",
          [shop.id, input.name, input.category, input.price, input.active, input.public]);
      }
      break;
    }
    case "ingredient": {
      if (input.id) {
        const ingredient = await ingredientFor(db, shop.id, input.id);
        requireCondition(ingredient.unit === input.unit, "Gunakan satuan awal bahan agar stok dan riwayat tetap konsisten.");
        await db.query("UPDATE ingredients SET name=$2,minimum=$3 WHERE id=$1", [input.id, input.name, input.minimum]);
      } else {
        await db.query("INSERT INTO ingredients(shop_id,name,unit,minimum) VALUES ($1,$2,$3,$4)", [shop.id, input.name, input.unit, input.minimum]);
      }
      break;
    }
    case "recipe": {
      await menuFor(db, shop.id, input.menuId);
      requireCondition(!input.complete || input.lines.length, "Tambahkan bahan sebelum menandai resep lengkap.");
      await db.query("DELETE FROM recipes WHERE menu_id=$1", [input.menuId]);
      for (const item of input.lines) {
        await ingredientFor(db, shop.id, item.id);
        await db.query("INSERT INTO recipes(menu_id,ingredient_id,quantity) VALUES ($1,$2,$3)", [input.menuId, item.id, item.quantity]);
      }
      await db.query("UPDATE menus SET recipe_complete=$2 WHERE id=$1", [input.menuId, input.complete]);
      break;
    }
    case "adjust": {
      if (input.type === "menu") await requireOpen(db, shop.id, todayWita());
      await moveStock(db, actor, input.type, input.id, input.delta, "adjustment", input.reason);
      break;
    }
    case "produce": {
      await requireOpen(db, shop.id, todayWita());
      const menu = await menuFor(db, shop.id, input.menuId);
      requireCondition(menu.active, "Aktifkan menu sebelum mencatat produksi.");
      let usage = input.usage;
      if (input.mode === "recipe") {
        requireCondition(menu.recipe_complete, "Resep belum lengkap. Isi pemakaian aktual atau tandai pemakaian belum dicatat.");
        const recipe = await rows<Recipe>(db, "SELECT ingredient_id,quantity FROM recipes WHERE menu_id=$1", [menu.id]);
        usage = recipe.map((item) => ({ id: item.ingredient_id, quantity: item.quantity * input.portions }));
      } else if (input.mode === "actual") requireCondition(usage.length, "Isi jumlah pemakaian bahan aktual.");
      else usage = [];
      for (const item of usage) {
        requireCondition(item.quantity <= 100_000_000, "Pemakaian bahan terlalu besar untuk satu batch.");
        await moveStock(db, actor, "ingredient", item.id, -item.quantity, "consumption", input.reason);
      }
      await moveStock(db, actor, "menu", menu.id, input.portions, input.mode === "unknown" ? "production_incomplete" : "production", input.reason);
      break;
    }
    case "purchase": {
      requireCondition(input.date <= todayWita(), "Tanggal pembelian belum terjadi.");
      await requireOpen(db, shop.id, input.date);
      const ingredient = await ingredientFor(db, shop.id, input.ingredientId);
      requireCondition(!input.packageSize || input.quantity % input.packageSize === 0, "Jumlah pembelian harus sesuai kelipatan ukuran kemasan.");
      const expense = await one<{ id: string }>(db, `INSERT INTO expenses(shop_id,date,category,description,amount,method,account_id)
        VALUES ($1,$2,'ingredient',$3,$4,$5,$6) RETURNING id`, [shop.id, input.date, "Pembelian " + ingredient.name, input.amount, input.method, actor.id]);
      await db.query("INSERT INTO purchases(shop_id,ingredient_id,expense_id,quantity,package_size) VALUES ($1,$2,$3,$4,$5)",
        [shop.id, ingredient.id, expense!.id, input.quantity, input.packageSize]);
      await moveStock(db, actor, "ingredient", ingredient.id, input.quantity, "purchase", "Pembelian " + expense!.id);
      break;
    }
    case "expense": {
      requireCondition(input.date <= todayWita(), "Tanggal pengeluaran belum terjadi.");
      await requireOpen(db, shop.id, input.date);
      await db.query("INSERT INTO expenses(shop_id,date,category,description,amount,method,account_id) VALUES ($1,$2,$3,$4,$5,$6,$7)",
        [shop.id, input.date, input.category, input.description, input.amount, input.method, actor.id]);
      break;
    }
    case "void": {
      const receipt = await one<Receipt>(db, "SELECT * FROM transactions WHERE id=$1 AND shop_id=$2", [input.id, shop.id]);
      requireCondition(receipt && !receipt.voided_at, "Transaksi tidak ditemukan atau sudah dibatalkan.", 409);
      await requireOpen(db, shop.id, receipt.date);
      if (input.restock) {
        await requireOpen(db, shop.id, todayWita());
        for (const item of receipt.items) await moveStock(db, actor, "menu", item.id, item.quantity, "void_return", input.reason);
      }
      await db.query("UPDATE transactions SET voided_at=now(),voided_by=$2,void_reason=$3,restocked=$4 WHERE id=$1",
        [receipt.id, actor.id, input.reason, input.restock]);
      if (receipt.order_id) await db.query("UPDATE orders SET status='cancelled' WHERE id=$1", [receipt.order_id]);
      break;
    }
    case "manual": {
      requireCondition(input.date < todayWita(), "Gunakan Tutup Hari untuk penjualan hari ini.");
      await requireOpen(db, shop.id, input.date);
      await menuFor(db, shop.id, input.menuId);
      validDaily(input.date, input.menuId, input);
      const transaction = await one(db, `SELECT 1 FROM transactions WHERE shop_id=$1 AND date=$2
        AND items @> jsonb_build_array(jsonb_build_object('id',$3::text)) LIMIT 1`, [shop.id, input.date, input.menuId]);
      requireCondition(!transaction, "Menu ini sudah memakai transaksi kasir pada tanggal tersebut.", 409);
      await db.query(`INSERT INTO daily_sales(shop_id,menu_id,date,source,prepared,sold,stockout,event)
        VALUES ($1,$2,$3,'manual',$4,$5,$6,$7) ON CONFLICT(shop_id,menu_id,date) DO UPDATE SET
        prepared=excluded.prepared,sold=excluded.sold,stockout=excluded.stockout,event=excluded.event WHERE daily_sales.source='manual'`,
        [shop.id, input.menuId, input.date, input.prepared, input.sold, input.stockout, input.event]);
      break;
    }
    case "close": {
      requireCondition(input.date <= todayWita(), "Tanggal belum bisa ditutup.");
      await requireOpen(db, shop.id, input.date);
      const sold = await soldByMenu(db, shop.id, input.date);
      requireCondition(sold.every((sale) => input.rows.some((row) => row.id === sale.id)), "Masukkan semua menu yang terjual dari transaksi selesai.", 409);
      for (const row of input.rows) {
        await menuFor(db, shop.id, row.id);
        const count = sold.find((sale) => sale.id === row.id)?.sold ?? 0;
        requireCondition(count === row.sold, "Penjualan berubah. Muat ulang rekap sebelum menutup hari.", 409);
        const manual = await one(db, "SELECT 1 FROM daily_sales WHERE shop_id=$1 AND menu_id=$2 AND date=$3 AND source='manual'",
          [shop.id, row.id, input.date]);
        requireCondition(!manual, "Menu ini sudah mempunyai catatan manual. Keluarkan dari rekap untuk mempertahankannya.", 409);
        validDaily(input.date, row.id, row);
        await db.query(`INSERT INTO daily_sales(shop_id,menu_id,date,source,prepared,sold,stockout,event)
          VALUES ($1,$2,$3,'pos',$4,$5,$6,$7) ON CONFLICT(shop_id,menu_id,date) DO UPDATE SET
          source='pos',prepared=excluded.prepared,sold=excluded.sold,stockout=excluded.stockout,event=excluded.event`,
          [shop.id, row.id, input.date, row.prepared, count, row.stockout, row.event]);
      }
      await db.query("INSERT INTO day_closings(shop_id,date,account_id,opening_cash,counted_cash,other_cash) VALUES ($1,$2,$3,$4,$5,$6)",
        [shop.id, input.date, actor.id, input.opening, input.counted, input.other]);
      await audit(db, actor, "close", input);
      break;
    }
    case "reopen": {
      const removed = await db.query("DELETE FROM day_closings WHERE shop_id=$1 AND date=$2", [shop.id, input.date]);
      requireCondition(removed.rowCount, "Hari ini masih terbuka.", 409);
      await db.query("DELETE FROM daily_sales WHERE shop_id=$1 AND date=$2 AND source='pos'", [shop.id, input.date]);
      await audit(db, actor, "reopen", input);
      break;
    }
    case "forecast": return calculate(db, actor, input.menuId, input.date, input.event);
    case "plan": {
      requireCondition(input.date >= todayWita(), "Rencana tanggal lewat hanya dapat dilihat.");
      const { result, quote } = await calculate(db, actor, input.menuId, input.date, input.event);
      requireCondition(quote === input.quote, "Catatan sudah berubah. Hitung kembali perkiraan sebelum menyimpan.", 409);
      requireCondition(result.method !== "insufficient", "Catatan belum cukup untuk memperkirakan porsi.");
      await db.query(`INSERT INTO production_plans(shop_id,menu_id,date,portions,event,forecast)
        VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT(shop_id,menu_id,date) DO UPDATE SET
        portions=excluded.portions,event=excluded.event,forecast=excluded.forecast,saved_at=now()`,
        [shop.id, input.menuId, input.date, input.portions, input.event, JSON.stringify(result)]);
      break;
    }
    case "bookingStatus": await bookingAction(db, shop, input); break;
  }
  return { ok: true };
}

export async function perform(actor: Actor, input: AdminAction | StaffAction, operationKey?: string) {
  return transaction(async (db) => {
    const shop = await lockShop(db, actor.shop_id);
    const current = await one<Actor>(db, "SELECT id,name,role,shop_id FROM accounts WHERE id=$1 AND shop_id=$2 AND active", [actor.id, shop.id]);
    requireCondition(current, "Akun sudah dinonaktifkan.", 401);
    if (input.action === "checkout" || input.action === "orderStatus" || input.action === "fulfil") return staff(db, shop, current, input);
    requireCondition(current.role === "admin", "Aksi ini khusus Admin.", 403);
    if (input.action === "forecast") return admin(db, shop, current, input);
    requireCondition(operationKey, "Kode operasi belum dikirim.");
    return idempotent(db, shop.id, operationKey, { actor: current.id, ...input }, () => admin(db, shop, current, input));
  });
}

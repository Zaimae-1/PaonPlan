import { z } from "zod";
import { validDate } from "../dates.ts";
import { slots } from "./types.ts";

export const id = z.uuid();
export const date = z.string().refine(validDate, "Tanggal tidak valid.");
export const slug = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(64);
export const email = z.email().trim().toLowerCase().max(160);
export const password = z.string().min(12, "Sandi minimal 12 karakter.").max(128);
const text = (max: number) => z.string().trim().min(1, "Isian wajib diisi.").max(max);
const money = z.number().int().min(0).max(1_000_000_000_000);
const positiveMoney = money.min(1);
const portions = z.number().int().min(0).max(100_000);
const quantity = z.number().int().min(0).max(100_000_000);
const delta = z.number().int().min(-100_000_000).max(100_000_000).refine((value) => value !== 0, "Koreksi harus mengubah stok.");
const reason = text(240);
const slot = z.string().refine((value) => slots.includes(value), "Jam harus sesuai slot WITA.");
const cart = z.array(z.object({ id, quantity: z.number().int().min(1).max(999) })).min(1, "Keranjang masih kosong.").max(40)
  .refine((items) => new Set(items.map((item) => item.id)).size === items.length, "Item keranjang ganda.");
const payment = z.discriminatedUnion("method", [
  z.object({ method: z.literal("cash"), received: money }),
  z.object({ method: z.literal("qris"), confirmed: z.literal(true) }),
]);
export const period = z.object({ start: date, end: date }).refine(({ start, end }) =>
  start <= end && Date.parse(end) - Date.parse(start) <= 366 * 86_400_000, "Pilih periode hingga 367 hari.");
export const credentials = z.object({ email, password: z.string().min(1).max(128) });
export const statusReference = z.string().regex(/^[A-Za-z0-9_-]{24}$/);
export const adminActions = z.discriminatedUnion("action", [
  z.object({ action: z.literal("settings"), name: text(80), taxBps: z.number().int().min(0).max(10_000), capacity: z.number().int().min(0).max(500) }),
  z.object({ action: z.literal("account"), id: id.optional(), name: text(80), email, password: password.optional(), active: z.boolean() }),
  z.object({ action: z.literal("menu"), id: id.optional(), name: text(80), category: text(48), price: money.max(10_000_000), active: z.boolean(), public: z.boolean() }),
  z.object({ action: z.literal("ingredient"), id: id.optional(), name: text(80), unit: z.enum(["g","ml","buah"]), minimum: quantity }),
  z.object({ action: z.literal("recipe"), menuId: id, complete: z.boolean(), lines: z.array(z.object({ id, quantity: quantity.min(1) })).max(40)
    .refine((lines) => new Set(lines.map((line) => line.id)).size === lines.length, "Bahan dalam resep ganda.") }),
  z.object({ action: z.literal("adjust"), type: z.enum(["menu","ingredient"]), id, delta, reason }),
  z.object({ action: z.literal("produce"), menuId: id, portions: portions.min(1), mode: z.enum(["recipe","actual","unknown"]),
    usage: z.array(z.object({ id, quantity: quantity.min(1) })).max(40)
      .refine((lines) => new Set(lines.map((line) => line.id)).size === lines.length, "Bahan pemakaian ganda."), reason }),
  z.object({ action: z.literal("purchase"), ingredientId: id, date, quantity: quantity.min(1), packageSize: quantity.min(1).nullable(),
    amount: positiveMoney, method: z.enum(["cash","other"]) }),
  z.object({ action: z.literal("expense"), date, category: z.enum(["ingredient","operational","salary"]), description: text(160), amount: positiveMoney, method: z.enum(["cash","other"]) }),
  z.object({ action: z.literal("void"), id, reason, restock: z.boolean() }),
  z.object({ action: z.literal("manual"), date, menuId: id, prepared: portions, sold: portions, stockout: z.boolean(), event: z.boolean() }),
  z.object({ action: z.literal("close"), date, opening: money.nullable(), counted: money.nullable(), other: z.number().int().min(-1e12).max(1e12),
    rows: z.array(z.object({ id, prepared: portions, sold: portions, stockout: z.boolean(), event: z.boolean() })).max(1000)
      .refine((lines) => new Set(lines.map((line) => line.id)).size === lines.length, "Menu rekap ganda.") }),
  z.object({ action: z.literal("reopen"), date, reason }),
  z.object({ action: z.literal("forecast"), date, menuId: id, event: z.boolean() }),
  z.object({ action: z.literal("plan"), date, menuId: id, event: z.boolean(), portions, quote: z.string().regex(/^[a-f0-9]{64}$/) }),
  z.object({ action: z.literal("bookingStatus"), id, status: z.enum(["confirmed","declined","cancelled"]) }),
]);
export const staffActions = z.discriminatedUnion("action", [
  z.object({ action: z.literal("checkout"), key: id, items: cart, payment, expected: money }),
  z.object({ action: z.literal("orderStatus"), id, status: z.enum(["accepted","preparing","ready","cancelled"]) }),
  z.object({ action: z.literal("fulfil"), id, key: id, payment, expected: money }),
]);
const customerFields = { key: id, date, slot, name: text(80), contact: text(80) };
export const publicActions = z.discriminatedUnion("action", [
  z.object({ action: z.literal("order"), ...customerFields, items: cart, expected: money }),
  z.object({ action: z.literal("booking"), ...customerFields, guests: z.number().int().min(1).max(500) }),
]);
export type AdminAction = z.infer<typeof adminActions>;
export type StaffAction = z.infer<typeof staffActions>;
export type PublicAction = z.infer<typeof publicActions>;

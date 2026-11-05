import type { Estimate } from "../forecast.ts";

export type Role = "admin" | "cashier";
export type Shop = { id: string; slug: string; name: string; tax_bps: number; slot_capacity: number; demo: boolean };
export type Actor = { id: string; name: string; role: Role; shop_id: string; demo?: boolean };
export type Account = { id: string; name: string; email: string; active: boolean };
export type MenuItem = {
  id: string; name: string; category: string; price: number; stock: number;
  active: boolean; public: boolean; recipe_complete: boolean;
};
export type PublicMenu = Pick<MenuItem, "id" | "name" | "category" | "price" | "stock">;
export type Ingredient = { id: string; name: string; unit: "g" | "ml" | "buah"; stock: number; minimum: number };
export type Recipe = { menu_id: string; ingredient_id: string; quantity: number };
export type Item = { id: string; quantity: number };
export type Line = Item & { name: string; price: number };
export type Bill = { items: Line[]; tax_bps: number; subtotal: number; tax: number; total: number };
export type Payment = { method: "cash"; received: number } | { method: "qris"; confirmed: true };
export type Receipt = Bill & {
  id: string; shop_name: string; date: string; created_at: string; method: Payment["method"];
  received: number | null; change_due: number | null; voided_at: string | null;
  void_reason: string | null; order_id: string | null;
};
export type OrderStatus = "pending" | "accepted" | "preparing" | "ready" | "completed" | "cancelled";
export type BookingStatus = "pending" | "confirmed" | "declined" | "cancelled";
export type CustomerOrder = Bill & {
  id: string; reference: string; name: string; contact: string; date: string; slot: string; status: OrderStatus;
};
export type Booking = {
  id: string; reference: string; name: string; contact: string; date: string; slot: string; guests: number; status: BookingStatus;
};
export type PublicStatus =
  | ({ kind: "order" } & Pick<CustomerOrder, "reference" | "date" | "slot" | "status" | "items" | "subtotal" | "tax" | "total">)
  | ({ kind: "booking" } & Pick<Booking, "reference" | "date" | "slot" | "status" | "guests">);
export type Daily = {
  menu_id: string; name: string; prepared: number; sold: number; stockout: boolean; event: boolean;
  source: "manual" | "pos"; date: string;
};
export type PlanRow = { menu_id: string; name: string; date: string; portions: number; event: boolean; forecast: Estimate };
export type Expense = {
  id: string; date: string; category: "ingredient" | "operational" | "salary";
  description: string; amount: number; method: "cash" | "other";
};
export type Restock = Ingredient & {
  needed: number; shortage: number; cost: number | null; packCost: number | null;
  reference: { amount: number; quantity: number; date: string; package_size: number | null } | null;
};
export type Report = {
  count: number; subtotal: number; tax: number; cash: number; qris: number; expenses: number;
  cashExpenses: number; salary: number;
};
export type Closing = { date: string; opening_cash: number | null; counted_cash: number | null; other_cash: number };
export type CloseRow = { id: string; name: string; sold: number; prepared: number; stock: number; included: boolean; stockout: boolean; event: boolean };

export const orderLabels: Record<OrderStatus, string> = {
  pending: "Menunggu konfirmasi", accepted: "Diterima", preparing: "Disiapkan",
  ready: "Siap diambil", completed: "Selesai", cancelled: "Dibatalkan",
};
export const bookingLabels: Record<BookingStatus, string> = {
  pending: "Menunggu konfirmasi", confirmed: "Dikonfirmasi", declined: "Ditolak", cancelled: "Dibatalkan",
};

export const slots = Array.from({ length: 25 }, (_, i) =>
  `${String(8 + Math.floor(i / 2)).padStart(2, "0")}:${i % 2 === 0 ? "00" : "30"}`);

export const rupiah = (amount: number) => "Rp" + new Intl.NumberFormat("id-ID", { maximumFractionDigits: 0 }).format(amount);

export function bill(items: Line[], tax_bps: number): Bill {
  const subtotal = items.reduce((total, row) => total + row.price * row.quantity, 0);
  const tax = Math.round(subtotal * tax_bps / 10000);
  return { items, tax_bps, subtotal, tax, total: subtotal + tax };
}

export function receiptCode(id: string) {
  return id.slice(0, 12).toUpperCase();
}

export function witaTime(value: string) {
  return new Intl.DateTimeFormat("id-ID", {
    dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Makassar",
  }).format(new Date(value)) + " WITA";
}

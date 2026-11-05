import { shiftDate, todayWita, validDate, weekday } from "./dates.ts";
import type { Estimate } from "./forecast.ts";

export const MAX_PORTIONS = 100_000;

export type Menu = { id: string; name: string };
export type Sale = {
  menuId: string;
  date: string;
  prepared: number;
  sold: number;
  stockout: boolean;
  event: boolean;
};
export type Plan = {
  menuId: string;
  date: string;
  portions: number;
  event: boolean;
  forecast: Estimate;
  savedAt: string;
};
export type Workspace = {
  menus: Menu[];
  sales: Sale[];
  plans: Plan[];
  activeMenu: string;
};

export const emptyWorkspace: Workspace = { menus: [], sales: [], plans: [], activeMenu: "" };

export function validPortions(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 && value <= MAX_PORTIONS;
}

export function validSale(value: unknown): value is Sale {
  if (typeof value !== "object" || value === null) return false;
  const row = value as Partial<Sale>;
  return typeof row.menuId === "string" && !!row.menuId && validDate(row.date)
    && validPortions(row.prepared) && validPortions(row.sold) && row.sold <= row.prepared
    && typeof row.event === "boolean" && typeof row.stockout === "boolean"
    && (!row.stockout || (row.prepared > 0 && row.sold === row.prepared));
}

export function findDay<T extends { menuId: string; date: string }>(rows: T[], menuId: string, date: string) {
  return rows.find((row) => row.menuId === menuId && row.date === date);
}

export function putDay<T extends { menuId: string; date: string }>(rows: T[], row: T) {
  return [...rows.filter((item) => item.menuId !== row.menuId || item.date !== row.date), row];
}

export function makeDemo(today = todayWita()): Workspace {
  const menu = { id: "nasi-ayam", name: "Nasi Ayam" };
  const sales = Array.from({ length: 42 }, (_, i): Sale => {
    const date = shiftDate(today, i - 42);
    const day = weekday(date);
    const stockout = [4, 11, 25, 31, 38].includes(i);
    const event = [3, 9, 16, 23, 30, 37].includes(i);
    const demand = 23 + Math.floor(i * 0.45) + [10, -3, -1, 0, 1, 4, 9][day] + (event ? 4 : 0) + (i % 3 - 1);
    const sold = stockout ? demand - 5 : demand;
    return { menuId: menu.id, date, sold, prepared: stockout ? sold : sold + 2 + i % 5, stockout, event };
  });
  const sparse = { id: "nasi-jinggo", name: "Nasi Jinggo · Data minim" };
  const censored = { id: "sate-lilit", name: "Sate Lilit · Selalu habis" };
  for (const [index, sold] of [16, 19].entries()) {
    sales.push({ menuId: sparse.id, date: shiftDate(today, index - 2), sold, prepared: 21, stockout: false, event: false });
  }
  for (let index = 0; index < 8; index++) {
    const sold = 22 + index % 3;
    sales.push({ menuId: censored.id, date: shiftDate(today, index - 10), sold, prepared: sold, stockout: true, event: false });
  }
  return { menus: [menu, sparse, censored], activeMenu: menu.id, plans: [], sales };
}

import assert from "node:assert/strict";
import test from "node:test";
import { makeDemo, putDay, validSale, type Sale } from "../src/lib/data.ts";
import { shiftDate, todayWita, validDate } from "../src/lib/dates.ts";
import { forecast, MIN_BASELINE, MIN_EVAL, MIN_TRAIN } from "../src/lib/forecast.ts";

const target = "2026-11-06";
const menu = "nasi-ayam";
const row = (date: string, sold: number, stockout = false): Sale => ({
  date, sold, prepared: stockout ? sold : sold + 3, stockout, menuId: menu, event: false,
});
const history = (length: number, sold = 20) =>
  Array.from({ length }, (_, index) => row(shiftDate(target, index - length), sold));

test("WITA advances at 16:00 UTC and date validation rejects impossible days", () => {
  assert.equal(todayWita(new Date("2026-11-05T15:59:59Z")), "2026-11-05");
  assert.equal(todayWita(new Date("2026-11-05T16:00:00Z")), "2026-11-06");
  assert.equal(validDate("2026-02-29"), false);
  assert.equal(validDate("2028-02-29"), true);
});

test("the baseline starts at three observed days and counts deliberate zeros", () => {
  assert.deepEqual(forecast(history(MIN_BASELINE - 1), menu, target, false), { method: "insufficient", observed: 2, stockouts: 0 });
  const estimate = forecast(history(MIN_BASELINE, 0), menu, target, false);
  assert.equal(estimate.method, "baseline");
  if (estimate.method !== "baseline") return;
  assert.equal(estimate.portions, 0);
  assert.equal(estimate.range, null);
});

test("missing days are not zeros and all-stockout history has no labels", () => {
  const days = [-12, -7, -2].map((offset) => row(shiftDate(target, offset), 31));
  const sparse = forecast(days, menu, target, false);
  assert.equal(sparse.method, "baseline");
  if (sparse.method === "baseline") assert.equal(sparse.portions, 31);
  const censored = days.map((sale) => ({ ...sale, prepared: sale.sold, stockout: true }));
  assert.deepEqual(forecast(censored, menu, target, false), { method: "insufficient", observed: 0, stockouts: 3 });
});

test("evaluation starts at the documented threshold and a tie uses the median", () => {
  const boundary = MIN_TRAIN + MIN_EVAL;
  const low = forecast(history(boundary - 1), menu, target, false);
  const high = forecast(history(boundary), menu, target, false);
  assert.equal(low.method, "baseline");
  assert.equal(high.method, "baseline");
  if (low.method !== "baseline" || high.method !== "baseline") return;
  assert.equal(low.evaluation, null);
  assert.deepEqual(high.evaluation, { count: MIN_EVAL, modelMae: 0, baselineMae: 0 });
  assert.deepEqual(high.range, [20, 20]);
});

test("demo ridge beats median, learns from changed data and ignores future sales and other menus", () => {
  const demo = makeDemo("2026-11-05");
  const estimate = forecast(demo.sales, menu, target, false);
  assert.equal(estimate.method, "ridge");
  if (estimate.method !== "ridge") return;
  assert.equal(estimate.stockouts, 5);
  assert.ok(estimate.evaluation && estimate.evaluation.modelMae < estimate.evaluation.baselineMae);
  const extra = [row(target, 900), row(shiftDate(target, 1), 900), { ...row("2026-11-05", 900), menuId: "lain" }];
  assert.deepEqual(forecast([...extra, ...demo.sales], menu, target, false), estimate);
  const shifted = demo.sales.map((sale) => ({ ...sale, sold: sale.sold + 20, prepared: sale.prepared + 20 }));
  const changed = forecast(shifted, menu, target, false);
  assert.equal(changed.method, "ridge");
  if (changed.method === "ridge") assert.equal(changed.portions, estimate.portions + 20);
});

test("changing censored amounts leaves the learned estimates and evaluation intact", () => {
  const demo = makeDemo("2026-11-05");
  const changed = demo.sales.map((sale) => sale.stockout ? { ...sale, sold: 1, prepared: 1 } : sale);
  assert.deepEqual(forecast(changed, menu, target, true), forecast(demo.sales, menu, target, true));
});

test("the final test label can change only its own rolling error", () => {
  const demo = makeDemo("2026-11-05");
  const result = forecast(demo.sales, menu, target, false);
  assert.ok(result.method === "ridge" && result.evaluation);
  // A final-day spike belongs to the final score only. Earlier fits cannot see it.
  const newest = demo.sales.filter((sale) => sale.menuId === menu).at(-1)!;
  const spiked = putDay(demo.sales, { ...newest, sold: newest.sold + 120, prepared: newest.prepared + 120 });
  const final = forecast(spiked, menu, target, false);
  assert.ok(final.method !== "insufficient" && final.evaluation);
  assert.ok(Math.abs(final.evaluation.modelMae - result.evaluation.modelMae - 120 / MIN_EVAL) < 1e-9);
});

test("one row per menu/date and stockout validation checks consistency", () => {
  const initial = row(target, 0);
  assert.equal(validSale(initial), true);
  assert.equal(validSale({ ...initial, stockout: true }), false);
  assert.equal(validSale({ ...initial, sold: 4 }), false);
  assert.equal(validSale({ ...initial, sold: 1.5 }), false);
  assert.equal(validSale(row(target, 7, true)), true);
  const updated = row(target, 4);
  assert.deepEqual(putDay([initial], updated), [updated]);
});

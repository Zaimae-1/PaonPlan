const baliDate = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Makassar",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export const todayWita = (now = new Date()) => baliDate.format(now);
const asDate = (date: string) => new Date(date + "T00:00:00Z");

export function shiftDate(date: string, days: number) {
  const value = asDate(date);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

export function validDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith("0000")) return false;
  const date = asDate(value);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export const weekday = (date: string) => asDate(date).getUTCDay();
export const weekend = (date: string) => [0, 6].includes(weekday(date));

export const fullDate = (date: string) =>
  new Intl.DateTimeFormat("id-ID", { dateStyle: "full", timeZone: "UTC" }).format(asDate(date));
export const shortDate = (date: string) =>
  new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(asDate(date));
export const number = (value: number) => new Intl.NumberFormat("id-ID", { maximumFractionDigits: 1 }).format(value);

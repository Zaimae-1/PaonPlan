import { validSale, type Sale } from "@/lib/data";
import { validDate } from "@/lib/dates";
import { forecast } from "@/lib/forecast";

function invalid(message: string, status = 400) {
  return Response.json({ message }, { status });
}

export async function POST(request: Request) {
  const reader = request.body?.getReader();
  if (!reader) return invalid("Data perkiraan belum dikirim.");

  let body: unknown;
  try {
    const decoder = new TextDecoder();
    let raw = "";
    let bytes = 0;
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > 2_000_000) {
        await reader.cancel();
        return invalid("Data perkiraan terlalu besar.", 413);
      }
      raw += decoder.decode(chunk.value, { stream: true });
    }
    body = JSON.parse(raw + decoder.decode());
  } catch {
    return invalid("Data perkiraan tidak dapat dibaca.");
  }

  if (typeof body !== "object" || body === null) return invalid("Data perkiraan tidak valid.");
  const { date, menuId, event, sales } = body as Record<string, unknown>;
  if (!validDate(date) || typeof menuId !== "string" || !menuId || typeof event !== "boolean"
    || !Array.isArray(sales) || !sales.every(validSale)) {
    return invalid("Periksa tanggal, menu, dan catatan penjualan.");
  }
  const dates = new Set<string>();
  const selected = (sales as Sale[]).filter((row) => row.menuId === menuId);
  for (const row of selected) {
    if (dates.has(row.date)) return invalid("Ada lebih dari satu catatan untuk menu dan tanggal yang sama.");
    dates.add(row.date);
  }
  return Response.json(forecast(selected, menuId, date, event));
}

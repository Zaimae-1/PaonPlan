import PDFDocument from "pdfkit";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fullDate } from "../dates";
import { receiptCode, rupiah } from "./types";
import type { reportData } from "./reporting";

type Data = Awaited<ReturnType<typeof reportData>>;

export async function salesPdf(data: Data, start: string, end: string) {
  const doc = new PDFDocument({ size: "A4", margin: 42, bufferPages: true, info: { Title: "Laporan penjualan PaonPlan" } });
  const chunks: Buffer[] = [];
  const finished = new Promise<Buffer>((resolve, reject) => {
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });
  doc.font(readFileSync(join(process.cwd(), "public/fonts/NotoSans.ttf")));
  const width = 511;
  const left = 42;
  const bottom = 775;
  let cursor = 138;
  function header() {
    doc.fillColor("#244438").fontSize(19).text("PaonPlan", left, 38, { width });
    doc.fillColor("#263a2e").fontSize(12).text(data.name, left, 68, { width });
    doc.fontSize(9).fillColor("#49594e").text("Laporan penjualan · WITA", left, 89, { width });
    doc.text(fullDate(start) + " - " + fullDate(end), left, 106, { width });
    cursor = 138;
  }
  function ensure(height: number) {
    if (cursor + height > bottom) { doc.addPage(); header(); }
  }
  function measure(value: string, size: number) {
    const previousY = doc.y;
    doc.y = 138;
    const height = doc.fontSize(size).heightOfString(value, { width });
    doc.y = previousY;
    return height;
  }
  function text(value: string, size = 10) {
    const height = measure(value, size);
    ensure(height + 8);
    doc.fontSize(size).fillColor("#263a2e").text(value, left, cursor, { width, height: height + 2 });
    cursor += height + 6;
  }
  header();
  const report = data.report;
  text("RINGKASAN", 12);
  for (const line of [
    `Transaksi selesai: ${report.count}`,
    "Penjualan sebelum pajak: " + rupiah(report.subtotal),
    "Pajak dipungut: " + rupiah(report.tax),
    "Penerimaan tunai: " + rupiah(report.cash),
    "Penerimaan QRIS (konfirmasi kasir): " + rupiah(report.qris),
    "Pengeluaran tercatat: " + rupiah(report.expenses),
    "Selisih kas operasional tercatat: " + rupiah(report.cash + report.qris - report.expenses),
  ]) text(line);
  text("DAFTAR TRANSAKSI", 12);
  for (const receipt of data.transactions) {
    const heading = `${receiptCode(receipt.id)} · ${receipt.date} · ${receipt.method === "cash" ? "Tunai" : "QRIS"}${receipt.voided_at ? " · DIBATALKAN" : ""}`;
    const totals = `Subtotal ${rupiah(receipt.subtotal)} · Pajak ${rupiah(receipt.tax)} · Total ${rupiah(receipt.total)}`;
    const lines = receipt.items.map((line) => `${line.quantity} x ${line.name} · ${rupiah(line.price)} / porsi`);
    if (receipt.voided_at) lines.push("Alasan pembatalan: " + receipt.void_reason);
    const rowHeight = measure(heading, 10) + 6 + measure(totals, 9) + 6
      + lines.reduce((height, line) => height + measure(line, 9) + 6, 0) + 8;
    ensure(Math.min(rowHeight, bottom - 138));
    doc.moveTo(left, cursor).lineTo(left + width, cursor).strokeColor("#d6dbd0").stroke();
    cursor += 8;
    text(heading, 10);
    text(totals, 9);
    for (const line of lines) text(line, 9);
  }
  if (!data.transactions.length) text("Belum ada transaksi dalam periode ini.");
  text("PENGELUARAN TERCATAT", 12);
  for (const expense of data.expenses) text(`${expense.date} · ${expense.description} · ${rupiah(expense.amount)} · ${expense.method === "cash" ? "Tunai" : "Non-tunai"}`, 9);
  if (!data.expenses.length) text("Belum ada pengeluaran dalam periode ini.");
  const pages = doc.bufferedPageRange();
  for (let index = 0; index < pages.count; index++) {
    doc.switchToPage(index);
    const previousBottom = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;
    doc.fontSize(8).fillColor("#586453").text(`PaonPlan · Halaman ${index + 1} dari ${pages.count}`, left, 802, { width, lineBreak: false, align: "right" });
    doc.page.margins.bottom = previousBottom;
  }
  doc.end();
  return finished;
}

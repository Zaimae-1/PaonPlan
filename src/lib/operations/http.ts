import { ZodError } from "zod";
import { DomainError, requireCondition } from "./db";

export async function jsonInput(request: Request) {
  const origin = request.headers.get("origin");
  const site = request.headers.get("sec-fetch-site");
  const expected = process.env.APP_ORIGIN ? new URL(process.env.APP_ORIGIN).origin : new URL(request.url).protocol + "//" + request.headers.get("host");
  requireCondition(site !== "cross-site" && (!origin || origin === expected), "Permintaan dari situs lain ditolak.", 403);
  requireCondition(request.headers.get("content-type")?.split(";")[0] === "application/json", "Kirim data JSON.", 415);
  const reader = request.body?.getReader();
  requireCondition(reader, "Isian belum dikirim.");
  const decoder = new TextDecoder();
  let text = "";
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > 200_000) {
      await reader.cancel();
      throw new DomainError("Data terlalu besar.", 413);
    }
    text += decoder.decode(value, { stream: true });
  }
  try { return JSON.parse(text + decoder.decode()) as unknown; }
  catch { throw new DomainError("Data tidak dapat dibaca."); }
}

export function response(value: unknown, status = 200) {
  return Response.json(value, { status, headers: { "Cache-Control": "no-store" } });
}

export function failure(error: unknown) {
  if (error instanceof DomainError) return response({ message: error.message }, error.status);
  if (error instanceof ZodError) {
    const issue = error.issues[0];
    return response({ message: issue.code === "custom" ? issue.message : "Periksa kembali isian yang dikirim.", field: issue.path[0] }, 400);
  }
  if (typeof error === "object" && error !== null && "code" in error && error.code === "23505") {
    return response({ message: "Data tersebut sudah ada." }, 409);
  }
  console.error("PaonPlan operations failed", error instanceof Error ? error.name : "unknown",
    typeof error === "object" && error && "code" in error ? error.code : "");
  return response({ message: "Layanan usaha belum bisa diakses. Periksa koneksi database dan migrasi." }, 503);
}

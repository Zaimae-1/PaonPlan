"use client";

import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import Link from "next/link";
import { AlertCircle, ArrowRight, CircleCheck, CookingPot, ExternalLink, RefreshCw } from "lucide-react";
import { fullDate, number, validDate } from "@/lib/dates";
import { rupiah, type Report, type Restock } from "@/lib/operations/types";

export const api = "/api/usaha";
export type BaseView = { name: string; slug: string; demo: boolean; today: string; tomorrow: string; taxBps: number };
export type Change = () => void;
export type Values = FormData;
export const str = (data: Values, name: string) => String(data.get(name) ?? "").trim();
export const num = (data: Values, name: string) => Number(str(data, name));
export const optionalNum = (data: Values, name: string) => str(data, name) === "" ? null : num(data, name);
export const on = (data: Values, name: string) => data.get(name) === "on";
export const showDate = (date: string) => validDate(date) ? fullDate(date) : date;

const pendingWrites = new Map<string, string>();
export async function bodyHash(body: unknown) {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(body)));
  return [...new Uint8Array(bytes)].map((value) => value.toString(16).padStart(2, "0")).join("");
}

export function attemptStorage(key: string, value?: string | null) {
  try {
    if (value === null) sessionStorage.removeItem(key);
    else if (value !== undefined) sessionStorage.setItem(key, value);
    else return sessionStorage.getItem(key);
  } catch { /* In-memory retries remain available when browser storage is disabled. */ }
  return null;
}

export async function request<T>(url: string, body?: unknown, signal?: AbortSignal): Promise<T> {
  const write = url === api && typeof body === "object" && body !== null && "action" in body
    && !["login", "logout", "forecast", "note", "checkout", "orderStatus", "fulfil"].includes(String(body.action));
  const fingerprint = write ? await bodyHash(body) : "";
  const storageKey = "paonplan:write:" + fingerprint;
  let payloadBody = body;
  if (write) {
    const key = pendingWrites.get(fingerprint) ?? attemptStorage(storageKey) ?? crypto.randomUUID();
    pendingWrites.set(fingerprint, key);
    attemptStorage(storageKey, key);
    payloadBody = { ...body, operationKey: key };
  }
  const response = await fetch(url, {
    signal, cache: "no-store",
    ...(body === undefined ? {} : { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payloadBody) }),
  });
  const payload = await response.json().catch(() => null);
  if (response.status < 500 && payload !== null && write) {
    pendingWrites.delete(fingerprint);
    attemptStorage(storageKey, null);
  }
  if (!response.ok) throw new Error(payload?.message ?? "Server belum merespons. Coba lagi.");
  if (payload === null) throw new Error("Jawaban server terputus. Ulangi dengan isian yang sama.");
  return payload;
}

export function useView<T>(url: string) {
  const [revision, setRevision] = useState(0);
  const [state, setState] = useState<{ data?: T; error?: string; url?: string; revision?: number }>({});
  useEffect(() => {
    const controller = new AbortController();
    request<T>(url, undefined, controller.signal).then(
      (data) => setState({ data, url, revision }),
      (error: Error) => { if (!controller.signal.aborted) setState({ error: error.message, url, revision }); },
    );
    return () => controller.abort();
  }, [url, revision]);
  const current = state.url === url;
  return { data: current ? state.data : undefined, error: current ? state.error : undefined,
    loading: !current || state.revision !== revision, refresh: () => setRevision((value) => value + 1) };
}

export function useTask() {
  const locked = useRef(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ message: string; error?: boolean } | null>(null);
  async function run(work: () => Promise<void>, message?: string) {
    if (locked.current) return;
    locked.current = true;
    setBusy(true);
    setStatus(null);
    try {
      await work();
      if (message) setStatus({ message });
    } catch (error) {
      setStatus({ message: error instanceof TypeError ? "Koneksi terputus. Periksa riwayat atau ulangi dengan isian yang sama." : (error as Error).message, error: true });
    } finally { setBusy(false); locked.current = false; }
  }
  return { busy, status, run };
}

export function TaskStatus({ status }: { status: ReturnType<typeof useTask>["status"] }) {
  if (!status) return null;
  return <p role={status.error ? "alert" : "status"} className={status.error ? "error-box" : "success"}>
    {status.error ? <AlertCircle size={18}/> : <CircleCheck size={18}/>}<span>{status.message}</span>
  </p>;
}

export function TaskForm({ children, submit, send, success = "Perubahan tersimpan.", className = "form-fields", disabled = false, onWorking }:
  { children: ReactNode; submit: string; send: (data: Values) => Promise<void>; success?: string; className?: string; disabled?: boolean; onWorking?: (busy: boolean) => void }) {
  const task = useTask();
  function handle(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    void task.run(async () => {
      onWorking?.(true);
      try { await send(values); }
      finally { onWorking?.(false); }
    }, success);
  }
  return <form className="ops-form" onSubmit={handle}>
    <fieldset className={className} disabled={task.busy}>
      {children}
      <button className="button primary" type="submit" disabled={disabled}>{task.busy ? "Memproses…" : submit}</button>
    </fieldset>
    <TaskStatus status={task.status}/>
  </form>;
}

export function Input({ name, label, type = "text", required = true, ...props }: {
  name: string; label: ReactNode; type?: string; required?: boolean;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, "name" | "type" | "required">) {
  return <label className="field"><span>{label}</span><input name={name} type={type} required={required} {...props}/></label>;
}

export function Select({ name, label, children, ...props }: {
  name: string; label: string; children: ReactNode;
} & Omit<React.SelectHTMLAttributes<HTMLSelectElement>, "name">) {
  return <label className="field"><span>{label}</span><select name={name} required {...props}>{children}</select></label>;
}

export function Check({ name, children, defaultChecked }: { name: string; children: ReactNode; defaultChecked?: boolean }) {
  return <label className="check-card"><input name={name} type="checkbox" defaultChecked={defaultChecked}/><span>{children}</span></label>;
}

export function OpHeading({ tag, title, description, aside }: { tag: string; title: string; description: string; aside?: ReactNode }) {
  return <header className="ops-intro">
    <div><p className="eyebrow">{tag}</p><h1>{title}</h1><p className="subtitle">{description}</p></div>{aside}
  </header>;
}

export function Refresh({ action }: { action: Change }) {
  return <button className="button secondary" type="button" onClick={action}><RefreshCw size={17}/>Muat ulang</button>;
}

export function Loading({ error, retry }: { error?: string; retry: Change }) {
  return error ? <div className="panel"><p role="alert" className="error-box">{error}</p><Refresh action={retry}/></div>
    : <p className="panel" role="status">Memuat data warung…</p>;
}

export function ShopLink({ slug }: { slug: string }) {
  return <Link className="text-action" href={"/warung/" + slug}>Buka menu pelanggan <ExternalLink size={16}/></Link>;
}

export function Figure({ label, value, note }: { label: string; value: ReactNode; note?: string }) {
  return <article className="ops-figure"><p>{label}</p><strong>{value}</strong>{note && <small>{note}</small>}</article>;
}

export function SummaryFigures({ report }: { report: Report }) {
  return <div className="ops-figures">
    <Figure label="Penjualan" value={rupiah(report.subtotal)} note={number(report.count) + " transaksi selesai · sebelum pajak"}/>
    <Figure label="Tunai" value={rupiah(report.cash)} note="Pembayaran termasuk pajak"/>
    <Figure label="QRIS" value={rupiah(report.qris)} note="Dikonfirmasi oleh kasir"/>
    <Figure label="Pengeluaran tercatat" value={rupiah(report.expenses)}/>
  </div>;
}

export function Supplies({ date, data, compact = false }: { date: string; data: { items: Restock[]; incomplete: string[] }; compact?: boolean }) {
  const needed = data.items.filter((item) => item.needed > 0 || (!compact && item.stock < item.minimum));
  return <section className="panel ops-list">
    <div className="ops-panel-heading"><p className="eyebrow">DAPUR & BELANJA</p><h2>Kebutuhan bahan untuk besok</h2><p className="hint">{showDate(date)} · WITA</p></div>
    {data.incomplete.length > 0 && <p className="notice stockout">Resep belum lengkap untuk {data.incomplete.join(", ")}. Kebutuhan bahan berikut masih parsial.</p>}
    {!needed.length && <p>Belum ada kebutuhan dari rencana besok atau peringatan stok bahan.</p>}
    {needed.map((item) => <article className="ops-row" key={item.id}>
      <div><h3>{item.name}</h3><p className="hint">Stok {number(item.stock)} {item.unit} · Kebutuhan {number(item.needed)} {item.unit}</p>
        {item.stock < item.minimum && <span className="pill stockout-tag">Di bawah batas stok · {number(item.minimum)} {item.unit}</span>}
      </div>
      {item.shortage > 0 ? <div><p><strong>Kurang {number(item.shortage)} {item.unit}</strong></p>
        <p className="hint">{item.cost === null ? "Harga rujukan belum tercatat" : "Estimasi pemakaian " + rupiah(item.cost)}</p>
        {item.reference && <p className="hint">Rujukan pembelian {rupiah(item.reference.amount)} / {number(item.reference.quantity)} {item.unit} · {showDate(item.reference.date)}</p>}
        {item.packCost !== null && <p className="hint">Estimasi belanja kemasan {number(item.reference!.package_size!)} {item.unit} · {rupiah(item.packCost)}</p>}
      </div> : <span className="pill forecast-tag">Cukup untuk rencana</span>}
    </article>)}
  </section>;
}

export function Login() {
  const task = useTask();
  return <main className="public-wrap login-wrap">
    <div className="login-brand"><CookingPot size={26}/> PaonPlan</div>
    <div className="login-grid">
      <header className="login-hero"><p className="eyebrow">PAONPLAN · RUANG USAHA</p><h1>Tahu berapa porsi sebelum mulai masak.</h1>
        <p>Hubungkan penjualan kasir, stok dapur, dan rencana porsi besok.</p>
        <Link className="text-action" href="/data-browser">Pulihkan data browser lama <ArrowRight size={17}/></Link>
      </header>
      <section className="panel">
        <div className="ops-panel-heading"><h2>Masuk ke ruang usaha</h2><p>Untuk Admin dan Kasir</p></div>
        <form onSubmit={(event) => {
          event.preventDefault();
          const data = new FormData(event.currentTarget);
          void task.run(async () => {
            const result = await request<{ role: string }>(api, { action: "login", email: str(data, "email"), password: String(data.get("password") ?? "") });
            location.assign(result.role === "admin" ? "/usaha" : "/usaha/kasir");
          });
        }}>
          <fieldset className="form-fields" disabled={task.busy}>
            <Input label="Email" name="email" type="email" autoComplete="username" maxLength={160}/>
            <Input label="Sandi" name="password" type="password" autoComplete="current-password" maxLength={128}/>
            <button className="button primary" type="submit">{task.busy ? "Memeriksa…" : "Masuk"}</button>
          </fieldset>
        </form>
        <TaskStatus status={task.status}/>
        <details className="demo-login">
          <summary>Akun demo, jika data contoh dipasang</summary>
          <p>Admin <strong>admin@paonplan.test</strong></p><p>Kasir <strong>kasir@paonplan.test</strong></p><p>Sandi <strong>PaonPlanDemo2026!</strong></p>
          <ShopLink slug="demo"/>
        </details>
      </section>
    </div>
  </main>;
}

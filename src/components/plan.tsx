"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowRight, CalendarDays, CircleCheck, Info, Sparkles } from "lucide-react";
import { ensureUnchanged, useKitchen } from "./kitchen";
import { Empty, MenuField, ModeBanner, ModeButton, PageIntro, RecordLink } from "./ui";
import { findDay, MAX_PORTIONS, putDay, validPortions } from "@/lib/data";
import { fullDate, number, shiftDate, todayWita, validDate } from "@/lib/dates";
import { MIN_BASELINE, type Estimate, type Forecast } from "@/lib/forecast";

export function PlanScreen({ requestedMenu, requestedDate }: { requestedMenu?: string; requestedDate?: string }) {
  const { workspace, update, mode } = useKitchen();
  const today = todayWita();
  const [menu, setMenu] = useState(requestedMenu ?? "");
  const [date, setDate] = useState(validDate(requestedDate) ? requestedDate : shiftDate(today, 1));
  const menuId = workspace.menus.find((item) => item.id === menu)?.id
    ?? workspace.menus.find((item) => item.id === workspace.activeMenu)?.id ?? workspace.menus[0]?.id ?? "";
  const stored = findDay(workspace.plans, menuId, date);
  const [eventInput, setEvent] = useState<boolean | null>(null);
  const event = eventInput ?? stored?.event ?? false;
  const [result, setResult] = useState<Forecast | null>(null);
  const [original, setOriginal] = useState(stored);
  const [chosen, setChosen] = useState("");
  const [pending, setPending] = useState(false);
  const [saving, setSaving] = useState(false);
  const [analysisError, setAnalysisError] = useState("");
  const [saveError, setSaveError] = useState("");
  const [message, setMessage] = useState("");
  const historical = date < today;
  const busy = pending || saving;

  function reset() {
    setResult(null);
    setChosen("");
    setAnalysisError("");
    setSaveError("");
    setMessage("");
  }

  async function analyze(form: React.FormEvent<HTMLFormElement>) {
    form.preventDefault();
    if (busy || !menuId || !validDate(date)) return;
    setPending(true);
    reset();
    setOriginal(stored);
    try {
      const response = await fetch("/api/perkiraan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ menuId, date, event, sales: workspace.sales.filter((row) => row.menuId === menuId && row.date < date) }),
      });
      const next = await response.json().catch(() => null);
      if (!response.ok || !next) throw new Error(next?.message ?? "Server gagal menghitung perkiraan. Coba lagi.");
      const forecast = next as Forecast;
      setResult(forecast);
      if (forecast.method !== "insufficient") setChosen(String(stored?.portions ?? forecast.portions));
    } catch (error) {
      setAnalysisError(error instanceof TypeError ? "Perkiraan gagal dihitung. Periksa koneksi dan coba lagi." : (error as Error).message);
    } finally { setPending(false); }
  }

  async function save(form: React.FormEvent<HTMLFormElement>) {
    form.preventDefault();
    if (busy || !result || result.method === "insufficient" || historical) return;
    if (!chosen.trim() || !validPortions(Number(chosen))) {
      setSaveError(`Masukkan porsi dalam bilangan bulat antara 0 dan ${number(MAX_PORTIONS)}.`);
      return;
    }
    const next = { menuId, date, event, forecast: result, portions: Number(chosen), savedAt: new Date().toISOString() };
    setSaveError("");
    setSaving(true);
    try {
      await update((current) => {
        ensureUnchanged(findDay(current.plans, menuId, date), original, "Rencana sudah berubah. Jalankan perkiraan lagi sebelum menyimpan.");
        return { ...current, plans: putDay(current.plans, next), activeMenu: menuId };
      });
      setOriginal(next);
      setMessage("Rencana tersimpan di browser.");
    } catch (error) { setSaveError((error as Error).message); }
    finally { setSaving(false); }
  }

  return <div className="page-stack">
    <ModeBanner/>
    <PageIntro eyebrow="01 / SEBELUM MASAK" title="Rencana Porsi">Lihat perkiraan permintaan dan tentukan jumlah yang akan Anda siapkan.</PageIntro>
    <div className="work-grid">
      <section className="panel form-panel">
        <div className="panel-head"><span className="icon-chip"><CalendarDays size={21}/></span><div><h2>Atur rencana</h2><p>Untuk satu menu dan tanggal</p></div></div>
        <form onSubmit={analyze}>
          <fieldset className="form-fields" disabled={busy}>
            <MenuField canAdd menuId={menuId} onSelect={(id) => { setMenu(id); setEvent(null); reset(); }}/>
            <div className="field"><label htmlFor="target-date">Tanggal rencana</label>
              <input id="target-date" type="date" required value={date} onChange={(e) => { setDate(e.target.value); setEvent(null); reset(); }}/>
              <p className="hint">{validDate(date) ? fullDate(date) + " · WITA" : "Pilih tanggal sesuai waktu Bali (WITA)."}</p></div>
            <label className="check-card"><input type="checkbox" checked={event} onChange={(e) => { setEvent(e.target.checked); reset(); }}/>
              <span><strong>Ada acara di sekitar warung</strong><small>Misalnya kegiatan banjar atau pasar lokal.</small></span></label>
            {historical && <p className="notice"><Info size={18}/> Rencana untuk tanggal yang sudah lewat dapat dilihat kembali.</p>}
            <button type="submit" className="button primary" disabled={!menuId || historical}><Sparkles size={19}/>{pending ? "Menghitung perkiraan…" : "Hitung perkiraan"}</button>
          </fieldset>
          {pending && <p className="hint" role="status">Mengolah catatan penjualan sebelum tanggal rencana.</p>}
          {analysisError && <p className="error-box" role="alert">{analysisError}</p>}
        </form>
      </section>

      <section className="panel result-panel" aria-label="Hasil perkiraan">
        {result?.method === "insufficient" ? <>
          <Empty title="Catatan belum cukup untuk memperkirakan porsi">
            Ada {result.observed} catatan penjualan tanpa kehabisan stok sebelum tanggal rencana. Tambahkan catatan hingga terkumpul minimal {MIN_BASELINE} hari.
          </Empty>
          {!!result.stockouts && <Stockout count={result.stockouts}/>}
          <div className="actions"><RecordLink/>{mode === "business" && <ModeButton/>}</div>
        </> : result ? <>
          <ForecastCard result={result}/>
          <form className="save-form" onSubmit={save} noValidate>
            <div className="field"><label htmlFor="chosen">Jumlah yang akan saya siapkan</label>
              <input id="chosen" type="number" min={0} max={MAX_PORTIONS} step={1} inputMode="numeric" value={chosen}
                disabled={saving} onChange={(e) => { setChosen(e.target.value); setMessage(""); setSaveError(""); }}
                aria-invalid={!!saveError} aria-describedby={saveError ? "save-error" : undefined}/>
              {saveError && <p className="field-error" id="save-error" role="alert">{saveError}</p>}
            </div>
            <button type="submit" className="button primary" disabled={busy}>{saving ? "Menyimpan…" : "Simpan rencana"}<ArrowRight size={18}/></button>
            {message && <p className="success" role="status"><CircleCheck size={19}/>{message} <Link href="/data-browser">Lihat arsip</Link></p>}
          </form>
        </> : stored ? <>
          <div className="saved-strip"><CircleCheck size={20}/><p><strong>{number(stored.portions)} porsi direncanakan</strong><br/><small>{fullDate(date)} · Rencana tersimpan</small></p></div>
          <ForecastCard result={stored.forecast} saved/>
          <Link className="text-action" href={`/penjualan/catat?menu=${encodeURIComponent(menuId)}&tanggal=${date}`}>Catat hasil penjualan <ArrowRight size={17}/></Link>
        </> : <Empty title="Perkiraan porsi muncul di sini">Pilih menu dan tanggal, lalu hitung perkiraan dari catatan penjualan Anda.</Empty>}
      </section>
    </div>
  </div>;
}

function Stockout({ count }: { count: number }) {
  return <p className="notice stockout"><Info size={18}/><span><strong>{number(count)} hari habis sebelum tutup.</strong> Pada hari itu, jumlah terjual bisa lebih rendah dari jumlah yang sebenarnya ingin dibeli pelanggan.</span></p>;
}

export function ForecastCard({ result, saved = false }: { result: Estimate; saved?: boolean }) {
  const comparison = result.comparison;
  return <>
    <div className="estimate">
      <span className="pill forecast-tag"><Sparkles size={15}/>{saved ? "Perkiraan saat disimpan" : result.method === "ridge" ? "Perkiraan AI" : "Perkiraan awal"}</span>
      <h2>Siapkan sekitar <span className="estimate-number">{number(result.portions)}</span> porsi</h2>
      {result.range && <p>Kisaran {number(result.range[0])}–{number(result.range[1])} porsi dari selisih historis.</p>}
    </div>
    <div className="reason">
      <h3>Kenapa segini?</h3>
      <p>{result.method === "ridge"
        ? "Model mempelajari pola hari dan penjualan terbaru. Selisihnya lebih kecil daripada perkiraan sederhana pada tanggal uji yang sama."
        : result.evaluation ? "Median dipilih karena selisih model belum lebih kecil pada tanggal uji."
        : "Catatan belum cukup untuk membandingkan model dengan median. Angka ini memakai median dari catatan pembanding."}</p>
      <p>Pada {comparison.count} {comparison.similar ? "catatan hari sejenis" : "catatan terbaru"}, terjual {number(comparison.min)}–{number(comparison.max)} porsi.</p>
      <p>{result.eventUsed ? "Model terpilih memakai penanda acara dari riwayat." : "Perkiraan ini belum memakai pengaruh acara."}</p>
      {!!result.stockouts && <Stockout count={result.stockouts}/>}
      <details>
        <summary>Detail data dan pengujian</summary>
        <p>{number(result.observed)} hari tanpa kehabisan stok sebelum tanggal rencana. Versi {result.version}.</p>
        {result.evaluation && <p>Rata-rata selisih mutlak (MAE) pada {result.evaluation.count} hari uji: model {number(result.evaluation.modelMae)} porsi, median {number(result.evaluation.baselineMae)} porsi. Selisih lebih kecil menunjukkan perkiraan lebih dekat ke jumlah terjual pada hari uji.</p>}
        {result.range && <p>Kisaran dihitung dari persentil ke-80 selisih uji metode terpilih. Permintaan besok bisa berada di luar kisaran.</p>}
      </details>
    </div>
  </>;
}

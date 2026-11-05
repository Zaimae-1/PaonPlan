"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowRight, CalendarDays, CircleCheck, ClipboardPen, PackageCheck } from "lucide-react";
import { ensureUnchanged, useKitchen } from "./kitchen";
import { MenuField, ModeBanner, PageIntro } from "./ui";
import { findDay, MAX_PORTIONS, putDay, validPortions, type Plan, type Sale } from "@/lib/data";
import { fullDate, number, shiftDate, todayWita, validDate } from "@/lib/dates";

export function SalesScreen({ requestedMenu, requestedDate }: { requestedMenu?: string; requestedDate?: string }) {
  const { workspace, mode } = useKitchen();
  const today = todayWita();
  const [menu, setMenu] = useState(requestedMenu ?? "");
  const [date, setDate] = useState(validDate(requestedDate) ? requestedDate : today);
  const menuId = workspace.menus.find((item) => item.id === menu)?.id
    ?? workspace.menus.find((item) => item.id === workspace.activeMenu)?.id ?? workspace.menus[0]?.id ?? "";
  const plan = findDay(workspace.plans, menuId, date);
  const stored = findDay(workspace.sales, menuId, date);
  const maxDate = mode === "demo" ? shiftDate(today, 1) : today;
  const dateError = !validDate(date) || date > maxDate;

  return <div className="page-stack">
    <ModeBanner/>
    <PageIntro eyebrow="02 / SELESAI JUALAN" title="Catat Penjualan">Catat porsi yang dibuat, terjual, dan tersisa untuk perkiraan berikutnya.</PageIntro>
    <div className="work-grid">
      <section className="panel form-panel">
        <div className="panel-head"><span className="icon-chip"><ClipboardPen size={21}/></span>
          <div><h2>{stored ? "Koreksi catatan" : "Catatan harian"}</h2><p>Satu catatan untuk setiap menu dan tanggal</p></div></div>
        <div className="form-fields">
          <MenuField canAdd menuId={menuId} onSelect={setMenu}/>
          <div className="field">
            <label htmlFor="sale-date">Tanggal penjualan</label>
            <input type="date" id="sale-date" max={maxDate} value={date} onChange={(e) => setDate(e.target.value)}
              aria-invalid={dateError} aria-describedby={dateError ? "date-error" : "date-hint"}/>
            {dateError ? <p id="date-error" className="field-error" role="alert">Pilih tanggal sampai {fullDate(maxDate)}.</p>
              : <p className="hint" id="date-hint">{mode === "demo" ? "Dalam demo, besok bisa dipilih untuk simulasi." : "Gunakan tanggal penjualan sesuai waktu Bali (WITA)."}</p>}
          </div>
          {plan && <p className="saved-strip mobile-plan"><strong>{number(plan.portions)} porsi direncanakan</strong></p>}
          <SaleForm key={menuId + "/" + date} menuId={menuId} date={date} stored={stored} plan={plan} dateError={dateError}/>
        </div>
      </section>
      <aside className="panel sales-aside">
        <div className="panel-head"><span className="icon-chip chip-1"><CalendarDays size={21}/></span>
          <div><h2>Rencana hari itu</h2><p>{validDate(date) ? fullDate(date) : "Pilih tanggal penjualan"}</p></div></div>
        {plan ? <div className="saved-strip"><PackageCheck size={22}/><p><strong>{number(plan.portions)} porsi direncanakan</strong><br/><small>Jumlah yang dipilih saat rencana disimpan</small></p></div>
          : <p className="aside-copy">Jika ada rencana untuk menu dan tanggal ini, jumlahnya akan muncul di sini sebagai referensi.</p>}
        <div className="divider"/>
        <h3>Kenapa mencatat stok habis?</h3>
        <p className="aside-copy">Saat menu habis sebelum tutup, pelanggan yang datang setelahnya mungkin masih ingin membeli. PaonPlan memisahkan hari tersebut saat belajar dari catatan.</p>
      </aside>
    </div>
  </div>;
}

function SaleForm({ menuId, date, stored, plan, dateError }: {
  menuId: string; date: string; stored?: Sale; plan?: Plan; dateError: boolean;
}) {
  const { update } = useKitchen();
  const [original, setOriginal] = useState(stored);
  const [prepared, setPrepared] = useState(stored ? String(stored.prepared) : "");
  const [sold, setSold] = useState(stored ? String(stored.sold) : "");
  const [stockout, setStockout] = useState(stored ? String(stored.stockout) : "");
  const [event, setEvent] = useState(stored?.event ?? plan?.event ?? false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const preparedCount = prepared === "" ? NaN : Number(prepared);
  const soldCount = sold === "" ? NaN : Number(sold);
  const remaining = validPortions(preparedCount) && validPortions(soldCount) && soldCount <= preparedCount
    ? preparedCount - soldCount : null;

  async function save(form: React.FormEvent<HTMLFormElement>) {
    form.preventDefault();
    if (!menuId || dateError || saving) return;
    const problems: Record<string, string> = {};
    const portionError = `Masukkan bilangan bulat antara 0 dan ${number(MAX_PORTIONS)}.`;
    if (!validPortions(preparedCount)) problems.prepared = portionError;
    if (!validPortions(soldCount)) problems.sold = portionError;
    else if (soldCount > preparedCount) problems.sold = "Porsi terjual tidak boleh melebihi porsi disiapkan.";
    if (!stockout) problems.stockout = "Pilih Ya atau Tidak.";
    else if (stockout === "true" && (remaining !== 0 || preparedCount === 0)) {
      problems.stockout = "Jika habis sebelum tutup, semua porsi yang disiapkan harus terjual dan jumlahnya lebih dari nol.";
    }
    setErrors(problems);
    if (Object.keys(problems).length) {
      document.getElementById(Object.keys(problems)[0])?.focus();
      return;
    }
    const next = { date, menuId, prepared: preparedCount, sold: soldCount, stockout: stockout === "true", event };
    setSaving(true);
    try {
      await update((current) => {
        ensureUnchanged(findDay(current.sales, menuId, date), original, "Catatan berubah di tab lain. Buka kembali dari Riwayat untuk melihat versi terbaru.");
        return { ...current, sales: putDay(current.sales, next), activeMenu: menuId };
      });
      setOriginal(next);
      setMessage("Catatan tersimpan di browser.");
    } catch (error) { setErrors({ form: (error as Error).message }); }
    finally { setSaving(false); }
  }

  function changed(field: string) {
    setMessage("");
    setErrors((previous) => ({ ...previous, [field]: "", form: "" }));
  }

  return <form onSubmit={save} noValidate>
    <fieldset className="form-fields" disabled={saving}>
      {original && <p className="notice">Anda sedang mengedit catatan yang sudah ada.</p>}
      <div className="portion-fields">
        <div className="field">
          <label htmlFor="prepared">Porsi disiapkan</label>
          <input id="prepared" type="number" min={0} max={MAX_PORTIONS} step={1} inputMode="numeric" placeholder="0" value={prepared}
            aria-invalid={!!errors.prepared} aria-describedby={errors.prepared ? "prepared-error" : undefined}
            onChange={(e) => { setPrepared(e.target.value); changed("prepared"); }}/>
          {errors.prepared && <p id="prepared-error" className="field-error" role="alert">{errors.prepared}</p>}
        </div>
        <div className="field">
          <label htmlFor="sold">Porsi terjual</label>
          <input id="sold" type="number" min={0} max={MAX_PORTIONS} step={1} inputMode="numeric" placeholder="0" value={sold}
            aria-invalid={!!errors.sold} aria-describedby={errors.sold ? "sold-error" : undefined}
            onChange={(e) => { setSold(e.target.value); changed("sold"); }}/>
          {errors.sold && <p id="sold-error" className="field-error" role="alert">{errors.sold}</p>}
        </div>
      </div>
      <div className="leftover"><span>Sisa porsi</span><output htmlFor="prepared sold">{remaining === null ? "—" : number(remaining)}</output></div>
      <fieldset className="radio-field">
        <legend>Apakah menu habis sebelum warung tutup?</legend>
        <div className="radio-options">
          {["false", "true"].map((value) => <label key={value} className="check-card">
            <input type="radio" id={value === "false" ? "stockout" : "stockout-yes"} name="stockout" value={value} checked={stockout === value}
              aria-describedby={errors.stockout ? "stockout-error" : undefined}
              onChange={() => { setStockout(value); changed("stockout"); }}/>{value === "true" ? "Ya" : "Tidak"}
          </label>)}
        </div>
        {errors.stockout && <p id="stockout-error" className="field-error" role="alert">{errors.stockout}</p>}
      </fieldset>
      <label className="check-card"><input type="checkbox" checked={event} onChange={(e) => { setEvent(e.target.checked); changed("event"); }}/>
        <span><strong>Ada acara di sekitar warung</strong><small>Centang jika ada acara pada hari penjualan.</small></span></label>
      <button type="submit" className="button primary" disabled={!menuId || dateError}>{saving ? "Menyimpan…" : original ? "Simpan koreksi" : "Simpan penjualan"}<ArrowRight size={18}/></button>
      {errors.form && <p className="error-box" role="alert">{errors.form}</p>}
      {message && <p className="success" role="status"><CircleCheck size={19}/>{message} <Link href="/riwayat">Lihat Riwayat</Link></p>}
    </fieldset>
  </form>;
}

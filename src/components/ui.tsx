"use client";

import Link from "next/link";
import { ArrowRight, FlaskConical, Plus, Soup } from "lucide-react";
import { useState } from "react";
import { useKitchen } from "./kitchen";

export function PageIntro({ eyebrow, title, children }: { eyebrow: string; title: string; children: React.ReactNode }) {
  return <header className="intro"><p className="eyebrow">{eyebrow}</p><h1>{title}</h1><p className="subtitle">{children}</p></header>;
}

export function ModeButton({ compact = false }: { compact?: boolean }) {
  const { mode, switchMode } = useKitchen();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const isDemo = mode === "demo";
  return <div className="mode-control">
    <button type="button" className={compact ? "text-action" : "button secondary"} disabled={busy} onClick={async () => {
      setBusy(true);
      setError("");
      try { await switchMode(isDemo ? "business" : "demo"); }
      catch (cause) { setError((cause as Error).message); }
      finally { setBusy(false); }
    }}><FlaskConical size={18}/>{isDemo ? "Kembali ke data warung" : "Coba data contoh"}</button>
    {error && <p role="alert" className="field-error">{error}</p>}
  </div>;
}

export function ModeBanner() {
  const { mode } = useKitchen();
  if (mode !== "demo") return null;
  return <div className="mode-banner">
    <div><FlaskConical size={19}/><p><strong>Data contoh</strong><span> · Warung fiktif, terpisah dari data warung Anda.</span></p></div>
    <ModeButton compact/>
  </div>;
}

export function MenuField({ menuId, onSelect, canAdd = false }: {
  menuId: string; onSelect: (id: string) => void; canAdd?: boolean;
}) {
  const { workspace, update } = useKitchen();
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const showInput = canAdd && (adding || !workspace.menus.length);

  async function addMenu() {
    const label = name.trim();
    if (!label) { setError("Tulis nama menu terlebih dahulu."); return; }
    setBusy(true);
    setError("");
    try {
      let id = crypto.randomUUID();
      await update((current) => {
        const existing = current.menus.find((menu) => menu.name.toLocaleLowerCase("id-ID") === label.toLocaleLowerCase("id-ID"));
        if (existing) id = existing.id;
        const menus = existing ? current.menus : [...current.menus, { id, name: label }];
        return { ...current, menus, activeMenu: id };
      });
      onSelect(id);
      setName("");
      setAdding(false);
    } catch (cause) { setError((cause as Error).message); }
    finally { setBusy(false); }
  }

  return <div className="field">
    {workspace.menus.length > 0 && <>
      <label htmlFor="menu">Menu</label>
      <select id="menu" value={menuId} onChange={(event) => onSelect(event.target.value)}>
        {workspace.menus.map((menu) => <option key={menu.id} value={menu.id}>{menu.name}</option>)}
      </select>
      {canAdd && <button type="button" className="text-action" aria-expanded={showInput} onClick={() => setAdding(!adding)}>
        <Plus size={17}/>{adding ? "Tutup isian menu baru" : "Tambah menu"}
      </button>}
    </>}
    {showInput && <>
      <label htmlFor="menu-name">Nama menu baru</label>
      <div className="inline-fields">
        <input id="menu-name" value={name} maxLength={60} placeholder="Misalnya Nasi Ayam" aria-invalid={!!error}
          aria-describedby={error ? "menu-error" : undefined} onChange={(event) => setName(event.target.value)}
          onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); if (!busy) void addMenu(); } }}/>
        <button type="button" className="button secondary" disabled={busy} onClick={addMenu}>Tambah</button>
      </div>
      {error && <p id="menu-error" className="field-error" role="alert">{error}</p>}
    </>}
  </div>;
}

export function Empty({ title, children }: { title: string; children: React.ReactNode }) {
  return <div className="empty"><span className="empty-icon"><Soup size={26} strokeWidth={1.6}/></span>
    <h3>{title}</h3><p>{children}</p></div>;
}

export function RecordLink({ children = "Catat penjualan" }: { children?: React.ReactNode }) {
  return <Link className="text-action" href="/penjualan/catat">{children}<ArrowRight size={17}/></Link>;
}

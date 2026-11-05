"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarDays, ClipboardList, CookingPot, House, Plus, HardDrive, FlaskConical } from "lucide-react";
import { createContext, useContext, useSyncExternalStore } from "react";
import { emptyWorkspace, makeDemo, type Workspace } from "@/lib/data";

const storageKey = "paonplan:v1";
type Mode = "business" | "demo";
type Store = { business: Workspace; demo: Workspace | null; mode: Mode };
type Snapshot = { store: Store; error: string; ready: boolean };
const initial: Store = { business: emptyWorkspace, demo: null, mode: "business" };
const serverSnapshot: Snapshot = { store: initial, error: "", ready: false };
let lastRaw: string | null | undefined;
let cached = serverSnapshot;

function read(): Store {
  const raw = localStorage.getItem(storageKey);
  if (!raw) return initial;
  const data = JSON.parse(raw) as Store;
  if (!data.business || !["business", "demo"].includes(data.mode) || (data.mode === "demo" && !data.demo)) {
    throw new Error("Format data tidak dikenali.");
  }
  for (const workspace of [data.business, data.demo]) {
    if (workspace && (!Array.isArray(workspace.menus) || !Array.isArray(workspace.sales) || !Array.isArray(workspace.plans))) {
      throw new Error("Format data tidak dikenali.");
    }
  }
  return data;
}

function snapshot(): Snapshot {
  try {
    const raw = localStorage.getItem(storageKey);
    if (raw !== lastRaw || !cached.ready || cached.error) {
      cached = { store: read(), error: "", ready: true };
      lastRaw = raw;
    }
  } catch {
    if (!cached.error) cached = {
      store: initial, error: "Data di browser tidak dapat dibaca. Periksa izin penyimpanan browser.", ready: true,
    };
  }
  return cached;
}

function subscribe(notify: () => void) {
  window.addEventListener("storage", notify);
  window.addEventListener(storageKey, notify);
  return () => {
    window.removeEventListener("storage", notify);
    window.removeEventListener(storageKey, notify);
  };
}

class EditConflict extends Error {}
export function ensureUnchanged(current: unknown, original: unknown, message: string) {
  if (JSON.stringify(current) !== JSON.stringify(original)) throw new EditConflict(message);
}

async function write(update: (store: Store) => Store) {
  function save() {
    const next = update(read());
    localStorage.setItem(storageKey, JSON.stringify(next));
    window.dispatchEvent(new Event(storageKey));
  }
  try {
    if (navigator.locks) await navigator.locks.request(storageKey, save);
    else save();
  } catch (error) {
    if (error instanceof EditConflict) throw error;
    throw new Error("Data gagal disimpan. Periksa ruang dan izin penyimpanan browser, lalu coba lagi.");
  }
}

type KitchenContext = {
  mode: Mode;
  workspace: Workspace;
  update: (change: (workspace: Workspace) => Workspace) => Promise<void>;
  switchMode: (mode: Mode) => Promise<void>;
};

const Context = createContext<KitchenContext | null>(null);

export function useKitchen() {
  const context = useContext(Context);
  if (!context) throw new Error("Penyimpanan PaonPlan tidak tersedia.");
  return context;
}

const links = [
  { href: "/", label: "Beranda", icon: House },
  { href: "/rencana", label: "Rencana Porsi", icon: CalendarDays },
  { href: "/riwayat", label: "Riwayat", icon: ClipboardList },
];

export function Kitchen({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const { store, ready, error } = useSyncExternalStore(subscribe, snapshot, () => serverSnapshot);
  const mode = store.mode;
  const workspace = store[mode] ?? emptyWorkspace;
  const switchMode = (target: Mode) => write((previous) => ({
    ...previous,
    mode: target,
    demo: target === "demo" && !previous.demo ? makeDemo() : previous.demo,
  }));

  return (
    <Context.Provider value={{ mode, workspace, switchMode,
      update: (change) => write((previous) => ({ ...previous, [mode]: change(previous[mode] ?? emptyWorkspace) })),
    }}>
      <a className="skip" href="#konten">Lewati ke konten</a>
      <div className="shell">
        <aside className="sidebar">
          <Link href="/" className="brand">
            <span className="brand-mark"><CookingPot size={24} strokeWidth={1.7}/></span>
            <span><strong>PaonPlan</strong><small>ASISTEN PORSI WARUNG</small></span>
          </Link>
          <Link className="button side-action" href="/usaha">Buka ruang usaha</Link>
          <div className="nav-group">
            <p className="nav-label">RUANG KERJA</p>
            <nav aria-label="Navigasi utama">
              {links.map(({ href, label, icon: Icon }) => <Link key={href} href={href} aria-current={href === path ? "page" : undefined}>
                <Icon size={19} strokeWidth={1.8}/><span>{label}</span>
              </Link>)}
            </nav>
            <Link className="button side-action" href="/penjualan/catat"><Plus size={20}/>Catat penjualan</Link>
          </div>
          <div className="sidebar-note">
            <HardDrive size={19}/><div><strong>Penyimpanan lokal</strong><p>Data tersimpan di browser perangkat ini.</p></div>
          </div>
        </aside>
        <div className="main-column">
          <div className="topline"><span><span className="status-dot"/> Dapur harian</span>
            <button className="text-action" type="button" disabled={!ready || !!error} onClick={() => {
              const file = new Blob([JSON.stringify(store, null, 2)], { type: "application/json" });
              const url = URL.createObjectURL(file);
              const link = document.createElement("a");
              link.href = url;
              link.download = "paonplan-data-browser.json";
              link.click();
              URL.revokeObjectURL(url);
            }}>Ekspor data browser</button>
            <span className={mode === "demo" ? "pill demo-tag" : "pill plain-tag"}>
              {mode === "demo" ? <FlaskConical size={15}/> : <HardDrive size={15}/>}
              {mode === "demo" ? "Data contoh" : "Data warung"}
            </span>
          </div>
          <main id="konten" tabIndex={-1} className="main-content">
            {error && <p className="error-box" role="alert">{error}</p>}
            {ready ? <div key={mode}>{children}</div> : <p role="status">Memuat ruang kerja…</p>}
          </main>
          <footer><span>PaonPlan <span aria-hidden="true">·</span> Tahu berapa porsi sebelum mulai masak.</span><span>Data tersimpan di browser ini · WITA</span></footer>
        </div>
      </div>
    </Context.Provider>
  );
}

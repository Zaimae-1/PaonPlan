"use client";

import { useState } from "react";
import { number } from "@/lib/dates";
import { rupiah, type Ingredient, type MenuItem, type Recipe, type Restock } from "@/lib/operations/types";
import { api, Check, Input, Loading, num, on, OpHeading, optionalNum, Refresh, request, Select, showDate, str, Supplies, TaskForm,
  useView, type BaseView, type Change, type Values } from "./shared";
import { MenuSelect } from "./planning";
import { MenuArt } from "./menu-art";

type StockView = BaseView & {
  menus: MenuItem[]; ingredients: Ingredient[]; recipes: Recipe[];
  supplies: { items: Restock[]; incomplete: string[] };
  movements: { id: string; date: string; delta: number; kind: string; reason: string; name: string }[];
};

const moveNames: Record<string, string> = {
  production: "Produksi", production_incomplete: "Produksi · bahan belum dicatat", consumption: "Pemakaian bahan",
  sale: "Penjualan", adjustment: "Koreksi stok", purchase: "Pembelian", reserve: "Alokasi pesanan",
  release: "Pelepasan alokasi", void_return: "Pengembalian pembatalan",
};

async function mutate(body: unknown, refresh: Change) {
  await request(api, body);
  refresh();
}

export function Stock() {
  const view = useView<StockView>(api + "?view=stock");
  const [tab, setTab] = useState("menu");
  const tabs = [["menu", "Menu & porsi"], ["ingredients", "Bahan & resep"], ["purchase", "Pembelian"], ["moves", "Pergerakan stok"]];
  return <div className="ops-stack">
    <OpHeading tag="DAPUR & PERSEDIAAN" title="Menu & Stok" description="Kelola menu siap jual dan bahan mentah. Catat pemakaian bahan saat produksi."
      aside={<Refresh action={view.refresh}/>}/>
    <div className="book-tabs">{tabs.map(([value, label]) => <button className="button secondary" key={value} type="button"
      aria-pressed={tab === value} onClick={() => setTab(value)}>{label}</button>)}</div>
    {view.data ? <>
      {tab === "menu" && <div className="ops-grid">
        <section className="panel ops-list"><div className="ops-panel-heading"><h2>Menu warung</h2><p>Harga rupiah per porsi dan ketersediaan bersama.</p></div>
          {view.data.menus.map((menu) => <article className="ops-row" key={menu.id}>
            <div className="basket-menu"><MenuArt name={menu.name} category={menu.category} compact/><div><h3>{menu.name}</h3><p>{rupiah(menu.price)} · {menu.category}</p>
              <span className={menu.stock <= 5 ? "pill stockout-tag" : "pill forecast-tag"}>{number(menu.stock)} porsi tersedia</span>
              {!menu.active && <span className="pill plain-tag">Dinonaktifkan</span>}
              {!menu.public && <span className="pill plain-tag">Disembunyikan dari pelanggan</span>}
            </div></div>
            <details className="ops-disclosure"><summary>Ubah menu</summary><MenuForm menu={menu} refresh={view.refresh}/></details>
          </article>)}
          <details className="ops-disclosure"><summary>Tambah menu</summary><MenuForm refresh={view.refresh}/></details>
        </section>
        <div className="ops-stack">
          <Production data={view.data} refresh={view.refresh}/>
          <Adjust type="menu" items={view.data.menus} refresh={view.refresh}/>
        </div>
      </div>}
      {tab === "ingredients" && <>
        <div className="ops-grid">
          <section className="panel ops-list"><div className="ops-panel-heading"><h2>Stok bahan mentah</h2><p>Pilih satuan dasar yang tetap untuk setiap bahan.</p></div>
            {view.data.ingredients.map((item) => <article className="ops-row" key={item.id}>
              <div><h3>{item.name}</h3><p>{number(item.stock)} {item.unit} tersisa</p>
                {item.stock < item.minimum && <span className="pill stockout-tag">Di bawah batas {number(item.minimum)} {item.unit}</span>}</div>
              <details className="ops-disclosure"><summary>Ubah bahan</summary><IngredientForm item={item} refresh={view.refresh}/></details>
            </article>)}
            <details className="ops-disclosure"><summary>Tambah bahan</summary><IngredientForm refresh={view.refresh}/></details>
          </section>
          <div className="ops-stack"><RecipeForm data={view.data} refresh={view.refresh}/>
            <Adjust type="ingredient" items={view.data.ingredients} refresh={view.refresh}/></div>
        </div>
        <Supplies date={view.data.tomorrow} data={view.data.supplies}/>
      </>}
      {tab === "purchase" && <div className="ops-grid"><Purchase data={view.data} refresh={view.refresh}/><Supplies date={view.data.tomorrow} data={view.data.supplies}/></div>}
      {tab === "moves" && <section className="panel ops-list"><h2>20 pergerakan stok terakhir</h2>
        {view.data.movements.map((row) => <article className="ops-row" key={row.id}>
          <div><h3>{row.name}</h3><p className="hint">{showDate(row.date)} · {moveNames[row.kind] ?? row.kind}</p><p>{row.reason}</p></div>
          <strong>{row.delta > 0 ? "+" : ""}{number(row.delta)}</strong>
        </article>)}
        {!view.data.movements.length && <p>Belum ada pergerakan stok.</p>}
      </section>}
    </> : <Loading error={view.error} retry={view.refresh}/>}
  </div>;
}

function MenuForm({ menu, refresh }: { menu?: MenuItem; refresh: Change }) {
  return <TaskForm key={JSON.stringify(menu)} submit={menu ? "Simpan menu" : "Tambah menu"} send={(values) => mutate({
    action: "menu", id: menu?.id, name: str(values, "name"), category: str(values, "category"), price: num(values, "price"),
    active: on(values, "active"), public: on(values, "public"),
  }, refresh)}>
    <Input name="name" label="Nama menu" maxLength={80} defaultValue={menu?.name}/>
    <Input name="category" label="Kategori" maxLength={48} defaultValue={menu?.category}/>
    <Input name="price" label="Harga per porsi (Rp)" type="number" min={0} max={10000000} defaultValue={menu?.price}/>
    <Check name="active" defaultChecked={menu?.active ?? true}>Menu aktif untuk dijual</Check>
    <Check name="public" defaultChecked={menu?.public ?? true}>Tampilkan kepada pelanggan</Check>
  </TaskForm>;
}

function IngredientForm({ item, refresh }: { item?: Ingredient; refresh: Change }) {
  return <TaskForm key={JSON.stringify(item)} submit={item ? "Simpan bahan" : "Tambah bahan"} send={(values) => mutate({
    action: "ingredient", id: item?.id, name: str(values, "name"), unit: str(values, "unit"), minimum: num(values, "minimum"),
  }, refresh)}>
    <Input name="name" label="Nama bahan" maxLength={80} defaultValue={item?.name}/>
    <Select name="unit" label="Satuan dasar" defaultValue={item?.unit ?? "g"}>
      {(item ? [item.unit] : ["g", "ml", "buah"]).map((unit) => <option key={unit}>{unit}</option>)}
    </Select>
    <Input name="minimum" label="Batas peringatan stok" type="number" min={0} max={100000000} defaultValue={item?.minimum ?? 0}/>
  </TaskForm>;
}

function Adjust({ type, items, refresh }: { type: "menu" | "ingredient"; items: { id: string; name: string }[]; refresh: Change }) {
  return <section className="panel ops-list"><h2>Koreksi stok {type === "menu" ? "porsi" : "bahan"}</h2>
    <TaskForm submit="Catat koreksi stok" disabled={!items.length} send={(values) => mutate({
      action: "adjust", type, id: str(values, "id"), delta: num(values, "delta"), reason: str(values, "reason"),
    }, refresh)}>
      <Select name="id" label={type === "menu" ? "Menu" : "Bahan"}><option value="">Pilih item</option>
        {items.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</Select>
      <Input name="delta" label="Perubahan jumlah (+ tambah / − kurangi)" type="number" min={-100000000} max={100000000} step={1}/>
      <Input name="reason" label="Alasan koreksi stok" maxLength={240}/>
    </TaskForm>
  </section>;
}

function usageFields(values: Values, ingredients: Ingredient[]) {
  return ingredients.map((item) => ({ id: item.id, quantity: num(values, "usage-" + item.id) })).filter((item) => item.quantity > 0);
}

function Production({ data, refresh }: { data: StockView; refresh: Change }) {
  const [mode, setMode] = useState("recipe");
  return <section className="panel ops-list"><div className="ops-panel-heading"><h2>Catat batch produksi</h2><p>Tambahkan porsi siap jual dan catat bahan yang dipakai.</p></div>
    <TaskForm submit="Simpan batch produksi" disabled={!data.menus.length} send={(values) => mutate({
      action: "produce", menuId: str(values, "menuId"), portions: num(values, "portions"), mode,
      usage: mode === "actual" ? usageFields(values, data.ingredients) : [], reason: str(values, "reason"),
    }, refresh)}>
      <MenuSelect menus={data.menus.filter((item) => item.active)} name="menuId"/>
      <Input name="portions" label="Porsi baru yang disiapkan" type="number" min={1} max={100000}/>
      <Select name="mode" label="Pemakaian bahan" value={mode} onChange={(e) => setMode(e.target.value)}>
        <option value="recipe">Gunakan resep per porsi</option><option value="actual">Isi pemakaian aktual</option><option value="unknown">Pemakaian belum dicatat</option>
      </Select>
      {mode === "actual" && data.ingredients.map((item) => <Input key={item.id} name={"usage-" + item.id}
        label={item.name + " (" + item.unit + ")"} type="number" min={0} max={100000000} defaultValue={0}/>)}
      {mode === "unknown" && <p className="notice stockout">Pemakaian bahan saat produksi ditandai belum tercatat. Catat koreksi stok dengan alasan jika jumlahnya sudah diketahui.</p>}
      <Input name="reason" label="Catatan produksi" maxLength={240} placeholder="Misalnya batch makan siang"/>
    </TaskForm>
  </section>;
}

function RecipeForm({ data, refresh }: { data: StockView; refresh: Change }) {
  const [selected, setSelected] = useState(data.menus[0]?.id ?? "");
  const menu = data.menus.find((item) => item.id === selected);
  return <section className="panel ops-list"><h2>Resep per porsi</h2>
    <MenuSelect menus={data.menus} name="recipe-menu" value={selected} onChange={(e) => setSelected(e.target.value)}/>
    <TaskForm key={JSON.stringify([selected, data.recipes])} submit="Simpan resep" disabled={!selected || !data.ingredients.length}
      send={(values) => mutate({ action: "recipe", menuId: selected, complete: on(values, "complete"),
        lines: usageFields(values, data.ingredients) }, refresh)}>
      <p className="hint">Isi jumlah satuan dasar untuk satu porsi. Angka nol mengeluarkan bahan dari resep.</p>
      {data.ingredients.map((item) => <Input key={item.id} name={"usage-" + item.id} label={item.name + " (" + item.unit + " / porsi)"}
        type="number" min={0} max={100000000} defaultValue={data.recipes.find((row) => row.menu_id === selected && row.ingredient_id === item.id)?.quantity ?? 0}/>)}
      <Check name="complete" defaultChecked={menu?.recipe_complete}>Resep sudah lengkap</Check>
    </TaskForm>
  </section>;
}

function Purchase({ data, refresh }: { data: StockView; refresh: Change }) {
  return <section className="panel ops-list"><div className="ops-panel-heading"><h2>Catat pembelian bahan</h2>
    <p>Pembelian menambah stok bahan dan membuat satu pengeluaran yang terhubung.</p></div>
    <TaskForm submit="Simpan pembelian" disabled={!data.ingredients.length} send={(values) => mutate({
      action: "purchase", ingredientId: str(values, "ingredientId"), date: str(values, "date"), quantity: num(values, "quantity"),
      packageSize: optionalNum(values, "packageSize"), amount: num(values, "amount"), method: str(values, "method"),
    }, refresh)}>
      <Select name="ingredientId" label="Bahan yang dibeli"><option value="">Pilih bahan</option>
        {data.ingredients.map((item) => <option key={item.id} value={item.id}>{item.name} ({item.unit})</option>)}</Select>
      <Input name="date" label="Tanggal pembelian" type="date" max={data.today} defaultValue={data.today}/>
      <Input name="quantity" label="Jumlah satuan dasar yang dibeli" type="number" min={1} max={100000000}/>
      <Input name="packageSize" label="Isi per kemasan (opsional, satuan dasar)" type="number" min={1} max={100000000} required={false}/>
      <Input name="amount" label="Total harga dibayar (Rp)" type="number" min={1} max={1000000000000}/>
      <Select name="method" label="Dibayar dari"><option value="cash">Kas tunai</option><option value="other">Non-tunai / rekening</option></Select>
    </TaskForm>
  </section>;
}

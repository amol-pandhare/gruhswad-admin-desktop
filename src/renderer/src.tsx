import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import type { Dashboard, DateRange, Publication } from "../shared/contracts";
import "./styles.css";

type Page = "dashboard" | "orders" | "expenses" | "reports" | "menu" | "inbox" | "settings";
const money = (value: number) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(value || 0);
const today = () => new Date().toISOString().slice(0, 10);
const monthRange = (): DateRange => {
  const date = new Date();
  return { from: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-01`, to: today() };
};
const nav: [Page, string, string][] = [
  ["dashboard", "Overview", "OV"], ["orders", "Orders", "OR"], ["expenses", "Expenses", "EX"],
  ["reports", "Reports", "RP"], ["menu", "One-day menu", "MN"], ["inbox", "WhatsApp inbox", "WA"], ["settings", "Settings", "ST"],
];

function App() {
  const [page, setPage] = useState<Page>("dashboard");
  const [range, setRange] = useState(monthRange);
  const [notice, setNotice] = useState("");
  const title = nav.find(([id]) => id === page)?.[1];
  return <div className="app-shell">
    <aside><div className="brand"><b>G</b><div><strong>Gruhswad</strong><span>Kitchen admin</span></div></div>
      <nav>{nav.map(([id, label, icon]) => <button className={page === id ? "active" : ""} onClick={() => setPage(id)} key={id}><i>{icon}</i>{label}</button>)}</nav>
      <div className="side-note"><span>Local-first</span><p>Your operational data stays on this computer.</p></div>
    </aside>
    <main><header><div><small>HOME KITCHEN OPERATIONS</small><h1>{title}</h1></div>{!(["menu", "settings", "inbox"] as Page[]).includes(page) && <DateFilter range={range} setRange={setRange} />}</header>
      {notice && <div className="notice" onClick={() => setNotice("")}>{notice}</div>}
      {page === "dashboard" && <DashboardPage range={range} />}
      {page === "orders" && <OrdersPage range={range} notify={setNotice} />}
      {page === "expenses" && <ExpensesPage range={range} notify={setNotice} />}
      {page === "reports" && <ReportsPage range={range} notify={setNotice} />}
      {page === "menu" && <MenuPage notify={setNotice} />}
      {page === "inbox" && <InboxPage notify={setNotice} />}
      {page === "settings" && <SettingsPage notify={setNotice} />}
    </main>
  </div>;
}

function DateFilter({ range, setRange }: { range: DateRange; setRange: (value: DateRange) => void }) {
  return <div className="date-filter"><label>From<input type="date" value={range.from} onChange={(event) => setRange({ ...range, from: event.target.value })} /></label><label>To<input type="date" value={range.to} onChange={(event) => setRange({ ...range, to: event.target.value })} /></label></div>;
}

function DashboardPage({ range }: { range: DateRange }) {
  const [data, setData] = useState<Dashboard | null>(null);
  useEffect(() => { window.admin.dashboard(range).then(setData); }, [range]);
  if (!data) return <Empty text="Loading dashboard..." />;
  return <><section className="metric-grid"><Metric label="Cash revenue" value={money(data.revenue)} tone="green" /><Metric label="Expenses" value={money(data.expenses)} tone="red" /><Metric label="Profit / loss" value={money(data.profit)} tone={data.profit >= 0 ? "gold" : "red"} /><Metric label="Orders" value={String(data.orderCount)} tone="brown" /><Metric label="Outstanding" value={money(data.outstanding)} tone="red" /><Metric label="Average order" value={money(data.averageOrder)} tone="green" /></section>
    <section className="split"><Panel title="Recent orders"><DataTable rows={data.recentOrders} columns={[["customer_name", "Customer"], ["service_date", "Service date"], ["status", "Status"], ["total", "Total"]]} moneyKeys={["total"]} /></Panel>
      <Panel title="Expenses by category">{data.expenseByCategory.length ? <div className="bars">{data.expenseByCategory.map((row) => <div key={row.category}><span>{row.category}</span><b style={{ width: `${Math.max(8, row.total / Math.max(...data.expenseByCategory.map((item) => item.total)) * 100)}%` }} /><strong>{money(row.total)}</strong></div>)}</div> : <Empty text="No expenses in this period." />}</Panel>
    </section></>;
}
function Metric({ label, value, tone }: { label: string; value: string; tone: string }) { return <article className={`metric ${tone}`}><span>{label}</span><strong>{value}</strong></article>; }

function OrdersPage({ range, notify }: { range: DateRange; notify: (message: string) => void }) {
  const [rows, setRows] = useState<any[]>([]); const [catalog, setCatalog] = useState<any>({ items: [] }); const [open, setOpen] = useState(false);
  const load = () => window.admin.orders.list(range).then(setRows);
  useEffect(() => { load(); window.admin.menu.catalog().then(setCatalog); }, [range]);
  async function status(id: string, value: any) { await window.admin.orders.updateStatus(id, value); load(); notify("Order status updated."); }
  async function paid(row: any) { const amount = Math.max(0, row.total - row.paid); if (!amount) return; await window.admin.orders.addPayment({ orderId: row.id, amount, receivedAt: new Date().toISOString(), method: "UPI", status: "received" }); load(); notify("Payment recorded."); }
  return <Panel title="Order history" action={<button className="primary" onClick={() => setOpen(true)}>New order</button>}>
    {open && <OrderForm items={catalog.items} close={() => setOpen(false)} saved={() => { setOpen(false); load(); notify("Order saved."); }} />}
    {rows.length ? <div className="order-list">{rows.map((row) => <article key={row.id}><div><strong>{row.customer_name}</strong><span>{row.service_date} / {row.phone}</span></div><b>{money(row.total)}</b><select value={row.status} onChange={(event) => status(row.id, event.target.value)}>{["draft", "confirmed", "preparing", "ready", "completed", "cancelled"].map((value) => <option key={value}>{value}</option>)}</select><button disabled={row.payment_status === "paid"} onClick={() => paid(row)}>{row.payment_status === "paid" ? "Paid" : "Mark paid"}</button></article>)}</div> : <Empty text="No orders found for this period." />}
  </Panel>;
}

function OrderForm({ items, close, saved }: { items: any[]; close: () => void; saved: () => void }) {
  const [name, setName] = useState(""); const [phone, setPhone] = useState(""); const [date, setDate] = useState(today()); const [selected, setSelected] = useState("");
  const item = items.find((value) => value.id === selected);
  async function submit(event: React.FormEvent) { event.preventDefault(); if (!item) return; await window.admin.orders.save({ customerName: name, phone, serviceDate: date, fulfilment: "pickup", address: "", notes: "", source: "manual", status: "draft", lines: [{ menuItemId: item.id, name: item.name, quantity: 1, unitPrice: item.price }] }); saved(); }
  return <form className="inline-form" onSubmit={submit}><h3>Record an order</h3><label>Customer<input required value={name} onChange={(event) => setName(event.target.value)} /></label><label>Phone<input required value={phone} onChange={(event) => setPhone(event.target.value)} /></label><label>Service date<input type="date" required value={date} onChange={(event) => setDate(event.target.value)} /></label><label>Dish<select required value={selected} onChange={(event) => setSelected(event.target.value)}><option value="">Choose a dish</option>{items.filter((value) => value.available).map((value) => <option value={value.id} key={value.id}>{value.name} / {money(value.price)}</option>)}</select></label><div><button type="button" onClick={close}>Cancel</button><button className="primary">Save order</button></div></form>;
}

function ExpensesPage({ range, notify }: { range: DateRange; notify: (message: string) => void }) {
  const [rows, setRows] = useState<any[]>([]); const [form, setForm] = useState({ date: today(), category: "Ingredients", description: "", amount: "", paymentMethod: "UPI", notes: "" });
  const load = () => window.admin.expenses.list(range).then(setRows); useEffect(() => { load(); }, [range]);
  async function submit(event: React.FormEvent) { event.preventDefault(); await window.admin.expenses.save({ ...form, amount: Number(form.amount) }); setForm({ ...form, description: "", amount: "", notes: "" }); load(); notify("Expense recorded."); }
  return <section className="split wide-left"><Panel title="Monthly expenses"><DataTable rows={rows} columns={[["date", "Date"], ["category", "Category"], ["description", "Description"], ["payment_method", "Paid via"], ["amount", "Amount"]]} moneyKeys={["amount"]} /></Panel><Panel title="Record purchase"><form className="stack-form" onSubmit={submit}>{Object.entries(form).map(([key, value]) => <label key={key}>{key === "paymentMethod" ? "Payment method" : key.replace(/^./, (letter) => letter.toUpperCase())}<input type={key === "date" ? "date" : key === "amount" ? "number" : "text"} required={key !== "notes"} value={value} onChange={(event) => setForm({ ...form, [key]: event.target.value })} /></label>)}<button className="primary">Add expense</button></form></Panel></section>;
}

function ReportsPage({ range, notify }: { range: DateRange; notify: (message: string) => void }) {
  const [data, setData] = useState<Dashboard | null>(null); useEffect(() => { window.admin.dashboard(range).then(setData); }, [range]);
  return <><section className="report-hero"><div><span>Cash-basis result</span><strong>{money(data?.profit ?? 0)}</strong><p>Revenue {money(data?.revenue ?? 0)} minus expenses {money(data?.expenses ?? 0)}</p></div></section><Panel title="Export monthly records"><div className="export-grid">{(["orders", "expenses", "summary"] as const).map((kind) => <button key={kind} onClick={async () => { const path = await window.admin.reports.exportCsv(kind, range); if (path) notify(`Saved ${kind} report.`); }}><b>{kind}</b><span>Download CSV -&gt;</span></button>)}</div></Panel></>;
}

function MenuPage({ notify }: { notify: (message: string) => void }) {
  const [catalog, setCatalog] = useState<any>({ categories: [], items: [] }); const [selected, setSelected] = useState<string[]>([]); const [featured, setFeatured] = useState<string | null>(null); const [date, setDate] = useState(today()); const [title, setTitle] = useState("Tomorrow's Fresh Menu"); const [cutoff, setCutoff] = useState("Order before 9:00 PM for next-day delivery"); const [whatsapp, setWhatsapp] = useState("918123415647"); const [query, setQuery] = useState("");
  useEffect(() => { window.admin.menu.catalog().then(setCatalog); }, []);
  const items = catalog.items.filter((item: any) => item.available && item.name.toLowerCase().includes(query.toLowerCase()));
  async function publish() { const incompatible = selected.filter((id) => !catalog.items.find((item: any) => item.id === id)?.webCompatible); if (incompatible.length) throw new Error("Remove items that are not compatible with the website catalog."); const payload: Publication = { date, published: true, title, itemIds: selected, featuredItemId: featured, orderCutoff: cutoff, whatsapp }; await window.admin.menu.publish(payload); notify("Menu published to Gruhswad and saved locally."); }
  return <section className="menu-builder"><div><Panel title="Build the one-day menu"><div className="publish-fields"><label>Service date<input type="date" value={date} onChange={(event) => setDate(event.target.value)} /></label><label>Title<input value={title} onChange={(event) => setTitle(event.target.value)} /></label><label>Cutoff<input value={cutoff} onChange={(event) => setCutoff(event.target.value)} /></label><label>WhatsApp<input value={whatsapp} onChange={(event) => setWhatsapp(event.target.value)} /></label></div><input className="search" placeholder="Search the master menu" value={query} onChange={(event) => setQuery(event.target.value)} /><div className="catalog-grid">{items.map((item: any) => <label className={selected.includes(item.id) ? "selected" : ""} key={item.id}><input type="checkbox" checked={selected.includes(item.id)} onChange={() => setSelected((current) => current.includes(item.id) ? current.filter((id) => id !== item.id) : [...current, item.id])} /><span><strong>{item.name}</strong><small>{item.portion} / {money(item.price)}</small></span></label>)}</div></Panel></div>
    <aside className="selection-card"><span>{selected.length} selected</span><h2>Tomorrow's menu</h2>{selected.map((id) => { const item = catalog.items.find((value: any) => value.id === id); return <div className="selected-line" key={id}><button className={featured === id ? "star on" : "star"} onClick={() => setFeatured(featured === id ? null : id)}>*</button><span>{item?.name}</span><b>{money(item?.price)}</b></div>; })}<button className="primary publish" disabled={!selected.length} onClick={() => publish().catch((error) => notify(error.message))}>Publish menu</button><small>* marks the featured dish. Publication updates the existing website contract.</small></aside>
  </section>;
}

function InboxPage({ notify }: { notify: (message: string) => void }) {
  const [rows, setRows] = useState<any[]>([]); const load = () => window.admin.inbox.list().then(setRows); useEffect(() => { load(); }, []);
  return <Panel title="WhatsApp Business inbox" action={<button className="primary" onClick={async () => { const result = await window.admin.inbox.sync(); load(); notify(`${result.imported} structured orders, ${result.unmatched} unmatched messages synced.`); }}>Sync inbox</button>}><DataTable rows={rows} columns={[["received_at", "Received"], ["sender", "Sender"], ["status", "Status"], ["message", "Message"]]} /></Panel>;
}

function SettingsPage({ notify }: { notify: (message: string) => void }) {
  const [form, setForm] = useState<any>({ webhookUrl: "", neonDatabaseUrl: "", inboxToken: "" }); const [update, setUpdate] = useState("");
  useEffect(() => { window.admin.settings.get().then((value) => setForm((current: any) => ({ ...current, ...value }))); return window.admin.updates.onStatus(setUpdate); }, []);
  async function save(event: React.FormEvent) { event.preventDefault(); await window.admin.settings.set({ webhookUrl: form.webhookUrl }, { neonDatabaseUrl: form.neonDatabaseUrl, inboxToken: form.inboxToken }); notify("Settings saved securely."); }
  return <section className="settings-grid"><Panel title="Connections"><form className="stack-form" onSubmit={save}><label>Webhook URL<input value={form.webhookUrl ?? ""} onChange={(event) => setForm({ ...form, webhookUrl: event.target.value })} /></label><label>Neon publication URL<input type="password" placeholder={form.hasNeonUrl ? "Saved securely - enter to replace" : "postgresql://..."} value={form.neonDatabaseUrl ?? ""} onChange={(event) => setForm({ ...form, neonDatabaseUrl: event.target.value })} /></label><label>Inbox API token<input type="password" placeholder={form.hasInboxToken ? "Saved securely - enter to replace" : "Token"} value={form.inboxToken ?? ""} onChange={(event) => setForm({ ...form, inboxToken: event.target.value })} /></label><button className="primary">Save settings</button></form></Panel><Panel title="Data safety"><div className="action-list"><button onClick={async () => { if (await window.admin.settings.backup()) notify("Encrypted backup saved."); }}>Create encrypted backup</button><button onClick={async () => { if (await window.admin.settings.restore()) notify("Backup staged. Restart to complete restore."); }}>Restore a backup</button></div></Panel><Panel title="Application updates"><p className="muted">{update || "Updates are delivered through signed GitHub Releases."}</p><button className="primary" onClick={() => window.admin.updates.check()}>Check for updates</button>{update === "update-downloaded" && <button onClick={() => window.admin.updates.install()}>Restart and install</button>}</Panel></section>;
}

function Panel({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) { return <section className="panel"><div className="panel-head"><h2>{title}</h2>{action}</div>{children}</section>; }
function Empty({ text }: { text: string }) { return <div className="empty">{text}</div>; }
function DataTable({ rows, columns, moneyKeys = [] }: { rows: any[]; columns: [string, string][]; moneyKeys?: string[] }) { if (!rows.length) return <Empty text="No records found for this period." />; return <div className="table-wrap"><table><thead><tr>{columns.map(([, label]) => <th key={label}>{label}</th>)}</tr></thead><tbody>{rows.map((row, index) => <tr key={row.id ?? index}>{columns.map(([key]) => <td key={key}>{moneyKeys.includes(key) ? money(row[key]) : String(row[key] ?? "-")}</td>)}</tr>)}</tbody></table></div>; }

createRoot(document.getElementById("root")!).render(<React.StrictMode><App /></React.StrictMode>);

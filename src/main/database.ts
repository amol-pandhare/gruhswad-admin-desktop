import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import seed from "../shared/master-menu.seed.json";
import type { DateRange, ExpenseInput, OrderInput, PaymentInput, Publication } from "../shared/contracts";
import * as schema from "./schema";

let sqlite: Database.Database;
export let db: ReturnType<typeof drizzle<typeof schema>>;

export function initializeDatabase(databasePath: string, migrationPath: string) {
  sqlite = new Database(databasePath);
  sqlite.pragma("journal_mode = WAL"); sqlite.pragma("foreign_keys = ON");
  const migration = readFileSync(join(migrationPath, "0001_initial.sql"), "utf8");
  sqlite.exec(migration);
  sqlite.prepare("INSERT OR IGNORE INTO schema_migrations(version, applied_at) VALUES (?, ?)").run("0001_initial", new Date().toISOString());
  seedCatalog(); db = drizzle(sqlite, { schema });
}

function seedCatalog() {
  const category = sqlite.prepare("INSERT OR IGNORE INTO menu_categories(id,name,sort_order) VALUES (@id,@name,@order)");
  const item = sqlite.prepare("INSERT OR IGNORE INTO menu_items(id,category_id,name,description,portion,price,image,available,web_compatible) VALUES (@id,@categoryId,@name,@description,@portion,@price,@image,@available,1)");
  sqlite.transaction(() => { for (const value of seed.categories) category.run(value); for (const value of seed.items) item.run({ ...value, image: value.image ?? null, available: value.available ? 1 : 0 }); })();
}

export function getCatalog() { return { categories: sqlite.prepare("SELECT id,name,sort_order AS 'order' FROM menu_categories ORDER BY sort_order").all(), items: sqlite.prepare("SELECT id,category_id AS categoryId,name,description,portion,price,image,available,web_compatible AS webCompatible FROM menu_items ORDER BY category_id,name").all() }; }
export function listOrders(range?: DateRange) { const where = range ? "WHERE o.service_date BETWEEN ? AND ?" : ""; return sqlite.prepare(`SELECT o.*,c.name customer_name,c.phone,COALESCE((SELECT SUM(CASE WHEN status='received' THEN amount ELSE -amount END) FROM payments WHERE order_id=o.id),0) paid FROM orders o JOIN customers c ON c.id=o.customer_id ${where} ORDER BY o.service_date DESC,o.created_at DESC`).all(...(range ? [range.from, range.to] : [])); }
export function listExpenses(range?: DateRange) { return range ? sqlite.prepare("SELECT * FROM expenses WHERE date BETWEEN ? AND ? ORDER BY date DESC").all(range.from, range.to) : sqlite.prepare("SELECT * FROM expenses ORDER BY date DESC").all(); }

export function saveOrder(input: OrderInput) {
  const id = input.id ?? randomUUID(), now = new Date().toISOString();
  sqlite.transaction(() => {
    let customer = sqlite.prepare("SELECT id FROM customers WHERE phone=?").get(input.phone) as { id: string } | undefined;
    const customerId = customer?.id ?? randomUUID();
    sqlite.prepare("INSERT INTO customers(id,name,phone,address,created_at) VALUES(?,?,?,?,?) ON CONFLICT(phone) DO UPDATE SET name=excluded.name,address=excluded.address").run(customerId,input.customerName,input.phone,input.address,now);
    const total = input.lines.reduce((sum,line)=>sum+line.quantity*line.unitPrice,0);
    sqlite.prepare("INSERT INTO orders(id,customer_id,service_date,fulfilment,address,notes,source,status,payment_status,total,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET customer_id=excluded.customer_id,service_date=excluded.service_date,fulfilment=excluded.fulfilment,address=excluded.address,notes=excluded.notes,status=excluded.status,total=excluded.total,updated_at=excluded.updated_at").run(id,customerId,input.serviceDate,input.fulfilment,input.address,input.notes,input.source,input.status,"unpaid",total,now,now);
    sqlite.prepare("DELETE FROM order_lines WHERE order_id=?").run(id);
    const insert = sqlite.prepare("INSERT INTO order_lines(id,order_id,menu_item_id,name,quantity,unit_price,line_total) VALUES(?,?,?,?,?,?,?)");
    for (const line of input.lines) insert.run(randomUUID(),id,line.menuItemId ?? null,line.name,line.quantity,line.unitPrice,line.quantity*line.unitPrice);
  })(); return id;
}
export function updateOrderStatus(id: string,status: string) { sqlite.prepare("UPDATE orders SET status=?,updated_at=? WHERE id=?").run(status,new Date().toISOString(),id); }
export function addPayment(input: PaymentInput) { sqlite.transaction(()=>{ sqlite.prepare("INSERT INTO payments(id,order_id,amount,received_at,method,status) VALUES(?,?,?,?,?,?)").run(randomUUID(),input.orderId,input.amount,input.receivedAt,input.method,input.status); const row=sqlite.prepare("SELECT o.total,COALESCE(SUM(CASE WHEN p.status='received' THEN p.amount ELSE -p.amount END),0) paid FROM orders o LEFT JOIN payments p ON p.order_id=o.id WHERE o.id=? GROUP BY o.id").get(input.orderId) as {total:number;paid:number}; const status=row.paid<=0?"unpaid":row.paid>=row.total?"paid":"partial"; sqlite.prepare("UPDATE orders SET payment_status=?,updated_at=? WHERE id=?").run(status,new Date().toISOString(),input.orderId); })(); }
export function saveExpense(input: ExpenseInput) { const id=input.id??randomUUID(); sqlite.prepare("INSERT INTO expenses(id,date,category,description,amount,payment_method,notes) VALUES(?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET date=excluded.date,category=excluded.category,description=excluded.description,amount=excluded.amount,payment_method=excluded.payment_method,notes=excluded.notes").run(id,input.date,input.category,input.description,input.amount,input.paymentMethod,input.notes); return id; }
export function removeExpense(id:string){ sqlite.prepare("DELETE FROM expenses WHERE id=?").run(id); }
export function savePublication(payload:Publication){ sqlite.prepare("INSERT INTO menu_publications(id,service_date,payload,published_at) VALUES(?,?,?,?)").run(randomUUID(),payload.date,JSON.stringify(payload),new Date().toISOString()); }
export function publicationHistory(){ return sqlite.prepare("SELECT id,service_date,payload,published_at FROM menu_publications ORDER BY published_at DESC LIMIT 50").all(); }

export function dashboard(range:DateRange){
  const revenue=(sqlite.prepare("SELECT COALESCE(SUM(CASE WHEN status='received' THEN amount ELSE -amount END),0) value FROM payments WHERE substr(received_at,1,10) BETWEEN ? AND ?").get(range.from,range.to) as any).value;
  const expenses=(sqlite.prepare("SELECT COALESCE(SUM(amount),0) value FROM expenses WHERE date BETWEEN ? AND ?").get(range.from,range.to) as any).value;
  const orders=(sqlite.prepare("SELECT COUNT(*) count,COALESCE(AVG(total),0) average,COALESCE(SUM(CASE WHEN payment_status!='paid' AND status!='cancelled' THEN total ELSE 0 END),0) outstanding FROM orders WHERE service_date BETWEEN ? AND ?").get(range.from,range.to) as any);
  return { revenue,expenses,profit:revenue-expenses,orderCount:orders.count,outstanding:orders.outstanding,averageOrder:orders.average,recentOrders:listOrders(range).slice(0,6),expenseByCategory:sqlite.prepare("SELECT category,SUM(amount) total FROM expenses WHERE date BETWEEN ? AND ? GROUP BY category ORDER BY total DESC").all(range.from,range.to) };
}
export function getSettings(){ return Object.fromEntries((sqlite.prepare("SELECT key,value FROM settings").all() as {key:string;value:string}[]).map(row=>[row.key,row.value])); }
export function setSettings(values:Record<string,string>){ const upsert=sqlite.prepare("INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value"); sqlite.transaction(()=>Object.entries(values).forEach(([key,value])=>upsert.run(key,value)))(); }
export function listInbox(){ return sqlite.prepare("SELECT * FROM whatsapp_imports ORDER BY received_at DESC").all(); }
export function addInbox(item:{id:string;sender:string;message:string;receivedAt:string;parsedPayload:string|null}){ sqlite.prepare("INSERT OR IGNORE INTO whatsapp_imports(id,meta_message_id,sender,message,parsed_payload,status,received_at) VALUES(?,?,?,?,?,'new',?)").run(item.id,item.id,item.sender,item.message,item.parsedPayload,item.receivedAt); }
export function finishInbox(id:string,orderId:string|null){sqlite.prepare("UPDATE whatsapp_imports SET status=?,order_id=? WHERE meta_message_id=?").run(orderId?"imported":"unmatched",orderId,id);}
export function closeDatabase(){ sqlite?.close(); }
export function rawDatabase(){ return sqlite; }

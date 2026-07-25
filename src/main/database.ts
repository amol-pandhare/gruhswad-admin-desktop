import { randomUUID } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import seed from "../shared/master-menu.seed.json";
import type { CatalogCategory, CatalogItem, DateRange, ExpenseInput, OrderInput, PaymentInput, Publication, RuntimeConfig } from "../shared/contracts";
import { isPublishableItem } from "../shared/catalog";
import { normalizeServiceDate, normalizeTimestamp } from "../shared/dates";
import { normalizeCloudOrderLine } from "../shared/order-detail";
import { normalizeRuntimeSetting, runtimeConfigFromSettings } from "../shared/runtime-config";
import * as schema from "./schema";

let sqlite: Database.Database;
export let db: ReturnType<typeof drizzle<typeof schema>>;

function repairCloudOrderDates(){const rows=sqlite.prepare("SELECT id,service_date,created_at,updated_at FROM cloud_orders").all() as {id:string;service_date:string;created_at:string;updated_at:string}[];const update=sqlite.prepare("UPDATE cloud_orders SET service_date=?,created_at=?,updated_at=? WHERE id=?");sqlite.transaction(()=>{for(const row of rows)update.run(normalizeServiceDate(row.service_date),normalizeTimestamp(row.created_at),normalizeTimestamp(row.updated_at),row.id);})();}

export function initializeDatabase(databasePath: string, migrationPath: string) {
  sqlite = new Database(databasePath);
  sqlite.pragma("journal_mode = WAL"); sqlite.pragma("foreign_keys = ON");
  sqlite.exec("CREATE TABLE IF NOT EXISTS schema_migrations (version TEXT PRIMARY KEY, applied_at TEXT NOT NULL)");
  const applied = new Set((sqlite.prepare("SELECT version FROM schema_migrations").all() as { version: string }[]).map((row) => row.version));
  for (const file of readdirSync(migrationPath).filter((name) => name.endsWith(".sql")).sort()) {
    const version = file.replace(/\.sql$/, "");
    if (applied.has(version)) continue;
    const migration = readFileSync(join(migrationPath, file), "utf8");
    sqlite.transaction(() => {
      sqlite.exec(migration);
      sqlite.prepare("INSERT INTO schema_migrations(version, applied_at) VALUES (?, ?)").run(version, new Date().toISOString());
    })();
  }
  repairCloudOrderDates();
  seedCatalog(); repairRuntimeSettings(); db = drizzle(sqlite, { schema });
}

function seedCatalog() {
  const category = sqlite.prepare("INSERT OR IGNORE INTO menu_categories(id,name,sort_order) VALUES (@id,@name,@order)");
  const item = sqlite.prepare("INSERT OR IGNORE INTO menu_items(id,category_id,name,description,portion,price,image,available,web_compatible) VALUES (@id,@categoryId,@name,@description,@portion,@price,@image,@available,1)");
  sqlite.transaction(() => { for (const value of seed.categories) category.run(value); for (const value of seed.items) item.run({ ...value, image: value.image ?? null, available: value.available ? 1 : 0 }); })();
}

export function getCatalog() {
  const categories = sqlite.prepare("SELECT id,name,sort_order AS 'order',active,updated_at AS updatedAt FROM menu_categories ORDER BY sort_order").all();
  const groups = sqlite.prepare("SELECT * FROM bundle_option_groups ORDER BY display_order").all() as any[];
  const choices = sqlite.prepare("SELECT c.*,i.name FROM bundle_option_choices c LEFT JOIN menu_items i ON i.id=c.item_id ORDER BY c.display_order").all() as any[];
  const items = (sqlite.prepare("SELECT id,category_id AS categoryId,item_type AS type,name,description,portion,price,image,available,is_new AS isNew,tags,display_order AS 'order',archived_at AS archivedAt,web_compatible AS webCompatible,updated_at AS updatedAt FROM menu_items ORDER BY display_order,name").all() as any[]).map((item) => ({ ...item, available: Boolean(item.available), isNew: Boolean(item.isNew), archived: Boolean(item.archivedAt), webCompatible: Boolean(item.webCompatible), tags: JSON.parse(item.tags || "[]"), bundleGroups: groups.filter((group) => group.item_id === item.id).map((group) => ({ id: group.id, name: group.name, minChoices: group.min_choices, maxChoices: group.max_choices, order: group.display_order, choices: choices.filter((choice) => choice.group_id === group.id).map((choice) => ({ id: choice.id, itemId: choice.item_id, name: choice.name || "", upgradePrice: choice.upgrade_price, available: Boolean(choice.available), order: choice.display_order })) })) }));
  return { categories, items };
}
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
export function savePublication(payload:Publication){ const now=new Date().toISOString();sqlite.transaction(()=>{sqlite.prepare("INSERT INTO menu_publications(id,service_date,payload,published_at) VALUES(?,?,?,?)").run(randomUUID(),payload.date,JSON.stringify(payload),now);sqlite.prepare("INSERT INTO current_publication(publication_key,payload,published_at) VALUES('current',?,?) ON CONFLICT(publication_key) DO UPDATE SET payload=excluded.payload,published_at=excluded.published_at").run(JSON.stringify(payload),now);markDirty("publication","current",payload);})(); }
export function publicationHistory(){ return sqlite.prepare("SELECT id,service_date,payload,published_at FROM menu_publications ORDER BY published_at DESC LIMIT 50").all(); }
export function getCurrentPublication(){const row=sqlite.prepare("SELECT payload FROM current_publication WHERE publication_key='current'").get() as {payload:string}|undefined;return row?JSON.parse(row.payload):null;}

function markDirty(entityType:string,entityId:string,payload:unknown){sqlite.prepare("INSERT INTO sync_state(entity_type,entity_id,dirty,base_payload) VALUES(?,?,1,NULL) ON CONFLICT(entity_type,entity_id) DO UPDATE SET dirty=1").run(entityType,entityId);}
export function validateCatalogItemReferences(item:CatalogItem){const category=sqlite.prepare("SELECT active FROM menu_categories WHERE id=?").get(item.categoryId) as {active:number}|undefined;if(!category)throw new Error("Select an existing catalog category.");for(const group of item.bundleGroups){for(const choice of group.choices){const dish=sqlite.prepare("SELECT item_type,available,archived_at FROM menu_items WHERE id=?").get(choice.itemId) as {item_type:string;available:number;archived_at:string|null}|undefined;if(!dish||dish.item_type!=="dish"||!dish.available||dish.archived_at)throw new Error(`Bundle choice ${choice.itemId} must reference an available, active dish.`);}}}
export function saveCatalogItem(item:CatalogItem){const now=new Date().toISOString();sqlite.transaction(()=>{sqlite.prepare("INSERT INTO menu_items(id,category_id,item_type,name,description,portion,price,image,available,is_new,tags,display_order,archived_at,web_compatible,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET category_id=excluded.category_id,item_type=excluded.item_type,name=excluded.name,description=excluded.description,portion=excluded.portion,price=excluded.price,image=excluded.image,available=excluded.available,is_new=excluded.is_new,tags=excluded.tags,display_order=excluded.display_order,archived_at=excluded.archived_at,updated_at=excluded.updated_at").run(item.id,item.categoryId,item.type,item.name,item.description,item.portion,item.price,item.image??"food-placeholder.jpeg",item.available?1:0,item.isNew?1:0,JSON.stringify(item.tags),item.order,item.archived?now:null,1,now);sqlite.prepare("DELETE FROM bundle_option_groups WHERE item_id=?").run(item.id);const groupInsert=sqlite.prepare("INSERT INTO bundle_option_groups(id,item_id,name,min_choices,max_choices,display_order) VALUES(?,?,?,?,?,?)"),choiceInsert=sqlite.prepare("INSERT INTO bundle_option_choices(id,group_id,item_id,upgrade_price,available,display_order) VALUES(?,?,?,?,?,?)");for(const group of item.bundleGroups){groupInsert.run(group.id,item.id,group.name,group.minChoices,group.maxChoices,group.order);for(const choice of group.choices)choiceInsert.run(choice.id,group.id,choice.itemId,choice.upgradePrice,choice.available?1:0,choice.order);}markDirty("catalog_item",item.id,item);})();}
export function saveCatalogItemCompatibility(id:string,webCompatible:boolean){sqlite.prepare("UPDATE menu_items SET web_compatible=? WHERE id=?").run(webCompatible?1:0,id);}
export function archiveCatalogItem(id:string,archived:boolean){const now=new Date().toISOString();sqlite.prepare("UPDATE menu_items SET archived_at=?,updated_at=? WHERE id=?").run(archived?now:null,now,id);markDirty("catalog_item",id,{archived});}
export function saveCatalogCategory(category:CatalogCategory){const now=new Date().toISOString();sqlite.prepare("INSERT INTO menu_categories(id,name,sort_order,active,updated_at) VALUES(?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,sort_order=excluded.sort_order,active=excluded.active,updated_at=excluded.updated_at").run(category.id,category.name,category.order,category.active?1:0,now);markDirty("catalog_category",category.id,category);}
export function setCatalogCategoryActive(id:string,active:boolean){const current=sqlite.prepare("SELECT id,name,sort_order AS 'order',active FROM menu_categories WHERE id=?").get(id) as any;if(!current)throw new Error("Catalog category not found.");saveCatalogCategory({...current,active});}
export function validatePublicationCatalog(payload:Publication){const catalog=getCatalog(),categories=catalog.categories as CatalogCategory[],selected=payload.itemIds.map((id)=>catalog.items.find((item)=>item.id===id));if(selected.some((item)=>!item))throw new Error("The menu contains an item that no longer exists.");const invalid=selected.find((item)=>item&&!isPublishableItem(item,categories));if(invalid)throw new Error(`${invalid.name} is unavailable, archived, incompatible, or belongs to an inactive category.`);}
function runtimeConfigFromRows(rows:{settings_key:string;payload:string}[]):RuntimeConfig{const map=Object.fromEntries(rows.map((row)=>{let payload:unknown;try{payload=JSON.parse(row.payload);}catch{payload=undefined;}return[row.settings_key,payload];}));return runtimeConfigFromSettings(map);}
function repairRuntimeSettings(){const rows=sqlite.prepare("SELECT settings_key,payload FROM app_settings").all() as {settings_key:string;payload:string}[],config=runtimeConfigFromRows(rows),upsert=sqlite.prepare("INSERT INTO app_settings(settings_key,payload,updated_at) VALUES(?,?,COALESCE((SELECT updated_at FROM app_settings WHERE settings_key=?),?)) ON CONFLICT(settings_key) DO UPDATE SET payload=excluded.payload");for(const [key,payload] of [["site",config.site],["operations",config.operations],["service_area",config.serviceArea],["ordering_platforms",config.orderingPlatforms],["public_location",config.publicLocation]] as const)upsert.run(key,JSON.stringify(payload),key,new Date().toISOString());}
export function getRuntimeConfig():RuntimeConfig{const rows=sqlite.prepare("SELECT settings_key,payload FROM app_settings").all() as {settings_key:string;payload:string}[];return runtimeConfigFromRows(rows);}
export function saveRuntimeConfig(config:RuntimeConfig){const now=new Date().toISOString(),upsert=sqlite.prepare("INSERT INTO app_settings(settings_key,payload,updated_at) VALUES(?,?,?) ON CONFLICT(settings_key) DO UPDATE SET payload=excluded.payload,updated_at=excluded.updated_at");sqlite.transaction(()=>{for(const [key,payload] of [["site",config.site],["operations",config.operations],["service_area",config.serviceArea],["ordering_platforms",config.orderingPlatforms],["public_location",config.publicLocation]] as const){upsert.run(key,JSON.stringify(payload),now);markDirty("app_setting",key,payload);}})();}
export function listCloudOrders(query=""){const term=`%${query}%`;return sqlite.prepare("SELECT id,order_number,service_date,fulfilment,total,status,created_at,updated_at,json_extract(customer_snapshot,'$.name') customer_name,json_extract(customer_snapshot,'$.phone') phone FROM cloud_orders WHERE ?='' OR order_number LIKE ? OR customer_snapshot LIKE ? ORDER BY created_at DESC LIMIT 500").all(query,term,term);}
export function listCloudOrdersForRange(range:DateRange){return sqlite.prepare("SELECT id,order_number,service_date,fulfilment,total,status,created_at,updated_at,json_extract(customer_snapshot,'$.name') customer_name,json_extract(customer_snapshot,'$.phone') phone FROM cloud_orders WHERE service_date BETWEEN ? AND ? ORDER BY created_at DESC").all(range.from,range.to);}
export function listCloudOrdersCreatedInRange(range:DateRange){return sqlite.prepare("SELECT id,order_number,service_date,fulfilment,total,status,created_at,updated_at,json_extract(customer_snapshot,'$.name') customer_name,json_extract(customer_snapshot,'$.phone') phone FROM cloud_orders WHERE date(created_at,'+5 hours','+30 minutes') BETWEEN ? AND ? ORDER BY created_at DESC LIMIT 500").all(range.from,range.to);}
export function cloudOrderDetail(id:string){const order=sqlite.prepare("SELECT * FROM cloud_orders WHERE id=?").get(id) as any;if(!order)return null;const customer=JSON.parse(order.customer_snapshot),address=JSON.parse(order.address_snapshot);return{...order,customer_snapshot:customer,address_snapshot:address,customer_name:customer.name??"",customer_phone:customer.phone??"",address:address.formattedAddress??address.address??"",lines:(sqlite.prepare("SELECT * FROM cloud_order_lines WHERE order_id=? ORDER BY id").all(id) as any[]).map(normalizeCloudOrderLine),events:(sqlite.prepare("SELECT * FROM cloud_order_events WHERE order_id=? ORDER BY created_at").all(id) as any[]).map((event)=>({...event,payload:JSON.parse(event.payload)}))};}
export function updateCloudOrderStatus(id:string,status:string){sqlite.prepare("UPDATE cloud_orders SET status=?,updated_at=? WHERE id=?").run(status,new Date().toISOString(),id);markDirty("cloud_order_status",id,{status});}

export function dashboard(range:DateRange){
  const revenue=(sqlite.prepare("SELECT COALESCE(SUM(CASE WHEN status='completed' THEN total ELSE 0 END),0) value FROM cloud_orders WHERE service_date BETWEEN ? AND ?").get(range.from,range.to) as any).value;
  const expenses=(sqlite.prepare("SELECT COALESCE(SUM(amount),0) value FROM expenses WHERE date BETWEEN ? AND ?").get(range.from,range.to) as any).value;
  const orders=(sqlite.prepare("SELECT COUNT(*) count,COALESCE(AVG(CASE WHEN status!='cancelled' THEN total END),0) average,COALESCE(SUM(CASE WHEN status NOT IN ('completed','cancelled') THEN total ELSE 0 END),0) outstanding FROM cloud_orders WHERE service_date BETWEEN ? AND ?").get(range.from,range.to) as any);
  return { revenue,expenses,profit:revenue-expenses,orderCount:orders.count,outstanding:orders.outstanding,averageOrder:orders.average,recentOrders:listCloudOrdersCreatedInRange(range).slice(0,6),expenseByCategory:sqlite.prepare("SELECT category,SUM(amount) total FROM expenses WHERE date BETWEEN ? AND ? GROUP BY category ORDER BY total DESC").all(range.from,range.to) };
}
export function getSettings(){ return Object.fromEntries((sqlite.prepare("SELECT key,value FROM settings").all() as {key:string;value:string}[]).map(row=>[row.key,row.value])); }
export function setSettings(values:Record<string,string>){ const upsert=sqlite.prepare("INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value"); sqlite.transaction(()=>Object.entries(values).forEach(([key,value])=>upsert.run(key,value)))(); }
export function listInbox(){ return sqlite.prepare("SELECT * FROM whatsapp_imports ORDER BY received_at DESC").all(); }
export function addInbox(item:{id:string;sender:string;message:string;receivedAt:string;parsedPayload:string|null}){ sqlite.prepare("INSERT OR IGNORE INTO whatsapp_imports(id,meta_message_id,sender,message,parsed_payload,status,received_at) VALUES(?,?,?,?,?,'new',?)").run(item.id,item.id,item.sender,item.message,item.parsedPayload,item.receivedAt); }
export function finishInbox(id:string,orderId:string|null){sqlite.prepare("UPDATE whatsapp_imports SET status=?,order_id=? WHERE meta_message_id=?").run(orderId?"imported":"unmatched",orderId,id);}
export function closeDatabase(){ sqlite?.close(); }
export function rawDatabase(){ return sqlite; }

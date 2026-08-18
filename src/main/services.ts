import { createHash } from "node:crypto";
import { copyFileSync, existsSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import Database from "better-sqlite3";
import { app, dialog, safeStorage } from "electron";
import { dirname, join } from "node:path";
import { parseStructuredOrder } from "../shared/whatsapp";
import type { DateRange, Publication } from "../shared/contracts";
import { resolveDatabaseConnection, type DatabaseConnectionInfo } from "../shared/environment";
import { addInbox, dashboard, finishInbox, getSettings, listExpenses, listUnifiedOrders, rawDatabase, saveOrder, savePublication, setSettings, validatePublicationCatalog } from "./database";

const secretFile = () => `${app.getPath("userData")}/secrets.bin`;
export function saveSecrets(values: Record<string,string>) {if(!safeStorage.isEncryptionAvailable())throw new Error("OS encryption is unavailable.");const path=secretFile(),stamp=new Date().toISOString().replace(/[:.]/g,"-"),temporary=`${path}.new-${process.pid}`,previous=`${path}.replaced-${stamp}`,payload=JSON.stringify(values),encrypted=safeStorage.encryptString(payload);if(safeStorage.decryptString(encrypted)!==payload)throw new Error("Windows could not verify the newly encrypted credentials.");try{writeFileSync(temporary,encrypted);if(safeStorage.decryptString(readFileSync(temporary))!==payload)throw new Error("Windows could not read back the newly encrypted credentials.");if(existsSync(path)){try{safeStorage.decryptString(readFileSync(path))}catch{copyFileSync(path,`${path}.unreadable-${stamp}`)}renameSync(path,previous)}try{renameSync(temporary,path)}catch(error){if(existsSync(previous))renameSync(previous,path);throw error}rmSync(previous,{force:true})}finally{rmSync(temporary,{force:true})}}
function envFile() {
  try {
    const candidates = [join(app.getAppPath(), ".env"), join(process.cwd(), ".env"), join(dirname(app.getPath("exe")), ".env")];
    const path = candidates.find((candidate, index) => candidates.indexOf(candidate) === index && existsSync(candidate));
    const text = path?readFileSync(path, "utf8"):"";
    const fileValues=Object.fromEntries(text.split(/\r?\n/).map((line) => line.trim()).filter((line) => line && !line.startsWith("#") && line.includes("=")).map((line) => {
      const separator = line.indexOf("=");
      const key = line.slice(0, separator).trim();
      const value = line.slice(separator + 1).trim().replace(/^(['"])(.*)\1$/, "$2");
      return [key, value];
    }));
    let managed:Record<string,string>={};try{managed=JSON.parse(readFileSync(join(app.getPath("appData"),"gruhswad-admin-managed-environment.json"),"utf8"))}catch{}
    return {...fileValues,...managed};
  } catch { return {}; }
}
export function portableEnvironment(){const values={...envFile(),...process.env};return Object.fromEntries(["APP_ENV","DATABASE_URL_LOCAL","DATABASE_URL_PROD","DATABASE_URL"].map(key=>[key,values[key]??""]).filter(([,value])=>Boolean(value)))}
function storedSecrets() { try { return JSON.parse(safeStorage.decryptString(readFileSync(secretFile()))) as Record<string,string>; } catch { return {}; } }
export function loadStoredSecrets() { return storedSecrets(); }
export function databaseConnection() { return resolveDatabaseConnection({ processEnv: process.env, fileEnv: envFile(), storedUrl: storedSecrets().neonDatabaseUrl }); }
export function databaseConnectionInfo():DatabaseConnectionInfo { try { const { environment, source, configured } = databaseConnection(); return { environment, source, configured }; } catch (error) { return { environment: "local", source: "none", configured: false, error: error instanceof Error ? error.message : String(error) }; } }
export function loadSecrets():Record<string,string> { const stored=storedSecrets();let neonDatabaseUrl="";try{neonDatabaseUrl=databaseConnection().url;}catch{}return { ...stored, neonDatabaseUrl }; }
export async function importGcsCredentials() {
  const result = await dialog.showOpenDialog({ title: "Import Google Cloud service-account credentials", filters: [{ name: "JSON credentials", extensions: ["json"] }], properties: ["openFile"] });
  if (result.canceled || !result.filePaths[0]) return { canceled: true, configured: Boolean(storedSecrets().gcsServiceAccountJson) };
  let parsed: { project_id?: string; client_email?: string; private_key?: string };
  try { parsed = JSON.parse(readFileSync(result.filePaths[0], "utf8")); } catch { throw new Error("The selected file is not valid JSON."); }
  if (!parsed.project_id || !parsed.client_email || !parsed.private_key) throw new Error("Select a Google Cloud service-account JSON file containing project_id, client_email, and private_key.");
  saveSecrets({ ...storedSecrets(), gcsServiceAccountJson: JSON.stringify(parsed) });
  return { canceled: false, configured: true };
}

export async function publishToGruhswad(payload: Publication) { validatePublicationCatalog(payload); savePublication(payload); }
export async function syncInbox() {
  const settings=getSettings(), secrets=loadSecrets(); if(!settings.webhookUrl||!secrets.inboxToken) throw new Error("Configure webhook URL and inbox token.");
  const response=await fetch(`${settings.webhookUrl.replace(/\/$/,"")}/api/inbox`,{headers:{Authorization:`Bearer ${secrets.inboxToken}`}}); if(!response.ok) throw new Error(`Inbox sync failed (${response.status}).`);
  const body=await response.json() as {items:{id:string;sender:string;message:string;receivedAt:string}[]}; let imported=0,unmatched=0;
  for(const item of body.items){const parsed=parseStructuredOrder(item.message);addInbox({...item,parsedPayload:parsed?JSON.stringify(parsed):null});let orderId:string|null=null;if(parsed){orderId=saveOrder({customer:{name:parsed.customerName,phone:parsed.phone,email:"",archived:false},serviceType:"general",serviceDate:parsed.serviceDate,serviceEndDate:null,serviceStartTime:null,serviceEndTime:null,fulfilment:parsed.fulfilment,address:parsed.address,notes:parsed.notes,source:{id:"whatsapp",name:"WhatsApp"},status:"draft",adjustmentLabel:"",adjustmentAmount:0,enquiryId:null,enquiryReference:null,tiffinPlanId:null,lines:parsed.lines.map(line=>({name:line.name,quantity:line.quantity,unitPrice:line.lineTotal/line.quantity,consumptionMode:"none"}))});finishInbox(item.id,orderId);imported++;}else{finishInbox(item.id,null);unmatched++;}await fetch(`${settings.webhookUrl.replace(/\/$/,"")}/api/inbox/${encodeURIComponent(item.id)}/ack`,{method:"POST",headers:{Authorization:`Bearer ${secrets.inboxToken}`}});}
  return {imported,unmatched};
}
function csv(rows:Record<string,unknown>[]){ if(!rows.length)return ""; const keys=Object.keys(rows[0]); const escape=(value:unknown)=>`"${String(value??"").replaceAll('"','""')}"`; return [keys.map(escape).join(","),...rows.map(row=>keys.map(key=>escape(row[key])).join(","))].join("\n"); }
export async function exportCsv(kind:"orders"|"expenses"|"summary",range:DateRange){ const result=await dialog.showSaveDialog({defaultPath:`gruhswad-${kind}-${range.from}-${range.to}.csv`,filters:[{name:"CSV",extensions:["csv"]}]}); if(result.canceled||!result.filePath)return null; const summary=dashboard(range);const rows=kind==="orders"?listUnifiedOrders({kind:"all",range,search:"",source:""}).map((row)=>({record_type:row.kind,service_type:row.serviceType,reference:row.reference,customer:row.customerName,phone:row.phone,email:row.email,service_date:row.serviceDate,service_end_date:row.serviceEndDate,start_time:row.serviceStartTime,end_time:row.serviceEndTime,fulfilment:row.fulfilment,origin:row.sourceName,status:row.status,items:row.items,billed_value:row.total,receipts:row.paid,refunds:row.refunded,outstanding:row.outstanding,ingredient_cost:row.ingredientCost,payment_status:row.paymentStatus,notes:row.notes,created_at:row.createdAt})):kind==="expenses"?listExpenses(range):[{from:range.from,to:range.to,billed_value:summary.billedValue,receipts:summary.receipts,refunds:summary.refunds,cash_revenue:summary.revenue,expenses:summary.expenses,cash_profit:summary.profit,outstanding:summary.outstanding,ingredient_cost:summary.ingredientCost,operational_margin:summary.operationalMargin,order_count:summary.orderCount,average_order:summary.averageOrder}]; writeFileSync(result.filePath,csv(rows as Record<string,unknown>[])); return result.filePath; }
export async function backupDatabase(){ const result=await dialog.showSaveDialog({defaultPath:`gruhswad-backup-${new Date().toISOString().slice(0,10)}.gswbackup`}); if(result.canceled||!result.filePath)return null; if(!safeStorage.isEncryptionAvailable())throw new Error("OS encryption is unavailable."); rawDatabase().pragma("wal_checkpoint(TRUNCATE)"); const encrypted=safeStorage.encryptString(readFileSync(app.getPath("userData")+"/gruhswad-admin.db").toString("base64")); writeFileSync(result.filePath,encrypted); return result.filePath; }
export async function restoreDatabase(){ const result=await dialog.showOpenDialog({filters:[{name:"Gruhswad backup",extensions:["gswbackup"]}],properties:["openFile"]}); if(result.canceled)return false; const decoded=Buffer.from(safeStorage.decryptString(readFileSync(result.filePaths[0])),"base64"); const target=app.getPath("userData")+"/restore-pending.db"; writeFileSync(target,decoded);let candidate:Database.Database|undefined;try{candidate=new Database(target,{readonly:true});const integrity=(candidate.pragma("integrity_check",{simple:true}) as string)==="ok",schema=candidate.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='schema_migrations'").get();if(!integrity||!schema)throw new Error("The selected file is not a valid Gruhswad backup.");}catch(error){try{candidate?.close();}catch{}throw error;}finally{candidate?.close();}setSettings({restorePending:target,restoreChecksum:createHash("sha256").update(decoded).digest("hex")}); return true; }

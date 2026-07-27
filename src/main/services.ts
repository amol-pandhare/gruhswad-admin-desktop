import { createHash } from "node:crypto";
import { copyFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import Database from "better-sqlite3";
import { app, dialog, safeStorage } from "electron";
import { dirname, join } from "node:path";
import { parseStructuredOrder } from "../shared/whatsapp";
import type { DateRange, Publication } from "../shared/contracts";
import { resolveDatabaseConnection, type DatabaseConnectionInfo } from "../shared/environment";
import { addInbox, dashboard, finishInbox, getSettings, listCloudOrdersForRange, listExpenses, rawDatabase, saveOrder, savePublication, setSettings, validatePublicationCatalog } from "./database";

const secretFile = () => `${app.getPath("userData")}/secrets.bin`;
export function saveSecrets(values: Record<string,string>) { if (!safeStorage.isEncryptionAvailable()) throw new Error("OS encryption is unavailable."); writeFileSync(secretFile(), safeStorage.encryptString(JSON.stringify(values))); }
function envFile() {
  try {
    const candidates = [join(app.getAppPath(), ".env"), join(process.cwd(), ".env"), join(dirname(app.getPath("exe")), ".env")];
    const path = candidates.find((candidate, index) => candidates.indexOf(candidate) === index && existsSync(candidate));
    if (!path) return {};
    const text = readFileSync(path, "utf8");
    return Object.fromEntries(text.split(/\r?\n/).map((line) => line.trim()).filter((line) => line && !line.startsWith("#") && line.includes("=")).map((line) => {
      const separator = line.indexOf("=");
      const key = line.slice(0, separator).trim();
      const value = line.slice(separator + 1).trim().replace(/^(['"])(.*)\1$/, "$2");
      return [key, value];
    }));
  } catch { return {}; }
}
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
  for(const item of body.items){const parsed=parseStructuredOrder(item.message);addInbox({...item,parsedPayload:parsed?JSON.stringify(parsed):null});let orderId:string|null=null;if(parsed){orderId=saveOrder({customerName:parsed.customerName,phone:parsed.phone,serviceDate:parsed.serviceDate,fulfilment:parsed.fulfilment,address:parsed.address,notes:parsed.notes,source:"whatsapp",status:"draft",lines:parsed.lines.map(line=>({name:line.name,quantity:line.quantity,unitPrice:line.lineTotal/line.quantity}))});finishInbox(item.id,orderId);imported++;}else{finishInbox(item.id,null);unmatched++;}await fetch(`${settings.webhookUrl.replace(/\/$/,"")}/api/inbox/${encodeURIComponent(item.id)}/ack`,{method:"POST",headers:{Authorization:`Bearer ${secrets.inboxToken}`}});}
  return {imported,unmatched};
}
function csv(rows:Record<string,unknown>[]){ if(!rows.length)return ""; const keys=Object.keys(rows[0]); const escape=(value:unknown)=>`"${String(value??"").replaceAll('"','""')}"`; return [keys.map(escape).join(","),...rows.map(row=>keys.map(key=>escape(row[key])).join(","))].join("\n"); }
export async function exportCsv(kind:"orders"|"expenses"|"summary",range:DateRange){ const result=await dialog.showSaveDialog({defaultPath:`gruhswad-${kind}-${range.from}-${range.to}.csv`,filters:[{name:"CSV",extensions:["csv"]}]}); if(result.canceled||!result.filePath)return null; const summary=dashboard(range);const rows=kind==="orders"?listCloudOrdersForRange(range):kind==="expenses"?listExpenses(range):[{from:range.from,to:range.to,revenue:summary.revenue,expenses:summary.expenses,profit:summary.profit,orderCount:summary.orderCount,outstanding:summary.outstanding,averageOrder:summary.averageOrder}]; writeFileSync(result.filePath,csv(rows as Record<string,unknown>[])); return result.filePath; }
export async function backupDatabase(){ const result=await dialog.showSaveDialog({defaultPath:`gruhswad-backup-${new Date().toISOString().slice(0,10)}.gswbackup`}); if(result.canceled||!result.filePath)return null; if(!safeStorage.isEncryptionAvailable())throw new Error("OS encryption is unavailable."); rawDatabase().pragma("wal_checkpoint(TRUNCATE)"); const encrypted=safeStorage.encryptString(readFileSync(app.getPath("userData")+"/gruhswad-admin.db").toString("base64")); writeFileSync(result.filePath,encrypted); return result.filePath; }
export async function restoreDatabase(){ const result=await dialog.showOpenDialog({filters:[{name:"Gruhswad backup",extensions:["gswbackup"]}],properties:["openFile"]}); if(result.canceled)return false; const decoded=Buffer.from(safeStorage.decryptString(readFileSync(result.filePaths[0])),"base64"); const target=app.getPath("userData")+"/restore-pending.db"; writeFileSync(target,decoded);let candidate:Database.Database|undefined;try{candidate=new Database(target,{readonly:true});const integrity=(candidate.pragma("integrity_check",{simple:true}) as string)==="ok",schema=candidate.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='schema_migrations'").get();if(!integrity||!schema)throw new Error("The selected file is not a valid Gruhswad backup.");}catch(error){try{candidate?.close();}catch{}throw error;}finally{candidate?.close();}setSettings({restorePending:target,restoreChecksum:createHash("sha256").update(decoded).digest("hex")}); return true; }

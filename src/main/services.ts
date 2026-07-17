import { createHash } from "node:crypto";
import { copyFileSync, readFileSync, writeFileSync } from "node:fs";
import { neon } from "@neondatabase/serverless";
import Database from "better-sqlite3";
import { app, dialog, safeStorage } from "electron";
import { parseStructuredOrder } from "../shared/whatsapp";
import type { DateRange, Publication } from "../shared/contracts";
import { addInbox, finishInbox, getSettings, listExpenses, listOrders, rawDatabase, saveOrder, savePublication, setSettings } from "./database";

const secretFile = () => `${app.getPath("userData")}/secrets.bin`;
export function saveSecrets(values: Record<string,string>) { if (!safeStorage.isEncryptionAvailable()) throw new Error("OS encryption is unavailable."); writeFileSync(secretFile(), safeStorage.encryptString(JSON.stringify(values))); }
export function loadSecrets():Record<string,string> { try { return JSON.parse(safeStorage.decryptString(readFileSync(secretFile()))); } catch { return {}; } }

export async function publishToGruhswad(payload: Publication) {
  const { neonDatabaseUrl } = loadSecrets(); if (!neonDatabaseUrl) throw new Error("Configure the Neon publication URL in Settings.");
  const sql=neon(neonDatabaseUrl); await sql`INSERT INTO menu_publications(publication_key,payload,published_at) VALUES('current',${JSON.stringify(payload)}::jsonb,NOW()) ON CONFLICT(publication_key) DO UPDATE SET payload=EXCLUDED.payload,published_at=NOW()`;
  savePublication(payload);
}
export async function syncInbox() {
  const settings=getSettings(), secrets=loadSecrets(); if(!settings.webhookUrl||!secrets.inboxToken) throw new Error("Configure webhook URL and inbox token.");
  const response=await fetch(`${settings.webhookUrl.replace(/\/$/,"")}/api/inbox`,{headers:{Authorization:`Bearer ${secrets.inboxToken}`}}); if(!response.ok) throw new Error(`Inbox sync failed (${response.status}).`);
  const body=await response.json() as {items:{id:string;sender:string;message:string;receivedAt:string}[]}; let imported=0,unmatched=0;
  for(const item of body.items){const parsed=parseStructuredOrder(item.message);addInbox({...item,parsedPayload:parsed?JSON.stringify(parsed):null});let orderId:string|null=null;if(parsed){orderId=saveOrder({customerName:parsed.customerName,phone:parsed.phone,serviceDate:parsed.serviceDate,fulfilment:parsed.fulfilment,address:parsed.address,notes:parsed.notes,source:"whatsapp",status:"draft",lines:parsed.lines.map(line=>({name:line.name,quantity:line.quantity,unitPrice:line.lineTotal/line.quantity}))});finishInbox(item.id,orderId);imported++;}else{finishInbox(item.id,null);unmatched++;}await fetch(`${settings.webhookUrl.replace(/\/$/,"")}/api/inbox/${encodeURIComponent(item.id)}/ack`,{method:"POST",headers:{Authorization:`Bearer ${secrets.inboxToken}`}});}
  return {imported,unmatched};
}
function csv(rows:Record<string,unknown>[]){ if(!rows.length)return ""; const keys=Object.keys(rows[0]); const escape=(value:unknown)=>`"${String(value??"").replaceAll('"','""')}"`; return [keys.map(escape).join(","),...rows.map(row=>keys.map(key=>escape(row[key])).join(","))].join("\n"); }
export async function exportCsv(kind:"orders"|"expenses"|"summary",range:DateRange){ const result=await dialog.showSaveDialog({defaultPath:`gruhswad-${kind}-${range.from}-${range.to}.csv`,filters:[{name:"CSV",extensions:["csv"]}]}); if(result.canceled||!result.filePath)return null; const rows=kind==="orders"?listOrders(range):kind==="expenses"?listExpenses(range):[getSettings()]; writeFileSync(result.filePath,csv(rows as Record<string,unknown>[])); return result.filePath; }
export async function backupDatabase(){ const result=await dialog.showSaveDialog({defaultPath:`gruhswad-backup-${new Date().toISOString().slice(0,10)}.gswbackup`}); if(result.canceled||!result.filePath)return null; if(!safeStorage.isEncryptionAvailable())throw new Error("OS encryption is unavailable."); rawDatabase().pragma("wal_checkpoint(TRUNCATE)"); const encrypted=safeStorage.encryptString(readFileSync(app.getPath("userData")+"/gruhswad-admin.db").toString("base64")); writeFileSync(result.filePath,encrypted); return result.filePath; }
export async function restoreDatabase(){ const result=await dialog.showOpenDialog({filters:[{name:"Gruhswad backup",extensions:["gswbackup"]}],properties:["openFile"]}); if(result.canceled)return false; const decoded=Buffer.from(safeStorage.decryptString(readFileSync(result.filePaths[0])),"base64"); const target=app.getPath("userData")+"/restore-pending.db"; writeFileSync(target,decoded);let candidate:Database.Database|undefined;try{candidate=new Database(target,{readonly:true});const integrity=(candidate.pragma("integrity_check",{simple:true}) as string)==="ok",schema=candidate.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='schema_migrations'").get();if(!integrity||!schema)throw new Error("The selected file is not a valid Gruhswad backup.");}catch(error){try{candidate?.close();}catch{}throw error;}finally{candidate?.close();}setSettings({restorePending:target,restoreChecksum:createHash("sha256").update(decoded).digest("hex")}); return true; }

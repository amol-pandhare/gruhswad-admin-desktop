import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import { basename } from "node:path";
import { Storage } from "@google-cloud/storage";
import type { MenuImagePublicationStatus, MenuImagePublishResult, MenuType } from "../shared/contracts";
import { getSettings, setSettings } from "./database";
import { loadStoredSecrets } from "./services";

type ExportFile = { path: string; mtimeMs: number; size: number; sha256: string };
type ExportRecord = { type: MenuType; generatedAt: string; serviceDate?: string; files: ExportFile[] };
type Manifest = { type: MenuType; generatedAt: string; publishedAt: string; pageCount: number; pages: { object: string; sha256: string; width: number; height: number }[]; serviceDate?: string };
const key = (type: MenuType) => `latestMenuImageExport:${type}`;
const stem = (type: MenuType) => type === "master" ? "master-menu" : "one-day-menu";
export const menuImageObjectName = (type: MenuType, index: number) => `menus/${stem(type)}${index ? `-${String(index + 1).padStart(2, "0")}` : ""}.png`;
const manifestName = (type: MenuType) => `menus/${stem(type)}.json`;
const hash = (buffer: Buffer) => createHash("sha256").update(buffer).digest("hex");

export function inspectMenuImage(path: string): ExportFile {
  const data = readFileSync(path), stats = statSync(path);
  if (data.length < 24 || data.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a" || data.readUInt32BE(16) !== 1085 || data.readUInt32BE(20) !== 1536) throw new Error(`${basename(path)} is not a valid 1085x1536 PNG.`);
  return { path, mtimeMs: stats.mtimeMs, size: stats.size, sha256: hash(data) };
}

export function recordMenuImageExport(type: MenuType, paths: string[], serviceDate?: string) {
  const record: ExportRecord = { type, generatedAt: new Date().toISOString(), serviceDate, files: paths.map(inspectMenuImage) };
  setSettings({ [key(type)]: JSON.stringify(record) });
  return record;
}

function loadRecord(type: MenuType): ExportRecord | null {
  try { const value = getSettings()[key(type)]; return value ? JSON.parse(value) as ExportRecord : null; } catch { return null; }
}

function verifyRecord(type: MenuType) {
  const record = loadRecord(type);
  if (!record) throw new Error(`Generate and save the ${type === "master" ? "master" : "one-day"} menu images before publishing.`);
  for (const expected of record.files) {
    if (!existsSync(expected.path)) throw new Error(`${basename(expected.path)} is missing. Generate the ${type} menu images again.`);
    const actual = inspectMenuImage(expected.path);
    if (actual.mtimeMs !== expected.mtimeMs || actual.size !== expected.size || actual.sha256 !== expected.sha256) throw new Error(`${basename(expected.path)} changed after generation. Generate the ${type} menu images again.`);
  }
  return record;
}

function credentials() {
  const raw = loadStoredSecrets().gcsServiceAccountJson;
  if (!raw) throw new Error("Import Google Cloud Storage credentials in Settings before publishing.");
  const parsed = JSON.parse(raw) as { project_id?: string; client_email?: string; private_key?: string };
  if (!parsed.project_id || !parsed.client_email || !parsed.private_key) throw new Error("The saved Google Cloud service-account credentials are invalid.");
  return parsed;
}

function bucketName() { return getSettings().gcsBucket || "fb-image-store"; }
function storage() { const value = credentials(); return new Storage({ projectId: value.project_id, credentials: { client_email: value.client_email, private_key: value.private_key } }); }
async function remoteManifest(bucket: ReturnType<Storage["bucket"]>, type: MenuType): Promise<Manifest | null> {
  try { const [data] = await bucket.file(manifestName(type)).download(); return JSON.parse(data.toString("utf8")) as Manifest; }
  catch (error: any) { if (error?.code === 404) return null; throw error; }
}

export async function menuImagePublicationStatus(): Promise<MenuImagePublicationStatus> {
  const configured = Boolean(loadStoredSecrets().gcsServiceAccountJson), bucket = bucketName();
  const local = Object.fromEntries((["master", "one-day"] as MenuType[]).map((type) => { const record = loadRecord(type); let state = record ? "ready" : "missing"; if (record) { try { verifyRecord(type); } catch { state = "modified"; } } return [type, { state, generatedAt: record?.generatedAt ?? null, pageCount: record?.files.length ?? 0, files: record?.files.map((file) => basename(file.path)) ?? [] }]; })) as MenuImagePublicationStatus["local"];
  const cloud: MenuImagePublicationStatus["cloud"] = { master: null, "one-day": null };
  let error: string | null = null;
  if (configured) try { const target = storage().bucket(bucket); for (const type of ["master", "one-day"] as MenuType[]) { const value = await remoteManifest(target, type); cloud[type] = value ? { generatedAt: value.generatedAt, publishedAt: value.publishedAt, pageCount: value.pageCount } : null; const record=loadRecord(type);if(value&&record){if(new Date(value.generatedAt).getTime()>new Date(record.generatedAt).getTime())local[type].state="stale";else if(value.pages.map((page)=>page.sha256).join("|")===record.files.map((file)=>file.sha256).join("|"))local[type].state="published";} } } catch (value) { error = value instanceof Error ? value.message : String(value); }
  const publishable=(state:string)=>state==="ready"||state==="published";
  return { configured, bucket, ready: configured && publishable(local.master.state) && publishable(local["one-day"].state) && !error, local, cloud, error };
}

export async function publishMenuImages(): Promise<MenuImagePublishResult> {
  const records = { master: verifyRecord("master"), "one-day": verifyRecord("one-day") };
  const target = storage().bucket(bucketName()), publishedAt = new Date().toISOString();
  const result: MenuImagePublishResult = { publishedAt, bucket: bucketName(), menus: { master: { action: "uploaded", objects: [] }, "one-day": { action: "uploaded", objects: [] } }, warnings: [] };
  for (const type of ["master", "one-day"] as MenuType[]) {
    const record = records[type], previous = await remoteManifest(target, type);
    if (previous && new Date(previous.generatedAt).getTime() > new Date(record.generatedAt).getTime()) throw new Error(`The cloud ${type} menu is newer than the latest local export. Generate fresh images before publishing.`);
    if (previous && previous.pages.map((page) => page.sha256).join("|") === record.files.map((file) => file.sha256).join("|")) { result.menus[type] = { action: "unchanged", objects: previous.pages.map((page) => page.object) }; continue; }
    const pages = record.files.map((file, index) => ({ object: menuImageObjectName(type, index), sha256: file.sha256, width: 1085, height: 1536 }));
    for (let index = 0; index < record.files.length; index++) await target.upload(record.files[index].path, { destination: pages[index].object, metadata: { contentType: "image/png", cacheControl: "no-cache, max-age=0, must-revalidate", metadata: { generatedAt: record.generatedAt, sha256: record.files[index].sha256 } } });
    const manifest: Manifest = { type, generatedAt: record.generatedAt, publishedAt, pageCount: pages.length, pages, ...(record.serviceDate ? { serviceDate: record.serviceDate } : {}) };
    await target.file(manifestName(type)).save(JSON.stringify(manifest, null, 2), { contentType: "application/json", metadata: { cacheControl: "no-cache, max-age=0, must-revalidate" } });
    for (const old of previous?.pages ?? []) if (!pages.some((page) => page.object === old.object) && /^menus\/(master-menu|one-day-menu)-\d{2}\.png$/.test(old.object)) await target.file(old.object).delete({ ignoreNotFound: true });
    result.menus[type] = { action: "uploaded", objects: pages.map((page) => page.object) };
  }
  return result;
}

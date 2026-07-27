import { app, dialog } from "electron";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import type { CatalogCategory, CatalogItem, MenuImageExportResult, Publication } from "../shared/contracts";
import { isPublishableItem } from "../shared/catalog";
import { getCatalog, getCurrentPublication } from "./database";
import { renderHtmlImagesToPaths } from "./image-renderer";
import { recordMenuImageExport } from "./menu-publishing";

type Group = { category: CatalogCategory; items: CatalogItem[]; continuation?: boolean };
type TemplateInput = { mode: "master" | "one-day"; categories: CatalogCategory[]; items: CatalogItem[]; publication?: Publication | null; templateUrl: string };
export type TemplateMenuImageDocument = { pages: string[]; omittedItemCount: number };

const escapeHtml = (value: unknown) => String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]!);
const money = (value: number) => Number.isInteger(value) ? String(value) : value.toFixed(2);
function serviceDate(value: string) { const [year, month, day] = value.split("-").map(Number); return new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Kolkata" }).format(new Date(Date.UTC(year, month - 1, day))); }

function paginate(groups: Group[], capacity: number) {
  const pages: Group[][] = [[]]; let used = 0;
  for (const group of groups) {
    let offset = 0;
    while (offset < group.items.length) {
      if (used + 3 > capacity && pages[pages.length - 1].length) { pages.push([]); used = 0; }
      const take = Math.min(group.items.length - offset, Math.max(1, capacity - used - 3));
      pages[pages.length - 1].push({ category: group.category, items: group.items.slice(offset, offset + take), continuation: offset > 0 });
      used += take + 3; offset += take;
      if (offset < group.items.length) { pages.push([]); used = 0; }
    }
  }
  return pages;
}

function columns(groups: Group[], count: number) {
  const result = Array.from({ length: count }, () => [] as Group[]), weights = Array(count).fill(0);
  for (const group of groups) { const target = weights.indexOf(Math.min(...weights)); result[target].push(group); weights[target] += group.items.length + 3; }
  return result;
}

function groupHtml(group: Group) {
  return `<section class="menu-group"><h2>${escapeHtml(group.category.name)}${group.continuation ? " <small>(continued)</small>" : ""}</h2>${group.items.map((item) => `<div class="menu-item"><span><b>${escapeHtml(item.name)}</b>${item.portion ? `<small>${escapeHtml(item.portion)}</small>` : ""}</span><i></i><strong>&#8377;${money(item.price)}</strong></div>`).join("")}</section>`;
}

export function buildTemplateMenuImageDocument(input: TemplateInput): TemplateMenuImageDocument {
  const activeCategories = input.categories.filter((category) => category.active).sort((a, b) => a.order - b.order);
  let printable: CatalogItem[], omittedItemCount = 0, title = "MASTER MENU", subtitle = "Complete homestyle vegetarian selection", featured: CatalogItem | null = null;
  if (input.mode === "one-day") {
    if (!input.publication) throw new Error("Save a one-day menu before exporting its images.");
    const itemMap = new Map(input.items.map((item) => [item.id, item]));
    printable = input.publication.itemIds.map((id) => itemMap.get(id)).filter((item): item is CatalogItem => Boolean(item && isPublishableItem(item, input.categories)));
    omittedItemCount = input.publication.itemIds.length - printable.length;
    title = input.publication.title; subtitle = serviceDate(input.publication.date);
    featured = input.publication.featuredItemId ? printable.find((item) => item.id === input.publication!.featuredItemId) ?? null : null;
  } else printable = input.items.filter((item) => isPublishableItem(item, input.categories)).sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
  if (!printable.length) throw new Error(input.mode === "one-day" ? "The saved one-day menu has no printable items." : "The catalog has no printable categories or items.");
  const order = new Map(input.mode === "one-day" ? input.publication!.itemIds.map((id, index) => [id, index]) : []);
  const groups = activeCategories.map((category) => ({ category, items: printable.filter((item) => item.categoryId === category.id).sort((a, b) => input.mode === "one-day" ? (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0) : a.order - b.order || a.name.localeCompare(b.name)) })).filter((group) => group.items.length);
  const columnCount = input.mode === "master" ? 3 : 2;
  const pages = paginate(groups, input.mode === "master" ? 54 : featured ? 28 : 38);
  const htmlPages = pages.map((page, index) => {
    const special = index === 0 && featured ? `<section class="special"><span>&#9733; TODAY'S SPECIAL &#9733;</span><b>${escapeHtml(featured.name)}</b>${featured.portion ? `<small>${escapeHtml(featured.portion)}</small>` : ""}<strong>&#8377;${money(featured.price)}</strong></section>` : "";
    const pageTitle = index ? `${title} - CONTINUED` : title;
    const pageColumns = columns(page, columnCount).map((column) => `<div>${column.map(groupHtml).join("")}</div>`).join("");
    return `<!doctype html><html><head><meta charset="UTF-8"><style>*{box-sizing:border-box}html,body{width:1085px;height:1536px;margin:0;overflow:hidden}body{position:relative;background:#fdf2e4 url('${escapeHtml(input.templateUrl)}') center/1085px 1536px no-repeat;color:#29170f;font-family:Georgia,'Times New Roman',serif}.content{position:absolute;left:68px;right:68px;top:445px;height:742px;padding:0 8px}.title{text-align:center}.title h1{margin:0;color:#681f13;font-size:${input.mode === "master" ? 35 : 38}px;letter-spacing:2px}.title p{margin:5px 0 13px;color:#27513a;font-size:18px;font-style:italic}.special{display:grid;grid-template-columns:auto 1fr auto;align-items:center;gap:12px;margin:0 auto 16px;padding:10px 18px;border:2px solid #c79737;border-radius:12px;background:#6d2118;color:#fff8e8}.special span{color:#f2c45c;font-size:14px;font-weight:bold}.special b{font-size:23px;text-align:center}.special small{display:none}.special strong{padding:5px 12px;border-radius:20px;background:#fff1d1;color:#6d2118;font-size:19px}.columns{display:grid;grid-template-columns:repeat(${columnCount},minmax(0,1fr));gap:18px}.columns>div+div{padding-left:18px;border-left:1px dotted #b48035}.menu-group{margin-bottom:13px;break-inside:avoid}.menu-group h2{margin:0 0 7px;padding-bottom:4px;border-bottom:2px solid #c99b4d;color:#17452f;font-size:${input.mode === "master" ? 19 : 22}px;text-transform:uppercase}.menu-group h2 small{font-size:11px}.menu-item{display:flex;align-items:baseline;gap:6px;min-height:${input.mode === "master" ? 25 : 29}px;font-family:Arial,sans-serif;font-size:${input.mode === "master" ? 15 : 17}px}.menu-item>span{min-width:0}.menu-item b{font-weight:600}.menu-item small{display:block;color:#765a45;font-size:${input.mode === "master" ? 11 : 12}px}.menu-item i{min-width:8px;flex:1;border-bottom:1px dotted #816b58}.menu-item strong{white-space:nowrap;color:#8a281a;font-size:${input.mode === "master" ? 14 : 16}px}.page-number{position:absolute;right:75px;top:1164px;color:#876b4e;font:13px Arial}</style></head><body><main class="content"><header class="title"><h1>${escapeHtml(pageTitle)}</h1><p>${escapeHtml(subtitle)}</p></header>${special}<div class="columns">${pageColumns}</div></main>${pages.length > 1 ? `<div class="page-number">${index + 1} of ${pages.length}</div>` : ""}</body></html>`;
  });
  return { pages: htmlPages, omittedItemCount };
}

function templateUrl() { const path = join(__dirname, "../renderer/catalog", "MASTER-002_Template.png"); if (!existsSync(path)) throw new Error("The packaged menu image template is missing."); return pathToFileURL(path).href; }
async function exportImages(mode: "master" | "one-day") {
  const catalog = getCatalog(), publication = mode === "one-day" ? getCurrentPublication() : null;
  const document = buildTemplateMenuImageDocument({ mode, categories: catalog.categories as CatalogCategory[], items: catalog.items, publication, templateUrl: templateUrl() });
  const date = mode === "one-day" ? publication!.date : new Date().toISOString().slice(0, 10);
  const target = await dialog.showSaveDialog({ title: mode === "master" ? "Export Gruhswad master menu images" : "Export Gruhswad one-day menu images", defaultPath: `gruhswad-${mode === "master" ? "master" : "one-day"}-menu-${date}.png`, filters: [{ name: "PNG image", extensions: ["png"] }] });
  if (target.canceled || !target.filePath) return { canceled: true, paths: [], imageCount: 0, warning: null } satisfies MenuImageExportResult;
  const messages: string[] = [];
  if (document.omittedItemCount) messages.push(`${document.omittedItemCount} stale or unavailable item${document.omittedItemCount === 1 ? " was" : "s were"} omitted.`);
  if (document.pages.length > 1) messages.push(`The menu required ${document.pages.length} images to remain readable.`);
  const result = await renderHtmlImagesToPaths({ pages: document.pages, basePath: target.filePath, warning: messages.join(" ") || null });
  recordMenuImageExport(mode, result.paths, mode === "one-day" ? publication!.date : undefined);
  return result;
}

export const exportMasterMenuImages = () => exportImages("master");
export const exportOneDayMenuImages = () => exportImages("one-day");

async function previewImages(mode: "master" | "one-day") {
  const catalog = getCatalog(), publication = mode === "one-day" ? getCurrentPublication() : null;
  const document = buildTemplateMenuImageDocument({ mode, categories: catalog.categories as CatalogCategory[], items: catalog.items, publication, templateUrl: templateUrl() });
  const messages: string[] = [];
  if (document.omittedItemCount) messages.push(`${document.omittedItemCount} stale or unavailable item${document.omittedItemCount === 1 ? " was" : "s were"} omitted.`);
  if (document.pages.length > 1) messages.push(`The menu required ${document.pages.length} preview images to remain readable.`);
  const basePath = join(app.getPath("temp"), `gruhswad-${mode}-preview-${Date.now()}.png`);
  return renderHtmlImagesToPaths({ pages: document.pages, basePath, warning: messages.join(" ") || null, temporary: true });
}

export const previewMasterMenuImages = () => previewImages("master");
export const previewOneDayMenuImages = () => previewImages("one-day");

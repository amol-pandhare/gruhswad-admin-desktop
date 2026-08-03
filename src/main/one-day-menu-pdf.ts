import { dialog } from "electron";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import QRCode from "qrcode";
import type { CatalogCategory, CatalogItem, MenuPdfExportResult, Publication, RuntimeConfig } from "../shared/contracts";
import { isPublishableItem } from "../shared/catalog";
import { tomorrowInIndia, weeklyWindow } from "../shared/dates";
import { getCatalog, getCurrentPublication, getRuntimeConfig } from "./database";
import { renderHtmlPdfToPath } from "./pdf-renderer";

type MenuGroup = { category: CatalogCategory; items: CatalogItem[]; continuation?: boolean };
export type OneDayMenuPdfInput = { publication: Publication; categories: CatalogCategory[]; items: CatalogItem[]; config: RuntimeConfig; qrDataUrl: string; logoUrl?: string; now?: Date };
export type OneDayMenuPdfDocument = { html: string; omittedItemCount: number; pageCount: number };

const escapeHtml = (value: unknown) => String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]!);
const money = (value: number) => Number.isInteger(value) ? String(value) : value.toFixed(2);
const printableMobile = (value: string) => value.replace(/\D/g, "").slice(-10);
function formatServiceDate(value: string) { const [year, month, day] = value.split("-").map(Number); return new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Kolkata" }).format(new Date(Date.UTC(year, month - 1, day))); }

function paginate(groups: MenuGroup[], firstCapacity: number, continuationCapacity = 60) {
  const pages: MenuGroup[][] = [[]]; let capacity = firstCapacity; let used = 0;
  for (const group of groups) {
    let offset = 0;
    while (offset < group.items.length) {
      const remaining = capacity - used;
      const headerCost = 2;
      if (remaining <= headerCost && pages[pages.length - 1].length) { pages.push([]); capacity = continuationCapacity; used = 0; continue; }
      const take = Math.min(group.items.length - offset, Math.max(1, capacity - used - headerCost));
      pages[pages.length - 1].push({ category: group.category, items: group.items.slice(offset, offset + take), continuation: offset > 0 });
      used += take + headerCost; offset += take;
      if (offset < group.items.length) { pages.push([]); capacity = continuationCapacity; used = 0; }
    }
  }
  return pages;
}

function groupMarkup(group: MenuGroup) {
  return `<section class="menu-group"><h2><span>${escapeHtml(group.category.name)}${group.continuation ? " (continued)" : ""}</span><i></i></h2><div class="group-items">${group.items.map((item) => `<div class="menu-line"><b>&bull;</b><span>${escapeHtml(item.name)}${item.portion ? ` <small>(${escapeHtml(item.portion)})</small>` : ""}</span><i></i><strong>&#8377; ${money(item.price)}</strong></div>`).join("")}</div></section>`;
}

export function buildOneDayMenuPdfDocument(input: OneDayMenuPdfInput): OneDayMenuPdfDocument {
  const itemMap = new Map(input.items.map((item) => [item.id, item]));
  const printable = input.publication.itemIds.map((id) => itemMap.get(id)).filter((item): item is CatalogItem => Boolean(item && isPublishableItem(item, input.categories)));
  const omittedItemCount = input.publication.itemIds.length - printable.length;
  if (!printable.length) throw new Error("The saved one-day menu has no printable items.");
  const order = new Map(input.publication.itemIds.map((id, index) => [id, index]));
  const groups = input.categories.filter((category) => category.active).sort((a, b) => a.order - b.order).map((category) => ({ category, items: printable.filter((item) => item.categoryId === category.id).sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0)) })).filter((group) => group.items.length);
  const featured = input.publication.featuredItemId ? printable.find((item) => item.id === input.publication.featuredItemId) ?? null : null;
  const pages = paginate(groups, featured ? 24 : 32);
  const mobile = printableMobile(input.config.site.mobile);
  const title = escapeHtml(input.publication.title);
  const dates=weeklyWindow(input.now);
  const serviceDate = escapeHtml(input.publication.mode==="weekly"?`${formatServiceDate(dates[0])} - ${formatServiceDate(dates[6])}`:formatServiceDate(tomorrowInIndia(input.now)));
  const cutoff = escapeHtml(input.publication.orderCutoff || input.config.site.orderCutoff);
  const brand = escapeHtml(input.config.site.brandName || "Gruhswad");
  const tagline = escapeHtml(input.config.site.tagline || "Taste of Home");
  const logo = input.logoUrl ? `<img class="logo" src="${escapeHtml(input.logoUrl)}" alt="${brand}"/>` : `<div class="wordmark">${brand}</div><div class="tagline">${tagline}</div>`;
  const pageMarkup = pages.map((page, index) => {
    const first = index === 0;
    const special = first && featured ? `<section class="special"><small>&#9733; TODAY'S SPECIAL &#9733;</small><h1>${escapeHtml(featured.name)}</h1>${featured.portion ? `<p>${escapeHtml(featured.portion)}</p>` : ""}<strong>&#8377;${money(featured.price)}</strong></section>` : "";
    const header = first ? `<header class="hero"><div class="veg-seal"><b>100%</b><span>VEGETARIAN</span><em>&#10086;</em></div>${logo}<div class="preorder-ribbon"><b>PRE-ORDERS<br/>ONLY</b><span>Order by<br/><strong>${cutoff}</strong></span></div></header><div class="title-banner"><span>&#10087;</span><h1>${title}</h1><span>&#10086;</span></div><div class="service-date">For ${serviceDate} &bull; Freshly Prepared &bull; Homemade &bull; Hygienic</div>${special}` : `<header class="continuation-header">${logo}<div><b>${title}</b><span>${serviceDate}</span></div></header>`;
    const menuContent = first ? `<main class="menu-layout"><div class="top-groups">${page.slice(0,2).map(groupMarkup).join("")}</div>${page.length>2?`<div class="compact-groups">${page.slice(2).map(groupMarkup).join("")}</div>`:""}</main>` : `<main class="menu-columns">${page.map(groupMarkup).join("")}</main>`;
    const footer = first ? `<div class="also-offer"><b>WE ALSO OFFER</b><span><i>&#9832;</i>TIFFIN SERVICE</span><span><i>&#9829;</i>PARTY ORDERS</span><span><i>&#9633;</i>BULK ORDERS</span></div><footer class="order-footer"><div class="whatsapp"><i>&#9742;</i><span><b>WHATSAPP ORDERS</b><strong>${mobile}</strong></span></div><div class="cutoff"><small>ORDER BEFORE</small><b>${cutoff}</b></div><div class="qr"><img src="${escapeHtml(input.qrDataUrl)}" alt="WhatsApp QR code"/><span>Scan to order<br/>on WhatsApp</span></div></footer><div class="values"><span>&#9829; Homemade with love</span><span>&#10086; Fresh ingredients</span><span>&#10003; Hygienic preparation</span><span>&#9737; Made to order</span></div>` : `<footer class="continuation-footer"><b>WhatsApp ${mobile}</b><span>${cutoff}</span></footer>`;
    return `<section class="page ${first ? "first" : "continuation"}">${header}${menuContent}${footer}<div class="page-number">${index + 1} / ${pages.length}</div></section>`;
  }).join("");
  const html = `<!doctype html><html><head><meta charset="UTF-8"><style>
@page{size:A4 portrait;margin:0}*{box-sizing:border-box}html,body{margin:0;padding:0}body{background:#ddd;color:#29150f;font-family:Georgia,'Times New Roman',serif}.page{position:relative;width:210mm;height:297mm;padding:7mm 10mm 8mm;overflow:hidden;page-break-after:always;background:#fff7e7;background-image:radial-gradient(#8b5c2410 .35mm,transparent .45mm);background-size:3mm 3mm}.page:last-child{page-break-after:auto}.page:before,.page:after{content:'';position:absolute;pointer-events:none}.page:before{inset:3mm;border:.45mm solid #9a6a22}.page:after{inset:5mm;border:.18mm solid #c69546}.hero{height:54mm;display:grid;grid-template-columns:27mm 1fr 36mm;align-items:center;gap:4mm}.logo{display:block;width:100%;height:49mm;object-fit:cover;object-position:center 34%;mix-blend-mode:multiply}.wordmark{text-align:center;color:#4b160e;font:italic 25pt Georgia}.tagline{text-align:center;color:#173a27;font-size:8pt;letter-spacing:.2em;text-transform:uppercase}.veg-seal{display:grid;width:25mm;height:25mm;place-content:center;text-align:center;border:1mm double #173a27;border-radius:50%;color:#173a27}.veg-seal b{font-size:12pt}.veg-seal span{font-size:5pt;font-weight:bold}.veg-seal em{font-size:12pt}.preorder-ribbon{align-self:start;display:grid;min-height:50mm;align-content:center;gap:4mm;padding:4mm 2mm 8mm;text-align:center;background:#7f1d18;color:#fff;clip-path:polygon(0 0,100% 0,100% 86%,50% 100%,0 86%);box-shadow:inset 0 0 0 .35mm #d2a347}.preorder-ribbon b{font-size:9pt;line-height:1.4}.preorder-ribbon span{font-size:7pt;line-height:1.45}.preorder-ribbon strong{color:#ffd05a}.title-banner{height:18mm;display:flex;align-items:center;justify-content:center;gap:5mm;margin:0 12mm;background:#173a27;color:#fff4df;clip-path:polygon(3% 0,97% 0,100% 50%,97% 100%,3% 100%,0 50%);box-shadow:inset 0 0 0 .5mm #c89539}.title-banner h1{margin:0;font-size:22pt;letter-spacing:.04em;text-transform:uppercase}.title-banner span{color:#d1a23d;font-size:14pt}.service-date{text-align:center;margin:2mm 0 3mm;color:#4d2c1d;font-size:7.5pt;font-style:italic}.special{width:68%;margin:0 auto 4mm;padding:3mm;text-align:center;border:.5mm solid #c9983c;border-radius:4mm;background:#841f19;color:#fff7e5;box-shadow:inset 0 0 0 .5mm #841f19,inset 0 0 0 .8mm #e2b95c}.special small{color:#ffd263;font-size:7pt}.special h1{margin:1.2mm 0 0;font-size:18pt;text-transform:uppercase}.special p{margin:.6mm 0;font-size:6.5pt}.special strong{display:inline-block;padding:1mm 5mm;border-radius:5mm;background:#fff1cf;color:#7b1d18;font-size:13pt}.menu-columns{column-count:2;column-gap:8mm;column-rule:.25mm dotted #bd7c26}.menu-group{break-inside:avoid;margin:0 0 3mm}.menu-group h2{display:flex;align-items:center;gap:2mm;margin:0 0 1.5mm;color:#7b1d18;font-size:9pt}.menu-group h2 i{flex:1;border-top:.25mm solid #49604b}.menu-line{display:flex;align-items:baseline;gap:1.5mm;min-height:5.2mm;font-size:7.5pt}.menu-line>b{color:#8b1d18}.menu-line>span{max-width:64%}.menu-line small{font-size:6pt}.menu-line>i{flex:1;border-bottom:.25mm dotted #4b4b3e}.menu-line strong{white-space:nowrap}.also-offer{position:absolute;left:16mm;right:16mm;bottom:47mm;height:20mm;display:grid;grid-template-columns:repeat(3,1fr);align-items:center;text-align:center;border:.3mm solid #b48135;border-radius:3mm;background:#fffaf0;color:#173a27;font-size:8pt}.also-offer>b{position:absolute;top:-4mm;left:50%;transform:translateX(-50%);padding:1.5mm 8mm;background:#7b1d18;color:#fff;clip-path:polygon(7% 0,93% 0,100% 50%,93% 100%,7% 100%,0 50%)}.order-footer{position:absolute;left:14mm;right:14mm;bottom:20mm;height:23mm;display:grid;grid-template-columns:1.15fr 1fr 1fr;overflow:hidden;border:.4mm solid #173a27;border-radius:5mm;background:#fff3d5}.order-footer>div{display:grid;align-content:center;padding:2mm 4mm}.whatsapp{background:#173a27;color:#fff}.whatsapp b{font-size:6pt}.whatsapp strong{font-size:14pt}.cutoff{text-align:center;border-right:.25mm dotted #a16624}.cutoff small{font-size:5.5pt}.cutoff b{color:#8b1d18;font-size:8pt}.qr{grid-template-columns:16mm 1fr!important;align-items:center;gap:2mm}.qr img{width:15mm;height:15mm}.qr span{font-size:6.5pt;font-style:italic}.values{position:absolute;left:14mm;right:14mm;bottom:10mm;display:flex;justify-content:space-between;font-size:5.7pt;font-style:italic}.continuation-header{height:34mm;display:grid;grid-template-columns:60mm 1fr;align-items:center;border-bottom:.5mm double #9a6a22}.continuation-header .logo{height:30mm}.continuation-header>div{display:grid;text-align:right}.continuation-header b{color:#7b1d18;font-size:16pt;text-transform:uppercase}.continuation-header span{font-size:8pt}.continuation .menu-columns{margin-top:5mm}.continuation-footer{position:absolute;left:10mm;right:10mm;bottom:9mm;display:flex;justify-content:space-between;padding:2mm 5mm;background:#173a27;color:#fff;font-size:7pt}.page-number{position:absolute;right:6mm;bottom:4mm;color:#9b744b;font:5.5pt Arial}
.first .hero{height:65mm;grid-template-columns:30mm 1fr 38mm}.first .logo{height:61mm;object-position:center 34%}.first .veg-seal{width:28mm;height:28mm}.first .preorder-ribbon{min-height:61mm;padding-bottom:11mm}.first .title-banner{height:22mm;margin:0 8mm}.first .title-banner h1{font-size:27pt}.first .service-date{margin:2mm 0 3mm;font-size:8.5pt}.first .special{display:grid;min-height:36mm;place-content:center;width:72%;margin-bottom:4mm;padding:3mm 8mm}.first .special small{font-size:8pt}.first .special h1{font-size:21pt}.first .special strong{font-size:15pt}.menu-layout{position:relative;z-index:1}.top-groups{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8mm;border-top:.3mm dotted #bd7c26;padding-top:3mm}.top-groups>.menu-group+ .menu-group{border-left:.25mm dotted #bd7c26;padding-left:7mm}.top-groups .menu-group h2{font-size:10.5pt;margin-bottom:2mm}.top-groups .menu-line{min-height:6.2mm;font-size:8.3pt}.top-groups .menu-line small{font-size:6.5pt}.compact-groups{display:grid;margin-top:2mm;border-top:.3mm dotted #bd7c26}.compact-groups .menu-group{display:grid;grid-template-columns:48mm 1fr;gap:4mm;align-items:start;margin:0;padding:3mm;border-bottom:.3mm dotted #bd7c26}.compact-groups .menu-group h2{margin:0;font-size:10pt}.compact-groups .menu-group h2 i{display:none}.compact-groups .menu-line{min-height:6mm;font-size:8.2pt}.first .also-offer{left:16mm;right:16mm;bottom:51mm;height:25mm;font-size:9pt}.first .also-offer>b{top:-4.5mm;font-size:8pt}.first .also-offer span{font-weight:bold;font-size:9pt}.first .also-offer span i{display:block;margin-bottom:1mm;color:#173a27;font-size:18pt;font-style:normal}.first .order-footer{left:14mm;right:14mm;bottom:18mm;height:29mm;grid-template-columns:1.2fr 1fr 1fr}.first .whatsapp{grid-template-columns:15mm 1fr;align-items:center}.first .whatsapp>i{font-size:21pt;font-style:normal}.first .whatsapp>span{display:grid}.first .whatsapp b{font-size:7pt}.first .whatsapp strong{font-size:17pt}.first .cutoff small{font-size:6.5pt}.first .cutoff b{font-size:9pt}.first .qr{grid-template-columns:20mm 1fr!important}.first .qr img{width:19mm;height:19mm}.first .qr span{font-size:7pt}.first .values{bottom:8mm;font-size:6.2pt}.continuation .group-items{display:block}
</style></head><body>${pageMarkup}</body></html>`;
  return { html, omittedItemCount, pageCount: pages.length };
}

function assetUrl(name: string) { const path = join(__dirname, "../renderer/catalog", name); return existsSync(path) ? pathToFileURL(path).href : ""; }

export async function exportOneDayMenuPdf(): Promise<MenuPdfExportResult> {
  const publication = getCurrentPublication();
  if (!publication) throw new Error("Save a one-day menu before exporting its PDF.");
  const catalog = getCatalog(); const config = getRuntimeConfig(); const mobile = printableMobile(config.site.mobile);
  const qrDataUrl = await QRCode.toDataURL(`https://wa.me/91${mobile}`, { width: 240, margin: 1, color: { dark: "#173a27", light: "#fff7e7" } });
  const document = buildOneDayMenuPdfDocument({ publication, categories: catalog.categories as CatalogCategory[], items: catalog.items, config, qrDataUrl, logoUrl: assetUrl("gruhswad-menu-logo.png") });
  const label=publication.mode==="weekly"?"weekly":"one-day"; const target = await dialog.showSaveDialog({ title: `Export Gruhswad ${label} menu`, defaultPath: `gruhswad-${label}-menu-${tomorrowInIndia()}.pdf`, filters: [{ name: "PDF", extensions: ["pdf"] }] });
  if (target.canceled || !target.filePath) return { canceled: true, path: null, pageCount: 0, warning: null };
  return renderHtmlPdfToPath({ html: document.html, outputPath: target.filePath, tempPrefix: "gruhswad-one-day-menu", warning: (pageCount) => { const messages=[]; if(document.omittedItemCount)messages.push(`${document.omittedItemCount} stale or unavailable item${document.omittedItemCount===1?" was":"s were"} omitted.`); if(pageCount>1)messages.push(`The menu required ${pageCount} pages to remain readable.`); return messages.join(" ")||null; } });
}

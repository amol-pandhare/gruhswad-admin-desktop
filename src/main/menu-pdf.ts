import { dialog } from "electron";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { getCatalog, getRuntimeConfig } from "./database";
import type { CatalogItem, MenuPdfExportResult } from "../shared/contracts";
import { renderHtmlPdfToPath } from "./pdf-renderer";

type Category = { id: string; name: string; order: number; active?: boolean | number };

const placeholder = "food-placeholder.jpeg";
const defaultMobile = "8123415647";
const categoryFallbacks: Record<string, string> = {
  chaat: "1000128453.jpg",
  starters: "1000128873.jpg",
  sabudana: "1000128471.jpg",
  breads: "1000128477.jpg",
  "paneer-curries": "1000128474.jpg",
  "veg-curries": "1000128483.jpg",
  "dal-rice": "1000128480.jpg",
  "khichdi-desserts": "1000128465.jpg",
  combos: "1000128468.jpg",
  thalis: "1000128873.jpg",
};
const recommendationIds = ["pav-bhaji", "paneer-butter-masala", "dahi-bhalla-vada", "sabudana-khichadi"];

const escapeHtml = (value: unknown) => String(value ?? "").replace(/[&<>"']/g, (character) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
}[character]!));

function assetsDir() { return join(__dirname, "../renderer/catalog"); }
function assetUrl(file?: string | null) {
  const candidate = file && !file.startsWith("http") ? file : placeholder;
  for (const name of [candidate, placeholder]) {
    const path = join(assetsDir(), name);
    if (existsSync(path)) return pathToFileURL(path).href;
  }
  return "";
}
function printableMobile(value?: string | null) {
  const digits = String(value ?? "").replace(/\D/g, "");
  return digits.length >= 10 ? digits.slice(-10) : defaultMobile;
}
function categoryImage(category: Category, items: CatalogItem[]) {
  const proper = items.find((item) => item.categoryId === category.id && item.image && item.image !== placeholder && !item.image.startsWith("http"));
  return assetUrl(proper?.image ?? categoryFallbacks[category.id] ?? placeholder);
}
function recommendations(items: CatalogItem[]) {
  const selected = recommendationIds
    .map((id) => items.find((item) => item.id === id && !item.archived))
    .filter(Boolean) as CatalogItem[];
  const fallback = items.filter((item) => !item.archived && item.image && item.image !== placeholder && !selected.some((chosen) => chosen.id === item.id));
  return [...selected, ...fallback].slice(0, 4);
}
function distribute(categories: Category[], items: CatalogItem[]) {
  const columns: [Category[], Category[], Category[]] = [[], [], []];
  const weights = [0, 0, 0];
  for (const category of categories) {
    const weight = 6 + items.filter((item) => item.categoryId === category.id).length;
    const target = weights.indexOf(Math.min(...weights));
    columns[target].push(category);
    weights[target] += weight;
  }
  return columns;
}
function partition(categories: Category[], items: CatalogItem[]) {
  const firstPage: Category[] = [];
  let firstWeight = 0;
  for (const category of categories) {
    const next = 6 + items.filter((item) => item.categoryId === category.id).length;
    if (firstPage.length >= 3 && firstWeight + next > 76) break;
    firstPage.push(category);
    firstWeight += next;
  }
  const pages: Category[][] = [firstPage];
  let current: Category[] = [];
  let weight = 0;
  for (const category of categories.slice(firstPage.length)) {
    const next = 6 + items.filter((item) => item.categoryId === category.id).length;
    if (current.length && weight + next > 82) {
      pages.push(current);
      current = [];
      weight = 0;
    }
    current.push(category);
    weight += next;
  }
  if (current.length) pages.push(current);
  if (pages.length === 1) pages.push([]);
  return pages;
}
function categoryCard(category: Category, items: CatalogItem[]) {
  const rows = items.filter((item) => item.categoryId === category.id).sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
  return `<article class="category-card">
    <img src="${categoryImage(category, items)}" alt="" />
    <header><h2>${escapeHtml(category.name)}</h2><span>100% VEG</span></header>
    <div class="items">${rows.map((item) => `<div><span>${escapeHtml(item.name)}${item.portion ? ` <small>${escapeHtml(item.portion)}</small>` : ""}</span><b>&#8377; ${item.price}</b></div>`).join("")}</div>
  </article>`;
}
function categoryGrid(categories: Category[], items: CatalogItem[]) {
  return `<div class="category-columns">${distribute(categories, items).map((column) => `<div>${column.map((category) => categoryCard(category, items)).join("")}</div>`).join("")}</div>`;
}

export function buildMenuPdfHtml() {
  const catalog = getCatalog();
  const config = getRuntimeConfig();
  const items = catalog.items.filter((item) => !item.archived && item.available && item.webCompatible).sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
  const categories = (catalog.categories as Category[])
    .filter((category) => category.active !== false && category.active !== 0 && items.some((item) => item.categoryId === category.id))
    .sort((a, b) => a.order - b.order);
  if (!categories.length || !items.length) throw new Error("The catalog has no printable categories or items.");

  const pages = partition(categories, items);
  const featured = recommendations(items);
  const referenceHeader = assetUrl("master-menu-header-source.png");
  const tiffinPhoto = assetUrl("1000128465.jpg");
  const mobile = printableMobile(config.site?.mobile);
  const brandName = escapeHtml(config.site?.brandName || "Gruhswad");
  const cutoff = escapeHtml(config.site?.orderCutoff || "Order before 9:00 PM for next-day delivery");

  const pageHtml = pages.map((pageCategories, index) => {
    const first = index === 0;
    const last = index === pages.length - 1;
    const header = `<div class="reference-header" role="img" aria-label="${brandName} menu header" style="background-image:url('${referenceHeader}')"></div>${first ? `<div class="recommend-title"><span class="chef-hat"></span> CHEF'S RECOMMENDATIONS <span class="chef-hat"></span></div>
    <div class="recommendations">${featured.map((item) => `<article><img src="${assetUrl(item.image)}" alt=""/><div><strong>${escapeHtml(item.name)}</strong><b>&#8377;${item.price}</b></div></article>`).join("")}</div>`
      : ""}`;

    const footer = `<footer>
      <div class="service" style="background-image:linear-gradient(90deg,#21150ee8,#21150eb8),url('${tiffinPhoto}')">
        <strong>TIFFIN SERVICE</strong><p>Daily tiffin services<br/>available on pre-order.</p>
        <ul><li>Healthy Food</li><li>Balanced Meals</li><li>Hygienic Preparation</li><li>Timely Delivery</li></ul>
      </div>
      <div class="phone"><strong>ORDER BY PHONE</strong><div class="whatsapp">&#9742;</div><p>Call / WhatsApp:<br/><b>+91 ${mobile}</b></p><small>Pre-orders Only</small></div>
      <div class="reasons"><h3>WHY CHOOSE US?</h3><p>&bull; Homely Taste<br/>&bull; Fresh Ingredients<br/>&bull; Made with Love<br/>&bull; Hygienic Preparation</p></div>
      <div class="preorder"><strong>FOR PRE ORDERS</strong><p>${cutoff}</p>${config.publicLocation?.enabled ? `<small>${escapeHtml(config.publicLocation.name)}<br/>${escapeHtml(config.publicLocation.address)}</small>` : ""}</div>
    </footer>`;

    return `<section class="page ${first ? "first" : "continuation"} ${last ? "last" : ""}">${header}${categoryGrid(pageCategories, items)}${footer}<div class="page-number">${index + 1} / ${pages.length}</div></section>`;
  }).join("");

  return `<!doctype html><html><head><meta charset="UTF-8"><style>
    @page{size:A4 portrait;margin:0}*{box-sizing:border-box}html,body{margin:0;padding:0}body{background:#eee;color:#432719;font-family:Georgia,'Times New Roman',serif}
    .page{position:relative;width:210mm;height:297mm;padding:5mm 5mm 6mm;background:#fff9ee;overflow:hidden;page-break-after:always}.page:last-child{page-break-after:auto}
    .reference-header{width:100%;height:62mm;background-position:top center;background-repeat:no-repeat;background-size:100% auto;overflow:hidden}
    .recommend-title{position:relative;z-index:2;width:68%;height:10mm;margin:-1mm auto 0;display:flex;align-items:center;justify-content:center;gap:5mm;text-align:center;color:#d39b14;font:bold 10.5pt Georgia}.recommend-title:before{content:'';position:absolute;z-index:-2;inset:0;background:#28190d;clip-path:polygon(4% 0,96% 0,100% 50%,96% 100%,4% 100%,0 50%);box-shadow:inset 0 0 0 .4mm #8e6410}.recommend-title:after{content:'';position:absolute;z-index:-1;left:8%;right:8%;bottom:1.2mm;border-bottom:.35mm solid #a87812}.chef-hat{position:relative;width:8mm;height:5mm;border-radius:3mm 3mm 1mm 1mm;background:#d39b14}.chef-hat:before{content:'';position:absolute;left:1mm;top:-2.5mm;width:3.8mm;height:3.8mm;border-radius:50%;background:#d39b14;box-shadow:2.5mm -.5mm 0 #d39b14,4mm 1mm 0 #d39b14}.chef-hat:after{content:'';position:absolute;left:1mm;right:1mm;bottom:-1.5mm;border-bottom:.8mm solid #fff9ee}.recommendations{height:48mm;display:grid;grid-template-columns:repeat(4,1fr);gap:2mm;margin:1.5mm 0 3mm}.recommendations article{position:relative;overflow:hidden;border-radius:1mm;background:#eadcc9}.recommendations img{width:100%;height:100%;object-fit:cover}.recommendations div{position:absolute;left:0;right:0;bottom:0;display:flex;justify-content:space-between;align-items:center;padding:1.8mm 2mm;background:#4d1004;color:#fff}.recommendations strong{font-size:7pt;font-style:italic}.recommendations b{font:8.5pt Arial;color:#fff}
    .category-columns{display:grid;grid-template-columns:repeat(3,1fr);gap:2.5mm;align-items:start}.category-columns>div{display:grid;gap:2.5mm;align-content:start}.first .category-columns{max-height:119mm}.continuation .category-columns{margin-top:3mm;max-height:178mm}
    .category-card{break-inside:avoid;overflow:hidden;border:.35mm solid #eed7bc;border-radius:2.5mm;background:linear-gradient(135deg,#fffaf0,#f9eedb);box-shadow:0 .7mm 1.5mm #7c3c1515}.category-card>img{display:block;width:100%;height:18mm;object-fit:cover}.category-card header{display:flex;align-items:center;justify-content:space-between;padding:2mm 2.5mm;border-bottom:.3mm solid #ecd8c2}.category-card h2{margin:0;color:#315d35;font-size:9pt;line-height:1.25}.category-card header span{font:4.8pt Arial;color:#315d35}.items{padding:1.5mm 2.5mm 2.2mm}.items>div{display:flex;justify-content:space-between;gap:1.5mm;min-height:4.1mm;font-size:7.4pt;line-height:1.3}.items span{max-width:78%}.items small{font-size:5.8pt;color:#745947}.items b{white-space:nowrap;color:#c17b00;font-family:Arial,sans-serif;font-size:6.8pt}
    footer{position:absolute;left:5mm;right:5mm;bottom:6mm;height:43mm;display:grid;grid-template-columns:1.25fr .85fr .9fr 1fr;gap:2.5mm}footer>div{padding:3mm;border-radius:2.5mm;background:#fff}footer .service{background-size:cover;background-position:center;color:#fff}footer .service strong{color:#d39b14;font-size:9pt}footer .service p{margin:1mm 0;font:6.3pt Arial;line-height:1.35}footer .service ul{margin:1mm 0 0;padding:0;list-style:none;font:5.8pt Arial;line-height:1.45}footer .service li:before{content:'+';margin-right:1mm;color:#f0b515;font-weight:bold}footer .phone{background:#315d35;color:#fff;text-align:center}footer .phone strong{color:#d39b14;font-size:8pt}.whatsapp{float:left;margin:4mm 0 0;font:20pt Arial;color:#65d46e}footer .phone p{margin:2mm 0 1mm;font:7pt Arial;line-height:1.5}footer .phone small{color:#f07548;font-size:6pt}footer h3,footer .preorder strong{color:#315d35;font-size:8.5pt}footer .reasons p,footer .preorder p{font:6.5pt Arial;line-height:1.55}.preorder{text-align:center}.preorder small{font:5.7pt Arial;color:#745947}.page-number{position:absolute;right:3mm;bottom:2mm;color:#9d8068;font:5.5pt Arial}
  </style></head><body>${pageHtml}</body></html>`;
}

export async function renderMenuPdfToPath(outputPath: string): Promise<MenuPdfExportResult> {
  return renderHtmlPdfToPath({ html: buildMenuPdfHtml(), outputPath, tempPrefix: "gruhswad-menu", warning: (pageCount) => pageCount > 2 ? `The catalog required ${pageCount} pages to remain readable.` : null });
}

export async function exportMenuPdf(): Promise<MenuPdfExportResult> {
  const target = await dialog.showSaveDialog({ title: "Export Gruhswad master menu", defaultPath: `gruhswad-master-menu-${new Date().toISOString().slice(0, 10)}.pdf`, filters: [{ name: "PDF", extensions: ["pdf"] }] });
  if (target.canceled || !target.filePath) return { canceled: true, path: null, pageCount: 0, warning: null };
  return renderMenuPdfToPath(target.filePath);
}

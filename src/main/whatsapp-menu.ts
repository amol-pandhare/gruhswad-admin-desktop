import { clipboard, shell } from "electron";
import type { CatalogCategory, CatalogItem, Publication, RuntimeConfig } from "../shared/contracts";
import { isPublishableItem } from "../shared/catalog";
import { tomorrowInIndia, weeklyWindow } from "../shared/dates";
import { getCatalog, getCurrentPublication, getRuntimeConfig } from "./database";

const money = (value: number) => Number.isInteger(value) ? String(value) : value.toFixed(2);

function serviceDate(value: string) { const [year, month, day] = value.split("-").map(Number); return new Intl.DateTimeFormat("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Kolkata" }).format(new Date(Date.UTC(year, month - 1, day))); }

export function buildLegacyOneDayMenuWhatsAppMessage(publication: Publication, categories: CatalogCategory[], items: CatalogItem[], config: RuntimeConfig) {
  const itemMap = new Map(items.map((item) => [item.id, item]));
  const printable = publication.itemIds.map((id) => itemMap.get(id)).filter((item): item is CatalogItem => Boolean(item && isPublishableItem(item, categories)));
  if (!printable.length) throw new Error("The saved one-day menu has no shareable items.");
  const order = new Map(publication.itemIds.map((id, index) => [id, index]));
  const lines = [`*${publication.title}*`, serviceDate(publication.date), ""];
  lines.push(...printable.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0)).map((item) => `• ${item.name}${item.portion ? ` (${item.portion})` : ""} - ₹${money(item.price)}`), "");
  lines.push(`Pre-order cutoff: ${publication.orderCutoff || config.site.orderCutoff}`, `Call / WhatsApp: +91 ${config.site.mobile}`);
  return lines.join("\n");
}

export function buildOneDayMenuWhatsAppMessage(publication: Publication, categories: CatalogCategory[], items: CatalogItem[], _config: RuntimeConfig) {
  const itemMap = new Map(items.map((item) => [item.id, item]));
  const printable = publication.itemIds.map((id) => itemMap.get(id)).filter((item): item is CatalogItem => Boolean(item && isPublishableItem(item, categories)));
  if (!printable.length) throw new Error("The saved one-day menu has no shareable items.");
  const order = new Map(publication.itemIds.map((id, index) => [id, index]));
  const menuLines = printable
    .sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0))
    .map((item) => `- ${item.name} - Rs. ${money(item.price)}`);

  const window=weeklyWindow();
  return [
    publication.mode==="weekly"?"*Gruhswad Weekly Menu*":"*Tomorrow's Special Menu*",
    publication.mode==="weekly"?`${serviceDate(window[0])} - ${serviceDate(window[6])}`:serviceDate(tomorrowInIndia()),
    "",
    "Treat yourself to a delicious homemade meal from GruhSwad!",
    "",
    ...menuLines,
    "",
    "*Pre-order till Today, 11:00 PM*",
    "*Available Tomorrow for Dinner*",
    "",
    "Fresh | Homemade | Hygienic | Limited Orders",
    "",
    "*Book your order now!*"
  ].join("\n");
}

export async function shareOneDayMenuOnWhatsApp() {
  const publication = getCurrentPublication();
  if (!publication) throw new Error("Save a menu before sharing it on WhatsApp.");
  const catalog = getCatalog(), config = getRuntimeConfig(), mobile = config.site.mobile.replace(/\D/g, "").slice(-10);
  if (!/^\d{10}$/.test(mobile)) throw new Error("Set a valid 10-digit Operations mobile number before sharing.");
  const message = buildOneDayMenuWhatsAppMessage(publication, catalog.categories as CatalogCategory[], catalog.items, config);
  clipboard.writeText(message, "clipboard");
  const shareUrl = new URL("https://api.whatsapp.com/send");
  shareUrl.searchParams.set("phone", `91${mobile}`);
  shareUrl.searchParams.set("text", message);
  shareUrl.searchParams.set("type", "phone_number");
  shareUrl.searchParams.set("app_absent", "0");
  await shell.openExternal(shareUrl.toString());
}

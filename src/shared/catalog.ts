import type { CatalogCategory, CatalogItem, Publication } from "./contracts";

export function searchableCatalogItem(item: CatalogItem, query: string) {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  return [item.id, item.name, item.portion, item.description, ...item.tags].join(" ").toLowerCase().includes(needle);
}

export function isPublishableItem(item: CatalogItem, categories: CatalogCategory[]) {
  return item.available && !item.archived && item.webCompatible && categories.some((category) => category.id === item.categoryId && category.active);
}

export function sanitizePublication(publication: Publication | null, categories: CatalogCategory[], items: CatalogItem[]) {
  if (!publication) return null;
  const allowed = new Set(items.filter((item) => isPublishableItem(item, categories)).map((item) => item.id));
  const itemIds = publication.itemIds.filter((id) => allowed.has(id));
  return { ...publication, itemIds, featuredItemId: publication.featuredItemId && itemIds.includes(publication.featuredItemId) ? publication.featuredItemId : null };
}

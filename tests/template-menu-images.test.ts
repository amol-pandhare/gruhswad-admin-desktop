import { describe, expect, it } from "vitest";
import type { CatalogCategory, CatalogItem, Publication } from "../src/shared/contracts";
import { numberedImagePaths } from "../src/main/image-renderer";
import { buildTemplateMenuImageDocument } from "../src/main/template-menu-images";

const categories: CatalogCategory[] = [
  { id: "chaat", name: "Chaat & Street Food", order: 1, active: true },
  { id: "mains", name: "Main Course", order: 2, active: true },
  { id: "hidden", name: "Hidden", order: 3, active: false },
];
const item = (id: string, overrides: Partial<CatalogItem> = {}): CatalogItem => ({ id, categoryId: "chaat", type: "dish", name: `Dish ${id}`, description: "Not rendered", portion: "1 plate", price: 100, image: `${id}.jpg`, available: true, isNew: false, archived: false, webCompatible: true, tags: [], order: 1, bundleGroups: [], ...overrides });
const publication = (ids: string[], featuredItemId: string | null = null): Publication => ({ date: "2026-07-26", published: true, title: "Sunday's <Menu>", itemIds: ids, featuredItemId, orderCutoff: "9 PM" });
const build = (mode: "master" | "one-day", items: CatalogItem[], menu?: Publication | null) => buildTemplateMenuImageDocument({ mode, categories, items, publication: menu, templateUrl: "file:///MASTER-002_Template.png" });

describe("template menu image document", () => {
  it("embeds the template and escapes one-day title and menu values", () => {
    const result = build("one-day", [item("pani", { name: "Pani & Puri" })], publication(["pani"]));
    expect(result.pages[0]).toContain("MASTER-002_Template.png");
    expect(result.pages[0]).toContain("Sunday&#39;s &lt;Menu&gt;");
    expect(result.pages[0]).toContain("Pani &amp; Puri");
    expect(result.pages[0]).toContain("1 plate");
    expect(result.pages[0]).toContain("&#8377;100");
    expect(result.pages[0]).not.toContain("Not rendered");
    expect(result.pages[0]).not.toContain("<img");
  });

  it("preserves saved order and highlights a valid featured item without a photo", () => {
    const result = build("one-day", [item("first"), item("second")], publication(["second", "first"], "second"));
    expect(result.pages[0]).toContain("TODAY'S SPECIAL");
    expect(result.pages[0].indexOf("Dish second")).toBeLessThan(result.pages[0].indexOf("Dish first"));
  });

  it("omits invalid selected items and collapses an invalid special", () => {
    const items = [item("valid"), item("archived", { archived: true }), item("hidden", { categoryId: "hidden" })];
    const result = build("one-day", items, publication(items.map((value) => value.id), "archived"));
    expect(result.omittedItemCount).toBe(2);
    expect(result.pages[0]).not.toContain("TODAY'S SPECIAL");
    expect(result.pages[0]).toContain("Dish valid");
  });

  it("filters the master catalog and creates continuation images", () => {
    const items = Array.from({ length: 70 }, (_, index) => item(`item-${index}`, { categoryId: index < 35 ? "chaat" : "mains", order: index }));
    items.push(item("unavailable", { available: false }));
    const result = build("master", items);
    expect(result.pages.length).toBeGreaterThan(1);
    expect(result.pages.join("")).not.toContain("Dish unavailable");
    expect(result.pages[1]).toContain("CONTINUED");
  });

  it("fails clearly without a saved or printable menu", () => {
    expect(() => build("one-day", [item("one")], null)).toThrow(/Save a one-day menu/);
    expect(() => build("master", [item("one", { archived: true })])).toThrow(/no printable/i);
  });

  it("derives stable numbered PNG paths", () => {
    expect(numberedImagePaths("C:\\Exports\\menu.png", 1)).toEqual(["C:\\Exports\\menu.png"]);
    expect(numberedImagePaths("C:\\Exports\\menu.png", 3)).toEqual(["C:\\Exports\\menu-01.png", "C:\\Exports\\menu-02.png", "C:\\Exports\\menu-03.png"]);
  });
});

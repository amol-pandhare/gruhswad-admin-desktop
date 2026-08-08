import { describe, expect, it } from "vitest";
import type { CatalogCategory, CatalogItem, Publication, RuntimeConfig } from "../src/shared/contracts";
import { buildOneDayMenuWhatsAppMessage } from "../src/main/whatsapp-menu";

const categories: CatalogCategory[] = [{ id: "mains", name: "Main Course", order: 1, active: true }, { id: "hidden", name: "Hidden", order: 2, active: false }];
const item = (id: string, overrides: Partial<CatalogItem> = {}): CatalogItem => ({ id, categoryId: "mains", type: "dish", name: `Dish ${id}`, description: "", portion: "1 plate", price: 100, image: null, available: true, isNew: false, archived: false, webCompatible: true, tags: [], order: 1, bundleGroups: [], ...overrides });
const publication: Publication = { date: "2026-07-26", published: true, title: "Sunday Menu", itemIds: ["second", "first", "archived", "hidden"], featuredItemId: "second", orderCutoff: "9:00 PM" };
const config: RuntimeConfig = { site: { brandName: "Gruhswad", tagline: "Taste of Home", mobile: "8123415647", orderCutoff: "9 PM" }, operations: { open: true, message: "", pickupEnabled: true, deliveryEnabled: false }, announcements: { maxAnnouncements: 6, items: [] }, serviceArea: { pickupCities: [], pickupState: "", pickupCountry: "India", kitchenPlaceId: "", kitchenLatitude: null, kitchenLongitude: null, deliveryRadiusKm: 5 }, orderingPlatforms: [], publicLocation: { enabled: false, name: "", address: "", mapQuery: "", googleMapsUrl: "", directions: "" } };

describe("one-day menu WhatsApp message", () => {
  it("preserves the requested copy and inserts a flat saved-menu item list", () => {
    const message = buildOneDayMenuWhatsAppMessage(publication, categories, [item("first"), item("second"), item("archived", { archived: true }), item("hidden", { categoryId: "hidden" })], config);
    expect(message).toContain("*Tomorrow's Special Menu*");
    expect(message).toContain("Treat yourself to a delicious homemade meal from GruhSwad!");
    expect(message).toContain("- Dish second - Rs. 100");
    expect(message).toContain("- Dish first - Rs. 100");
    expect(message).not.toContain("1 plate");
    expect(message).not.toContain("Dish archived");
    expect(message).not.toContain("Dish hidden");
    expect(message).toContain("*Pre-order till Today, 11:00 PM*");
    expect(message).toContain("*Available Tomorrow for Dinner*");
    expect(message).toContain("Fresh | Homemade | Hygienic | Limited Orders");
    expect(message).toContain("*Book your order now!*");
    expect(message).not.toContain("\uFFFD");
    expect(decodeURIComponent(encodeURIComponent(message))).toBe(message);
  });

  it("fails when no saved item remains shareable", () => {
    expect(() => buildOneDayMenuWhatsAppMessage({ ...publication, itemIds: ["archived"], featuredItemId: null }, categories, [item("archived", { archived: true })], config)).toThrow(/no shareable items/i);
  });
});

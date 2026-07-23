import { describe,expect,it } from "vitest";
import { publicationSchema } from "../src/shared/contracts";
import { cashSummary } from "../src/shared/reports";
import { parseStructuredOrder } from "../src/shared/whatsapp";
import { resolveDatabaseConnection } from "../src/shared/environment";
import { normalizeServiceDate, normalizeTimestamp } from "../src/shared/dates";
import { classifyPushCandidates, pushSectionFor } from "../src/shared/push-policy";
import { normalizeRuntimeSetting, runtimeConfigFromSettings } from "../src/shared/runtime-config";
import { normalizeCloudOrderLine } from "../src/shared/order-detail";

describe("cloud order details",()=>{
  it("exposes the selected item name, quantity and per-item price",()=>expect(normalizeCloudOrderLine({id:"line-1",item_id:"pani-puri",item_snapshot:JSON.stringify({name:"Pani Puri",portion:"8 pcs",basePrice:50}),bundle_selection:"[]",quantity:2,unit_total:60,line_total:120})).toMatchObject({name:"Pani Puri",portion:"8 pcs",quantity:2,unit_price:60,line_total:120}));
  it("preserves combo selections for display",()=>expect(normalizeCloudOrderLine({item_snapshot:{name:"Mini Thali"},bundle_selection:[{group:"Choose curry",choices:[{name:"Dal Fry"}]}],quantity:1,unit_total:199,line_total:199}).bundle_selection).toEqual([{group:"Choose curry",choices:[{name:"Dal Fry"}]}]));
});

describe("Operations SQLite payload normalization",()=>{
  it("uses the seeded mobile when the site payload has no phone",()=>expect(normalizeRuntimeSetting("site",{brandName:"Gruhswad"}).mobile).toBe("8123415647"));
  it("maps legacy Neon phone fields to a ten-digit mobile",()=>expect(normalizeRuntimeSetting("site",{displayPhone:"+91 99887 76655"}).mobile).toBe("9988776655"));
  it("produces a complete valid Operations configuration from missing rows",()=>expect(runtimeConfigFromSettings({}).site.mobile).toBe("8123415647"));
});

describe("Neon push allowlist",()=>{
  it("maps only the supported records to the four admin sections",()=>{
    expect(pushSectionFor("cloud_order_status","order-1")).toBe("orders");
    expect(pushSectionFor("catalog_category","street-food")).toBe("catalog");
    expect(pushSectionFor("catalog_item","pani-puri")).toBe("catalog");
    expect(pushSectionFor("publication","current")).toBe("menu");
    for(const key of ["site","operations","service_area","ordering_platforms","public_location"])expect(pushSectionFor("app_setting",key)).toBe("operations");
  });
  it("excludes finance, desktop settings and unsupported cloud writes",()=>{
    const rows=[{type:"expense",id:"e1"},{type:"payment",id:"p1"},{type:"whatsapp_import",id:"w1"},{type:"credential",id:"neon"},{type:"app_setting",id:"desktop_theme"},{type:"publication",id:"history"},{type:"cloud_order",id:"o1"},{type:"unknown",id:"x"}];
    const result=classifyPushCandidates(rows);
    expect(result.pushable).toHaveLength(0);
    expect(result.excluded).toHaveLength(rows.length);
    expect(result.sections).toEqual({orders:0,catalog:0,menu:0,operations:0});
  });
  it("reports section and excluded counts from one central classifier",()=>{
    const result=classifyPushCandidates([{type:"cloud_order_status",id:"o1"},{type:"catalog_category",id:"c1"},{type:"catalog_item",id:"i1"},{type:"publication",id:"current"},{type:"app_setting",id:"site"},{type:"expense",id:"e1"}]);
    expect(result.sections).toEqual({orders:1,catalog:2,menu:1,operations:1});
    expect(result.pushable).toHaveLength(5);
    expect(result.excluded).toHaveLength(1);
  });
});

describe("database environment selection",()=>{
  it("selects local and production URLs",()=>{expect(resolveDatabaseConnection({processEnv:{APP_ENV:"local",DATABASE_URL_LOCAL:"local-db",DATABASE_URL_PROD:"prod-db"}})).toMatchObject({environment:"local",source:"environment-local",url:"local-db"});expect(resolveDatabaseConnection({processEnv:{APP_ENV:"prod",DATABASE_URL_LOCAL:"local-db",DATABASE_URL_PROD:"prod-db"}})).toMatchObject({environment:"prod",source:"environment-prod",url:"prod-db"});});
  it("prefers Settings and then the legacy fallback",()=>{expect(resolveDatabaseConnection({processEnv:{APP_ENV:"prod",DATABASE_URL_PROD:"prod-db"},storedUrl:"saved-db"}).source).toBe("settings");expect(resolveDatabaseConnection({processEnv:{APP_ENV:"prod",DATABASE_URL:"legacy-db"}})).toMatchObject({source:"legacy",url:"legacy-db"});});
  it("defaults to local and rejects unsupported environments",()=>{expect(resolveDatabaseConnection({})).toMatchObject({environment:"local",configured:false});expect(()=>resolveDatabaseConnection({processEnv:{APP_ENV:"staging"}})).toThrow();});
});
describe("Neon date normalization",()=>{it("keeps service dates filterable in India time",()=>expect(normalizeServiceDate(new Date("2026-07-16T18:30:00.000Z"))).toBe("2026-07-17"));it("stores timestamps as UTC ISO strings",()=>expect(normalizeTimestamp("Thu Jul 23 2026 12:00:35 GMT+0530 (India Standard Time)")).toBe("2026-07-23T06:30:35.000Z"));});

describe("Gruhswad publication contract",()=>{const valid={date:"2026-07-20",published:true,title:"Tomorrow's Fresh Menu",itemIds:["pani-puri"],featuredItemId:"pani-puri",orderCutoff:"Order before 9 PM"};it("accepts the existing web payload",()=>expect(publicationSchema.parse(valid)).toEqual(valid));it("rejects duplicate and unselected featured items",()=>expect(publicationSchema.safeParse({...valid,itemIds:["pani-puri","pani-puri"],featuredItemId:"dal-fry"}).success).toBe(false));});
describe("cash reporting",()=>{it("subtracts refunds and expenses",()=>expect(cashSummary([{amount:1000,status:"received"},{amount:100,status:"refunded"}],[{amount:300}],[500,700])).toEqual({revenue:900,expenses:300,profit:600,averageOrder:600}));});
describe("structured WhatsApp parsing",()=>{it("parses Gruhswad's known order template",()=>{const parsed=parseStructuredOrder("Namaste Gruhswad! I'd like to place a pre-order for 2026-07-20.\n\nOrder:\n• Pani Puri × 2 — ₹100\nEstimated total: ₹100\n\nName: Amol\nPhone: 9876543210\nFulfilment: Pickup\n\nPlease confirm availability, final total and fulfilment details. Thank you!");expect(parsed?.lines[0]).toMatchObject({name:"Pani Puri",quantity:2,lineTotal:100});});it("leaves free-form messages unmatched",()=>expect(parseStructuredOrder("Please send lunch tomorrow")).toBeNull());});

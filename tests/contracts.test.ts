import { describe,expect,it } from "vitest";
import { announcementSchema, catalogCategorySchema, catalogItemSchema, operationsSchema, orderInputSchema, publicationSchema, unifiedOrderQuerySchema } from "../src/shared/contracts";
import { isPublishableItem, sanitizePublication, searchableCatalogItem } from "../src/shared/catalog";
import { cashSummary } from "../src/shared/reports";
import { parseStructuredOrder } from "../src/shared/whatsapp";
import { resolveDatabaseConnection } from "../src/shared/environment";
import { normalizeCustomerEmail, normalizeCustomerPhone } from "../src/shared/customers";
import { normalizeServiceDate, normalizeTimestamp } from "../src/shared/dates";
import { classifyPushCandidates, pushSectionFor } from "../src/shared/push-policy";
import { normalizeRuntimeSetting, runtimeConfigFromSettings } from "../src/shared/runtime-config";
import { normalizeCloudOrderLine } from "../src/shared/order-detail";
import { exitWarningCopy, syncAttentionFromCounts } from "../src/shared/sync-attention";

describe("sync attention and exit warnings",()=>{
  it("requires attention only for conflicts or pushable dirty records",()=>{expect(syncAttentionFromCounts(0,0)).toEqual({conflicts:0,pushableDirty:0,requiresAttention:false});expect(syncAttentionFromCounts(1,0).requiresAttention).toBe(true);expect(syncAttentionFromCounts(0,2).requiresAttention).toBe(true);});
  it("prioritizes conflict wording when both conditions exist",()=>{const copy=exitWarningCopy(syncAttentionFromCounts(2,3));expect(copy.title).toBe("Unresolved sync conflicts");expect(copy.message).toContain("2 sync conflicts");});
  it("uses pending-cloud wording for dirty-only state",()=>{const copy=exitWarningCopy(syncAttentionFromCounts(0,1));expect(copy.title).toBe("Cloud update pending");expect(copy.message).toContain("1 local change has");});
  it("warns when local sync status cannot be checked",()=>expect(exitWarningCopy(null).title).toBe("Sync status could not be verified"));
});

describe("cloud order details",()=>{
  it("exposes the selected item name, quantity and per-item price",()=>expect(normalizeCloudOrderLine({id:"line-1",item_id:"pani-puri",item_snapshot:JSON.stringify({name:"Pani Puri",portion:"8 pcs",basePrice:50}),bundle_selection:"[]",quantity:2,unit_total:60,line_total:120})).toMatchObject({name:"Pani Puri",portion:"8 pcs",quantity:2,unit_price:60,line_total:120}));
  it("preserves combo selections for display",()=>expect(normalizeCloudOrderLine({item_snapshot:{name:"Mini Thali"},bundle_selection:[{group:"Choose curry",choices:[{name:"Dal Fry"}]}],quantity:1,unit_total:199,line_total:199}).bundle_selection).toEqual([{group:"Choose curry",choices:[{name:"Dal Fry"}]}]));
});

describe("Operations SQLite payload normalization",()=>{
  it("uses the seeded mobile when the site payload has no phone",()=>expect(normalizeRuntimeSetting("site",{brandName:"Gruhswad"}).mobile).toBe("8123415647"));
  it("maps legacy Neon phone fields to a ten-digit mobile",()=>expect(normalizeRuntimeSetting("site",{displayPhone:"+91 99887 76655"}).mobile).toBe("9988776655"));
  it("produces a complete valid Operations configuration from missing rows",()=>expect(runtimeConfigFromSettings({}).site.mobile).toBe("8123415647"));
  it("normalizes missing legacy announcement state to an empty collection",()=>expect(runtimeConfigFromSettings({}).announcements).toEqual({maxAnnouncements:6,items:[]}));
  it("normalizes legacy Operations payloads to the midnight-to-9-PM preorder window",()=>expect(normalizeRuntimeSetting("operations",{open:true,pickupEnabled:true,deliveryEnabled:false,message:""}).preorderWindow).toEqual({start:"00:00",end:"21:00"}));
  it("normalizes legacy Operations payloads with no closure schedule",()=>expect(normalizeRuntimeSetting("operations",{open:true,pickupEnabled:true,deliveryEnabled:false,message:""}).closurePeriod).toBeNull());
  it("accepts only a valid same-day preorder window",()=>{const base={open:true,pickupEnabled:true,deliveryEnabled:false,message:""};expect(operationsSchema.safeParse({...base,preorderWindow:{start:"08:30",end:"20:45"}}).success).toBe(true);for(const preorderWindow of [{start:"21:00",end:"09:00"},{start:"09:00",end:"09:00"},{start:"9:00",end:"21:00"}])expect(operationsSchema.safeParse({...base,preorderWindow}).success).toBe(false);});
  it("accepts inclusive closure dates and rejects reversed ranges",()=>{const base={open:true,pickupEnabled:true,deliveryEnabled:false,message:"",preorderWindow:{start:"08:30",end:"20:45"}};expect(operationsSchema.safeParse({...base,closurePeriod:{startDate:"2026-08-10",endDate:"2026-08-10"}}).success).toBe(true);expect(operationsSchema.safeParse({...base,closurePeriod:{startDate:"2026-08-10",endDate:"2026-08-09"}}).success).toBe(false);});
  it("accepts the landing-page announcement contract",()=>expect(announcementSchema.parse({id:"holiday-orders",enabled:true,title:"Holiday orders",message:"Pre-orders close early today.",linkLabel:"View menu",linkUrl:"https://gruhswad.example/menu",startsAt:"2026-07-28T12:00:00.000Z",endsAt:"2026-07-29T12:00:00.000Z",theme:"saffron"}).enabled).toBe(true));
  it("rejects incomplete links, insecure links and invalid schedules",()=>{const base={id:"update",enabled:true,title:"Update",message:"Kitchen update",linkLabel:"Learn more",linkUrl:"http://example.com",startsAt:"2026-07-29T12:00:00.000Z",endsAt:"2026-07-28T12:00:00.000Z",theme:"cocoa" as const};expect(announcementSchema.safeParse(base).success).toBe(false);expect(announcementSchema.safeParse({...base,linkUrl:""}).success).toBe(false);expect(announcementSchema.safeParse({...base,linkLabel:"",linkUrl:"https://example.com",startsAt:null,endsAt:null}).success).toBe(false);});
});

describe("Neon push allowlist",()=>{
  it("maps only supported records to the admin sections",()=>{
    expect(pushSectionFor("cloud_order_status","order-1")).toBe("orders");
    expect(pushSectionFor("cloud_customer","customer-1")).toBe("customers");
    expect(pushSectionFor("catalog_category","street-food")).toBe("catalog");
    expect(pushSectionFor("catalog_item","pani-puri")).toBe("catalog");
    expect(pushSectionFor("publication","current")).toBe("menu");
    for(const key of ["site","operations","announcement","service_area","ordering_platforms","public_location"])expect(pushSectionFor("app_setting",key)).toBe("operations");
  });
  it("excludes finance, desktop settings and unsupported cloud writes",()=>{
    const rows=[{type:"expense",id:"e1"},{type:"payment",id:"p1"},{type:"whatsapp_import",id:"w1"},{type:"credential",id:"neon"},{type:"app_setting",id:"desktop_theme"},{type:"publication",id:"history"},{type:"cloud_order",id:"o1"},{type:"unknown",id:"x"}];
    const result=classifyPushCandidates(rows);
    expect(result.pushable).toHaveLength(0);
    expect(result.excluded).toHaveLength(rows.length);
    expect(result.sections).toEqual({orders:0,customers:0,catalog:0,menu:0,operations:0});
  });
  it("reports section and excluded counts from one central classifier",()=>{
    const result=classifyPushCandidates([{type:"cloud_order_status",id:"o1"},{type:"cloud_customer",id:"u1"},{type:"catalog_category",id:"c1"},{type:"catalog_item",id:"i1"},{type:"publication",id:"current"},{type:"app_setting",id:"site"},{type:"expense",id:"e1"}]);
    expect(result.sections).toEqual({orders:1,customers:1,catalog:2,menu:1,operations:1});
    expect(result.pushable).toHaveLength(6);
    expect(result.excluded).toHaveLength(1);
  });
});

describe("customer contact normalization",()=>{it("normalizes Indian and international phones",()=>{expect(normalizeCustomerPhone("98765 43210")).toBe("+919876543210");expect(normalizeCustomerPhone("+1 415 555 0123")).toBe("+14155550123");});it("normalizes optional email",()=>{expect(normalizeCustomerEmail("  AMOL@Example.COM ")).toBe("amol@example.com");expect(normalizeCustomerEmail(" ")).toBeNull();expect(()=>normalizeCustomerEmail("not-an-email")).toThrow(/valid email/i);});});
describe("manual order contracts",()=>{const valid={customer:{name:"Manual Customer",phone:"9876543210",email:"",archived:false},serviceDate:"2026-08-08",fulfilment:"pickup",address:"",notes:"",source:{id:"direct",name:"Direct order"},status:"confirmed",lines:[{menuItemId:null,name:"Custom lunch",quantity:2,unitPrice:125}]};it("accepts catalog or custom local lines and a snapshotted source",()=>expect(orderInputSchema.parse(valid)).toMatchObject(valid));it("requires an address for delivery",()=>expect(orderInputSchema.safeParse({...valid,fulfilment:"delivery"}).success).toBe(false));it("validates unified order filters",()=>expect(unifiedOrderQuerySchema.parse({range:{from:"2026-08-01",to:"2026-08-31"}})).toEqual({kind:"all",range:{from:"2026-08-01",to:"2026-08-31"},search:"",source:""}));});

describe("database environment selection",()=>{
  it("selects local and production URLs",()=>{expect(resolveDatabaseConnection({processEnv:{APP_ENV:"local",DATABASE_URL_LOCAL:"local-db",DATABASE_URL_PROD:"prod-db"}})).toMatchObject({environment:"local",source:"environment-local",url:"local-db"});expect(resolveDatabaseConnection({processEnv:{APP_ENV:"prod",DATABASE_URL_LOCAL:"local-db",DATABASE_URL_PROD:"prod-db"}})).toMatchObject({environment:"prod",source:"environment-prod",url:"prod-db"});});
  it("prefers Settings and then the legacy fallback",()=>{expect(resolveDatabaseConnection({processEnv:{APP_ENV:"prod",DATABASE_URL_PROD:"prod-db"},storedUrl:"saved-db"}).source).toBe("settings");expect(resolveDatabaseConnection({processEnv:{APP_ENV:"prod",DATABASE_URL:"legacy-db"}})).toMatchObject({source:"legacy",url:"legacy-db"});});
  it("defaults to local and rejects unsupported environments",()=>{expect(resolveDatabaseConnection({})).toMatchObject({environment:"local",configured:false});expect(()=>resolveDatabaseConnection({processEnv:{APP_ENV:"staging"}})).toThrow();});
  it("uses the compiled build environment only when runtime configuration is absent",()=>{expect(resolveDatabaseConnection({buildEnv:"prod"})).toMatchObject({environment:"prod",configured:false});expect(resolveDatabaseConnection({buildEnv:"prod",processEnv:{APP_ENV:"local"}}).environment).toBe("local");});
});
describe("Neon date normalization",()=>{it("keeps service dates filterable in India time",()=>expect(normalizeServiceDate(new Date("2026-07-16T18:30:00.000Z"))).toBe("2026-07-17"));it("stores timestamps as UTC ISO strings",()=>expect(normalizeTimestamp("Thu Jul 23 2026 12:00:35 GMT+0530 (India Standard Time)")).toBe("2026-07-23T06:30:35.000Z"));});

describe("Gruhswad publication contract",()=>{const valid={date:"2026-07-20",published:true,title:"Tomorrow's Fresh Menu",itemIds:["pani-puri"],featuredItemId:"pani-puri",orderCutoff:"Order before 9 PM"};it("accepts and normalizes the existing web payload",()=>expect(publicationSchema.parse(valid)).toEqual({...valid,mode:"one-day",weeklyStartDate:null}));it("rejects duplicate and unselected featured items",()=>expect(publicationSchema.safeParse({...valid,itemIds:["pani-puri","pani-puri"],featuredItemId:"dal-fry"}).success).toBe(false));});
describe("catalog administration rules",()=>{const category=catalogCategorySchema.parse({id:"street-food",name:"Street Food",order:1,active:true});const item=catalogItemSchema.parse({id:"pani-puri",categoryId:category.id,type:"dish",name:"Pani Puri",description:"Crisp shells",portion:"8 pcs",price:50,image:"pani-puri.jpg",available:true,isNew:false,archived:false,webCompatible:true,tags:["chaat"],order:1,bundleGroups:[]});it("rejects remote and unsafe image paths",()=>{expect(catalogItemSchema.safeParse({...item,image:"https://example.com/dish.jpg"}).success).toBe(false);expect(catalogItemSchema.safeParse({...item,image:"../dish.jpg"}).success).toBe(false);});it("searches IDs, descriptions, and tags",()=>{expect(searchableCatalogItem(item,"crisp")).toBe(true);expect(searchableCatalogItem(item,"chaat")).toBe(true);expect(searchableCatalogItem(item,"pani-puri")).toBe(true);});it("requires an active category and a customer-ready item",()=>{expect(isPublishableItem(item,[category])).toBe(true);expect(isPublishableItem({...item,archived:true},[category])).toBe(false);expect(isPublishableItem(item,[{...category,active:false}])).toBe(false);});it("removes stale selections and featured items from loaded publications",()=>{const publication={date:"2026-07-20",published:true,title:"Menu",itemIds:[item.id,"missing"],featuredItemId:"missing",orderCutoff:"9 PM"};expect(sanitizePublication(publication,[category],[item])).toMatchObject({itemIds:[item.id],featuredItemId:null});});});
describe("cash reporting",()=>{it("subtracts refunds and expenses",()=>expect(cashSummary([{amount:1000,status:"received"},{amount:100,status:"refunded"}],[{amount:300}],[500,700])).toEqual({revenue:900,expenses:300,profit:600,averageOrder:600}));});
describe("structured WhatsApp parsing",()=>{it("parses Gruhswad's known order template",()=>{const parsed=parseStructuredOrder("Namaste Gruhswad! I'd like to place a pre-order for 2026-07-20.\n\nOrder:\n• Pani Puri × 2 — ₹100\nEstimated total: ₹100\n\nName: Amol\nPhone: 9876543210\nFulfilment: Pickup\n\nPlease confirm availability, final total and fulfilment details. Thank you!");expect(parsed?.lines[0]).toMatchObject({name:"Pani Puri",quantity:2,lineTotal:100});});it("leaves free-form messages unmatched",()=>expect(parseStructuredOrder("Please send lunch tomorrow")).toBeNull());});

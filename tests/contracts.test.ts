import { describe,expect,it } from "vitest";
import { publicationSchema } from "../src/shared/contracts";
import { cashSummary } from "../src/shared/reports";
import { parseStructuredOrder } from "../src/shared/whatsapp";

describe("Gruhswad publication contract",()=>{const valid={date:"2026-07-20",published:true,title:"Tomorrow's Fresh Menu",itemIds:["pani-puri"],featuredItemId:"pani-puri",orderCutoff:"Order before 9 PM",whatsapp:"918123415647"};it("accepts the existing web payload",()=>expect(publicationSchema.parse(valid)).toEqual(valid));it("rejects duplicate and unselected featured items",()=>expect(publicationSchema.safeParse({...valid,itemIds:["pani-puri","pani-puri"],featuredItemId:"dal-fry"}).success).toBe(false));});
describe("cash reporting",()=>{it("subtracts refunds and expenses",()=>expect(cashSummary([{amount:1000,status:"received"},{amount:100,status:"refunded"}],[{amount:300}],[500,700])).toEqual({revenue:900,expenses:300,profit:600,averageOrder:600}));});
describe("structured WhatsApp parsing",()=>{it("parses Gruhswad's known order template",()=>{const parsed=parseStructuredOrder("Namaste Gruhswad! I'd like to place a pre-order for 2026-07-20.\n\nOrder:\n• Pani Puri × 2 — ₹100\nEstimated total: ₹100\n\nName: Amol\nPhone: 9876543210\nFulfilment: Pickup\n\nPlease confirm availability, final total and fulfilment details. Thank you!");expect(parsed?.lines[0]).toMatchObject({name:"Pani Puri",quantity:2,lineTotal:100});});it("leaves free-form messages unmatched",()=>expect(parseStructuredOrder("Please send lunch tomorrow")).toBeNull());});

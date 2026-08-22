import { describe, expect, it } from "vitest";
import { buildOrderWhatsAppMessage, canContactCustomer } from "../src/shared/order-contact";
import { assertOperationalOrderTransition } from "../src/shared/service-operations";

const order=(status:string)=>({kind:"online",id:"00000000-0000-4000-8000-000000000001",reference:"ORD-1234",customerName:"Amol",phone:"+919663320853",email:null,serviceType:"preorder",serviceDate:"2026-08-25",serviceEndDate:null,serviceStartTime:"12:30",serviceEndTime:null,fulfilment:"pickup",sourceId:"website",sourceName:"Website",status,handoffStatus:"customer_confirmed",pendingSync:true,paymentStatus:"unpaid",total:200,paid:0,refunded:0,outstanding:200,ingredientCost:0,notes:"",createdAt:"2026-08-19T00:00:00Z",items:"Meal x1",address:"Bengaluru",adjustmentLabel:"",adjustmentAmount:0,serviceDetails:{occasion:"",guestCount:null,dietary:"",packaging:""},enquiryId:null,enquiryReference:null,tiffinPlanId:null,lines:[],payments:[],contactEvents:[]}) as any;

describe("customer milestone contact",()=>{
  it("allows only confirmed, ready, and cancelled",()=>{expect(canContactCustomer("confirmed")).toBe(true);expect(canContactCustomer("ready")).toBe(true);expect(canContactCustomer("cancelled")).toBe(true);expect(canContactCustomer("preparing")).toBe(false);expect(canContactCustomer("completed")).toBe(false)});
  it("builds reviewed milestone wording without a delivery claim",()=>{const message=buildOrderWhatsAppMessage(order("confirmed"));expect(message).toContain("ORD-1234");expect(message).toContain("2026-08-25 at 12:30");expect(message).not.toMatch(/delivered|message sent/i)});
});

describe("operational order transitions",()=>{
  it("allows the next operational step and cancellation",()=>{expect(()=>assertOperationalOrderTransition("awaiting_review","confirmed")).not.toThrow();expect(()=>assertOperationalOrderTransition("confirmed","cancelled")).not.toThrow()});
  it("blocks skipped, backwards, and terminal changes",()=>{expect(()=>assertOperationalOrderTransition("awaiting_review","ready")).toThrow(/next operational step/i);expect(()=>assertOperationalOrderTransition("ready","confirmed")).toThrow(/backwards/i);expect(()=>assertOperationalOrderTransition("completed","cancelled")).toThrow(/terminal/i)});
});

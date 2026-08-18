import {describe,expect,it} from "vitest";
import {extractReceipt} from "../src/main/receipt-ocr";
import {receiptExpenseInputSchema} from "../src/shared/contracts";

describe("receipt extraction and review",()=>{
  it("extracts common merchant receipt fields as editable suggestions",()=>{const result=extractReceipt("Fresh Merchant\nInvoice No: FM-1024\nDate 16/08/2026\nTomatoes 2 120.00\nCGST 6.00\nGrand Total INR 126.00\nPaid UPI");expect(result).toMatchObject({merchant:"Fresh Merchant",invoiceReference:"FM-1024",date:"2026-08-16",amount:126,paymentMethod:"UPI"});expect(result.lines.length).toBeGreaterThan(0)});
  it("rejects mapped inventory whose cost exceeds the reviewed expense",()=>{const value={receiptToken:"9d2b558a-33d7-4b28-90df-ae2b6f922611",date:"2026-08-16",category:"Ingredients",description:"Purchase",amount:100,paymentMethod:"UPI",notes:"",merchant:"Merchant",invoiceReference:"INV-1",tax:0,duplicateOverrideReason:"",inventoryMappings:[{lineId:"1",stockItemId:"9d2b558a-33d7-4b28-90df-ae2b6f922612",supplier:"Merchant",packQuantity:1,packUnit:"kg",unitsPerPack:1,totalCost:120}]};expect(receiptExpenseInputSchema.safeParse(value).success).toBe(false)});
});

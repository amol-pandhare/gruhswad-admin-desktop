import { z } from "zod";

export const orderStatusSchema = z.enum(["draft", "confirmed", "preparing", "ready", "completed", "cancelled"]);
export const paymentStatusSchema = z.enum(["unpaid", "partial", "paid", "refunded"]);
export const fulfilmentSchema = z.enum(["delivery", "pickup"]);
export const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const orderLineSchema = z.object({ menuItemId: z.string().nullable().optional(), name: z.string().min(1), quantity: z.number().int().min(1).max(1000), unitPrice: z.number().nonnegative() });
export const orderInputSchema = z.object({
  id: z.string().optional(), customerName: z.string().min(2), phone: z.string().min(8), serviceDate: dateSchema,
  fulfilment: fulfilmentSchema, address: z.string().default(""), notes: z.string().default(""), source: z.enum(["manual", "whatsapp", "phone", "walk-in"]).default("manual"),
  status: orderStatusSchema.default("draft"), lines: z.array(orderLineSchema).min(1),
});
export const expenseInputSchema = z.object({ id: z.string().optional(), date: dateSchema, category: z.string().min(1), description: z.string().min(1), amount: z.number().positive(), paymentMethod: z.string().min(1), notes: z.string().default("") });
export const paymentInputSchema = z.object({ orderId: z.string(), amount: z.number().positive(), receivedAt: z.string().min(10), method: z.string().min(1), status: z.enum(["received", "refunded"]).default("received") });
export const publicationSchema = z.object({ date: dateSchema, published: z.boolean(), title: z.string().min(1), itemIds: z.array(z.string()).min(1), featuredItemId: z.string().nullable(), orderCutoff: z.string().min(1), whatsapp: z.string().min(8) }).superRefine((data, ctx) => {
  if (new Set(data.itemIds).size !== data.itemIds.length) ctx.addIssue({ code: "custom", message: "Duplicate menu items are not allowed." });
  if (data.featuredItemId && !data.itemIds.includes(data.featuredItemId)) ctx.addIssue({ code: "custom", message: "Featured item must be selected." });
});

export type OrderInput = z.infer<typeof orderInputSchema>;
export type ExpenseInput = z.infer<typeof expenseInputSchema>;
export type PaymentInput = z.infer<typeof paymentInputSchema>;
export type Publication = z.infer<typeof publicationSchema>;
export type DateRange = { from: string; to: string };
export type Dashboard = { revenue: number; expenses: number; profit: number; orderCount: number; outstanding: number; averageOrder: number; recentOrders: Record<string, unknown>[]; expenseByCategory: { category: string; total: number }[] };

export type AdminApi = {
  dashboard(range: DateRange): Promise<Dashboard>;
  orders: { list(range?: DateRange): Promise<any[]>; save(input: OrderInput): Promise<string>; updateStatus(id: string, status: z.infer<typeof orderStatusSchema>): Promise<void>; addPayment(input: PaymentInput): Promise<void> };
  expenses: { list(range?: DateRange): Promise<any[]>; save(input: ExpenseInput): Promise<string>; remove(id: string): Promise<void> };
  menu: { catalog(): Promise<{ categories: any[]; items: any[] }>; history(): Promise<any[]>; publish(input: Publication): Promise<void> };
  reports: { exportCsv(kind: "orders" | "expenses" | "summary", range: DateRange): Promise<string | null> };
  inbox: { list(): Promise<any[]>; sync(): Promise<{ imported: number; unmatched: number }>; createOrder(importId: string): Promise<string> };
  settings: { get(): Promise<Record<string, string>>; set(values: Record<string, string>, secrets?: Record<string, string>): Promise<void>; backup(): Promise<string | null>; restore(): Promise<boolean> };
  updates: { check(): Promise<void>; install(): Promise<void>; onStatus(callback: (status: string) => void): () => void };
};

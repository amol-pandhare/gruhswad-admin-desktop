import { z } from "zod";

const parsedSchema = z.object({ serviceDate: z.string(), customerName: z.string(), phone: z.string(), fulfilment: z.enum(["delivery", "pickup"]), address: z.string(), notes: z.string(), estimatedTotal: z.number(), lines: z.array(z.object({ name: z.string(), quantity: z.number().int().positive(), lineTotal: z.number().nonnegative() })).min(1) });
export type ParsedWhatsAppOrder = z.infer<typeof parsedSchema>;

export function parseStructuredOrder(message: string): ParsedWhatsAppOrder | null {
  const normalized = message
    .replace(/\u00e2\u20ac\u00a2/g, "\u2022")
    .replace(/\u00c3\u2014/g, "\u00d7")
    .replace(/\u00e2\u20ac\u201d/g, "\u2014")
    .replace(/\u00e2\u201a\u00b9/g, "\u20b9");
  const date = normalized.match(/pre-order for (\d{4}-\d{2}-\d{2})/i)?.[1];
  const name = normalized.match(/^Name:\s*(.+)$/im)?.[1]?.trim();
  const phone = normalized.match(/^Phone:\s*(.+)$/im)?.[1]?.trim();
  const fulfilmentText = normalized.match(/^Fulfilment:\s*(Delivery|Pickup)$/im)?.[1]?.toLowerCase();
  const totalText = normalized.match(/^Estimated total:\s*₹?\s*(\d+(?:\.\d+)?)$/im)?.[1];
  if (!date || !name || !phone || !fulfilmentText || !totalText || !normalized.includes("Namaste Gruhswad!")) return null;
  const lines = [...normalized.matchAll(/^•\s*(.+?)\s*×\s*(\d+)\s*—\s*₹?\s*(\d+(?:\.\d+)?)$/gim)].map((match) => ({ name: match[1].trim(), quantity: Number(match[2]), lineTotal: Number(match[3]) }));
  const candidate = { serviceDate: date, customerName: name, phone, fulfilment: fulfilmentText, address: normalized.match(/^Address:\s*(.+)$/im)?.[1]?.trim() ?? "", notes: normalized.match(/^Notes:\s*(.+)$/im)?.[1]?.trim() ?? "", estimatedTotal: Number(totalText), lines };
  const result = parsedSchema.safeParse(candidate);
  return result.success ? result.data : null;
}

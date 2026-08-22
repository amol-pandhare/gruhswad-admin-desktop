import type { UnifiedOrderDetail } from "./contracts";

export const customerContactMilestones = ["confirmed", "ready", "cancelled"] as const;
export type CustomerContactMilestone = (typeof customerContactMilestones)[number];

export function canContactCustomer(status:string):status is CustomerContactMilestone {
  return customerContactMilestones.includes(status as CustomerContactMilestone);
}

export function buildOrderWhatsAppMessage(order:UnifiedOrderDetail):string {
  if(!canContactCustomer(order.status)) throw new Error("Customer WhatsApp is available only for confirmed, ready, or cancelled orders.");
  const timing=[order.serviceDate,order.serviceStartTime?`at ${order.serviceStartTime}`:""].filter(Boolean).join(" ");
  const greeting=`Namaste ${order.customerName}, regarding your Gruhswad order ${order.reference}:`;
  if(order.status==="confirmed") return `${greeting}\n\nYour order is confirmed for ${timing} (${order.fulfilment}). We will contact you if any final coordination is needed.`;
  if(order.status==="ready") return `${greeting}\n\nYour order is ready. Please coordinate with us for ${order.fulfilment}.`;
  return `${greeting}\n\nWe are sorry, this order has been cancelled. Please contact Gruhswad if you would like to discuss alternatives.`;
}

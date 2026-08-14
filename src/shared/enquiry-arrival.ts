import type { EnquiryArrivalEvent, EnquiryDetail } from "./contracts";

export function enquiryNotificationContent(items: EnquiryDetail[]) {
  const latest = items.at(-1);
  if (!latest) return null;
  const count = items.length;
  const detail = latest.requirements.guestCount
    ? ` - ${latest.requirements.guestCount} guests`
    : latest.requirements.peopleCount
      ? ` - ${latest.requirements.peopleCount} people`
      : "";
  return {
    target: latest,
    title: count === 1 ? `New ${latest.type} enquiry` : `${count} new Gruhswad enquiries`,
    body: count === 1 ? `${latest.reference} - ${latest.customer.name}${detail}` : "Click to review the latest enquiry.",
  };
}

export function enquiryArrivalFallback(event: EnquiryArrivalEvent) {
  if (event.notification === "shown") return null;
  return `${event.items.length} new ${event.items.length === 1 ? "enquiry" : "enquiries"} received. Native notification ${event.notification}.`;
}

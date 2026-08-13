import { describe, expect, it } from "vitest";
import type { EnquiryDetail } from "../src/shared/contracts";
import { enquiryArrivalFallback, enquiryNotificationContent } from "../src/shared/enquiry-arrival";

const enquiry = (id: string, requirements: Record<string, unknown> = {}): EnquiryDetail => ({
  id,
  reference: `ENQ-${id}`,
  type: "party",
  status: "new",
  seenAt: null,
  customer: { name: `Customer ${id}`, phone: "+919999999999" },
  address: null,
  requirements,
  items: [],
  source: "website",
  createdAt: "2026-08-13T12:00:00.000Z",
  updatedAt: "2026-08-13T12:00:00.000Z",
});

describe("enquiry arrival presentation", () => {
  it("uses the newest grouped enquiry as the click target", () => {
    const content = enquiryNotificationContent([enquiry("first"), enquiry("latest")]);
    expect(content?.target.id).toBe("latest");
    expect(content?.title).toBe("2 new Gruhswad enquiries");
  });

  it("includes a useful capacity summary for one enquiry", () => {
    expect(enquiryNotificationContent([enquiry("one", { guestCount: 24 })])?.body).toContain("24 guests");
  });

  it("falls back in-app unless native display was confirmed", () => {
    expect(enquiryArrivalFallback({ items: [enquiry("one")], notification: "shown" })).toBeNull();
    expect(enquiryArrivalFallback({ items: [enquiry("one")], notification: "failed" })).toMatch(/failed/);
  });
});

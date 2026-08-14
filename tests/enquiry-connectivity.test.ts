import { describe, expect, it } from "vitest";
import { isTransientEnquiryConnectionError, loadEnquiryCountSafely } from "../src/shared/enquiry-connectivity";

describe("enquiry connectivity", () => {
  it("recognizes Neon fetch failures with nested Undici timeouts", () => {
    const error = Object.assign(new Error("Error connecting to database: TypeError: fetch failed"), {
      sourceError: Object.assign(new TypeError("fetch failed"), {
        cause: Object.assign(new Error("Connect Timeout Error"), { code: "UND_ERR_CONNECT_TIMEOUT" }),
      }),
    });
    expect(isTransientEnquiryConnectionError(error)).toBe(true);
  });

  it("returns null for a temporary network failure so the previous badge can be retained", async () => {
    const load = () => Promise.reject(Object.assign(new Error("fetch failed"), { code: "ETIMEDOUT" }));
    await expect(loadEnquiryCountSafely(load)).resolves.toBeNull();
  });

  it("does not hide schema or permission errors", async () => {
    const error = Object.assign(new Error("permission denied for table enquiries"), { code: "42501" });
    await expect(loadEnquiryCountSafely(() => Promise.reject(error))).rejects.toBe(error);
  });
});

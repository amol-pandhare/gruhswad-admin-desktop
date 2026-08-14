const TRANSIENT_NETWORK_CODES = new Set([
  "UND_ERR_CONNECT_TIMEOUT",
  "UND_ERR_HEADERS_TIMEOUT",
  "UND_ERR_SOCKET",
  "ECONNRESET",
  "ECONNREFUSED",
  "ENETUNREACH",
  "ETIMEDOUT",
]);

type ErrorLike = { code?: unknown; message?: unknown; cause?: unknown; sourceError?: unknown };

export function isTransientEnquiryConnectionError(error: unknown): boolean {
  const pending: unknown[] = [error];
  const visited = new Set<unknown>();
  while (pending.length) {
    const current = pending.shift();
    if (!current || (typeof current !== "object" && typeof current !== "function") || visited.has(current)) continue;
    visited.add(current);
    const value = current as ErrorLike;
    if (TRANSIENT_NETWORK_CODES.has(String(value.code ?? ""))) return true;
    const message = String(value.message ?? "").toLowerCase();
    if (message.includes("fetch failed") || message.includes("connect timeout") || message.includes("network request failed")) return true;
    pending.push(value.cause, value.sourceError);
  }
  return false;
}

export async function loadEnquiryCountSafely(load: () => Promise<number>): Promise<number | null> {
  try {
    return await load();
  } catch (error) {
    if (isTransientEnquiryConnectionError(error)) return null;
    throw error;
  }
}

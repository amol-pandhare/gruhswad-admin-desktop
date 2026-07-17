import { createHmac, timingSafeEqual } from "node:crypto";
import type { VercelRequest } from "@vercel/node";

export function authorized(request: VercelRequest) { const token=request.headers.authorization?.replace(/^Bearer\s+/i,"")??"",expected=process.env.INBOX_API_TOKEN??""; const a=Buffer.from(token),b=Buffer.from(expected); return Boolean(expected)&&a.length===b.length&&timingSafeEqual(a,b); }
export function validMetaSignature(raw:Buffer,header:string|undefined){if(!header||!process.env.META_APP_SECRET)return false;const expected=`sha256=${createHmac("sha256",process.env.META_APP_SECRET).update(raw).digest("hex")}`;const a=Buffer.from(header),b=Buffer.from(expected);return a.length===b.length&&timingSafeEqual(a,b)}

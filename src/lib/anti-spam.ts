import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Invisible anti-spam helpers. All checks run in the server action BEFORE
 * any insert. No CAPTCHA, ever — the audience is entirely legitimate
 * internal staff.
 */

export { HONEYPOT_FIELD } from "./schema";

export const MIN_SUBMIT_MS = 3_000;
export const MAX_TOKEN_AGE_MS = 2 * 60 * 60 * 1000; // blocks indefinite replay

function sign(issuedAt: string, secret: string): string {
  return createHmac("sha256", secret).update(issuedAt).digest("hex");
}

function getSecret(): string {
  const secret = process.env.FORM_TOKEN_SECRET;
  if (!secret) throw new Error("FORM_TOKEN_SECRET is not set");
  return secret;
}

export function createFormToken(now: number = Date.now()): string {
  const issuedAt = String(now);
  return `${issuedAt}.${sign(issuedAt, getSecret())}`;
}

export type TokenVerdict = "valid" | "invalid" | "tooFast" | "expired";

export function verifyFormToken(
  token: string,
  now: number = Date.now(),
): TokenVerdict {
  const dot = token.indexOf(".");
  if (dot <= 0) return "invalid";
  const issuedAt = token.slice(0, dot);
  const signature = token.slice(dot + 1);
  if (!/^\d+$/.test(issuedAt)) return "invalid";

  const expected = sign(issuedAt, getSecret());
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return "invalid";

  const elapsed = now - Number(issuedAt);
  if (elapsed < MIN_SUBMIT_MS) return "tooFast";
  if (elapsed > MAX_TOKEN_AGE_MS) return "expired";
  return "valid";
}

/**
 * Best-effort tripwire; resets per lambda instance, which is fine — the DB's
 * unique index is the real backstop. Generous per-IP cap because this
 * audience arrives as an email/WhatsApp blast from behind corporate NAT:
 * many legitimate users share one egress IP at exactly the peak moment.
 */
const WINDOW_MS = 10 * 60 * 1000;
const MAX_PER_IP_EMAIL = 5;
const MAX_PER_IP = 50;
const SWEEP_THRESHOLD = 10_000;
const hits = new Map<string, number[]>();

function record(key: string, now: number): number {
  // Keep the map bounded on long-lived instances: sweep fully-stale keys
  // once it grows past the threshold.
  if (hits.size > SWEEP_THRESHOLD) {
    for (const [k, list] of hits) {
      if (list.every((t) => now - t >= WINDOW_MS)) hits.delete(k);
    }
  }
  const list = (hits.get(key) ?? []).filter((t) => now - t < WINDOW_MS);
  list.push(now);
  hits.set(key, list);
  return list.length;
}

export function isRateLimited(
  ip: string,
  email: string,
  now: number = Date.now(),
): boolean {
  const perPair = record(`${ip}|${email}`, now);
  const perIp = record(ip, now);
  return perPair > MAX_PER_IP_EMAIL || perIp > MAX_PER_IP;
}

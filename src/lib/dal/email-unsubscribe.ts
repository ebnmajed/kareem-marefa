import "server-only";
import { createServerClient } from "@/lib/supabase/server";

// The one-click unsubscribe — `REQ-NTF-019`, `DEC-289`.
//
// ★ NO SESSION, AND THAT IS THE REQUIREMENT, not an exception to «every DAL function calls `requireSession()`»: a
// member stops a message from the message itself, signed in or not, on any device (RFC 8058). The authority is the
// TOKEN, and it is checked in the database: `apply_email_unsubscribe()` (`0224`) recomputes the HMAC with the org's
// own secret, which no client role can read. This module never sees a secret and never names a member — it hands the
// token over and reports what was switched off. A forged, malformed or stale token is one answer: invalid.

/** The category a token names, read off its middle segment — for the confirmation page's words only. It decides
 *  nothing: the database refuses the token if this part was edited. */
export function tokenCategory(token: string): string | null {
  const parts = token.split(".");
  return parts.length === 3 && /^[a-z_]{1,32}$/.test(parts[1] ?? "") ? (parts[1] as string) : null;
}

export type UnsubscribeOutcome = { ok: true; category: string } | { ok: false };

export async function applyEmailUnsubscribe(token: string): Promise<UnsubscribeOutcome> {
  if (typeof token !== "string" || token.length > 200 || tokenCategory(token) === null) return { ok: false };
  const supabase = await createServerClient();
  const { data, error } = await supabase.rpc("apply_email_unsubscribe", { p_token: token });
  if (error || typeof data !== "string") return { ok: false };
  return { ok: true, category: data };
}

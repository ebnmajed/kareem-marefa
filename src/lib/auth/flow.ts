import "server-only";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { routing } from "@/i18n/routing";
import { safeNextPath } from "@/lib/auth/next-path";

// The sign-in flow's shared pieces (REQ-AUT-003, REQ-AUT-004, REQ-AUT-005,
// REQ-AUT-006, REQ-TEN-006). The platform is Arabic-first; every auth
// redirect lands on the Arabic route until the English catalogue exists.

export const PLATFORM_LOCALE = routing.defaultLocale;

export const provisionEnvelope = z.discriminatedUnion("status", [
  z.object({ status: z.literal("no_match") }),
  z.object({ status: z.literal("ambiguous"), orgs: z.array(z.object({ id: z.uuid(), name: z.string(), slug: z.string() })) }),
  z.object({
    status: z.enum(["member", "provisioned"]),
    org_id: z.uuid(),
    member_id: z.uuid(),
    org_status: z.enum(["active", "suspended"]),
    member_status: z.enum(["active", "deactivated"]),
  }),
]);
export type ProvisionEnvelope = z.infer<typeof provisionEnvelope>;

/** Calls provision_member() and validates the envelope's shape. */
export async function provision(supabase: SupabaseClient, orgId?: string): Promise<ProvisionEnvelope> {
  const { data, error } = await supabase.rpc("provision_member", orgId ? { p_org: orgId } : {});
  if (error) throw new Error(`provision_member: ${error.message}`);
  return provisionEnvelope.parse(data);
}

/**
 * Where a provisioning outcome sends the user. A new member's token was
 * minted before the row existed, so the caller refreshes the session after
 * `provisioned` (the hook adds the claims on the next token).
 */
export function destinationFor(envelope: ProvisionEnvelope, next: string | null | undefined): string {
  const base = `/${PLATFORM_LOCALE}`;
  switch (envelope.status) {
    case "no_match":
      return `${base}/no-access`;
    case "ambiguous":
      return `${base}/choose-org${next ? `?next=${encodeURIComponent(next)}` : ""}`;
    case "member":
    case "provisioned":
      if (envelope.org_status === "suspended") return `${base}/no-access?reason=suspended`;
      if (envelope.member_status === "deactivated") return `${base}/no-access?reason=deactivated`;
      return safeNextPath(next, PLATFORM_LOCALE);
  }
}

/** The site origin for OAuth redirects: SITE_URL in production, the request's origin otherwise. */
export function siteOrigin(requestUrl: string): string {
  return process.env.SITE_URL || new URL(requestUrl).origin;
}

import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createServerClient } from "@/lib/supabase/server";

// The session, at the data. 04 §5, REQ-NFR-004, DEC-014.
//
// Every DAL function calls requireSession() first. The check lives here —
// never in a layout, which Partial Rendering does not re-render on
// navigation — and proxy.ts only does an optimistic cookie check, so this
// is the boundary together with RLS.

export type OrgRole = "admin" | "moderator" | "member";

export interface Session {
  userId: string;
  orgId: string;
  memberId: string;
  role: OrgRole;
  claimsVersion: number;
  email: string | null;
  /** The `platform_admin` claim (DEC-052): the shell shows the platform console's link on it. */
  platformAdmin: boolean;
}

export type SessionState =
  | { kind: "none" }
  | { kind: "no_org"; userId: string; platformAdmin: boolean }
  | { kind: "suspended"; userId: string }
  | { kind: "deactivated"; userId: string }
  | { kind: "member"; session: Session };

type AppMetadata = {
  org_id?: string;
  member_id?: string;
  org_role?: OrgRole;
  status?: "active" | "deactivated";
  claims_version?: number;
  org_status?: "active" | "suspended";
  platform_admin?: boolean;
};

/**
 * Reads the verified claims and classifies them. Memoised per render pass.
 *
 * `getClaims()` returns a three-way union and `{ data: null, error: null }`
 * is a reachable NO-SESSION state. Narrow on `data`, never on `error`:
 * narrowing on `error` lets an unauthenticated request straight through.
 * tests/unit/dal-session.test.ts pins exactly that.
 */
export const getSessionState = cache(async (): Promise<SessionState> => {
  await cookies(); // [v16] async — and the dynamism marker: a route that reads a session is dynamic
  const supabase = await createServerClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) return { kind: "none" };

  const claims = data.claims as { sub: string; email?: string; app_metadata?: AppMetadata };
  const app = claims.app_metadata ?? {};
  if (!app.org_id || !app.member_id) {
    return { kind: "no_org", userId: claims.sub, platformAdmin: app.platform_admin === true };
  }
  if (app.org_status === "suspended") return { kind: "suspended", userId: claims.sub };
  if (app.status === "deactivated") return { kind: "deactivated", userId: claims.sub };
  return {
    kind: "member",
    session: {
      userId: claims.sub,
      orgId: app.org_id,
      memberId: app.member_id,
      role: app.org_role ?? "member",
      claimsVersion: app.claims_version ?? 0,
      email: claims.email ?? null,
      platformAdmin: app.platform_admin === true,
    },
  };
});

/** Where a non-member session belongs. */
export function pathForState(state: Exclude<SessionState, { kind: "member" }>, locale: string, next?: string): string {
  const base = `/${locale}`;
  switch (state.kind) {
    case "none":
      return `${base}/sign-in${next ? `?next=${encodeURIComponent(next)}` : ""}`;
    case "no_org":
      return `${base}/no-access`;
    case "suspended":
      return `${base}/no-access?reason=suspended`;
    case "deactivated":
      return `${base}/no-access?reason=deactivated`;
  }
}

/**
 * The session or a redirect. `next` is the path to return to after sign-in
 * (validated again by the sign-in route).
 */
export async function requireSession(locale: string, next?: string): Promise<Session> {
  const state = await getSessionState();
  if (state.kind === "member") return state.session;
  redirect(pathForState(state, locale, next));
}

/** A session-dependent client, for DAL modules. */
export async function sessionClient(locale: string, next?: string) {
  const session = await requireSession(locale, next);
  const supabase = await createServerClient();
  return { session, supabase };
}

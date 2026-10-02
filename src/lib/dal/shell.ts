import "server-only";
import { cache } from "react";
import { sessionClient } from "@/lib/dal/session";

// What the shell itself draws and no screen owns (REQ-UIX-054, wave 18).
//
// Two figures, both read with the caller's own client, so RLS is the boundary:
//   · the member's team colour, for the ring on the account avatar. `null` is a
//     company with no colour — the neutral ring — and also a member with no company;
//   · for staff, how many things wait for them — the navigation rail's count and
//     the home's «يحتاج انتباهك» (DEC-206 §4.32, §4.58). The same four queues as
//     the admin dashboard (`REQ-ADM-010`), as COUNTS: the dashboard's own read
//     carries ten queries and is an admin's alone.
//
// A moderator is staff and holds no read on the proposal queue's staff columns
// the way an admin does; each count is whatever RLS answers for the caller, and
// a query that is refused counts as zero rather than failing every screen.

export interface ShellAttention {
  proposals: number;
  unscheduled: number;
  photoReports: number;
  commentReports: number;
  total: number;
}

export interface ShellData {
  teamColor: string | null;
  /** ★ wave 21 (REQ-UIX-084): the org's name, for the console's bar. Add-only. */
  orgName?: string | null;
  /** `null` for a member who is not staff: the section is not rendered at all. */
  attention: ShellAttention | null;
}

export const getShellData = cache(async (locale: string): Promise<ShellData> => {
  const { session, supabase } = await sessionClient(locale);
  const isStaff = session.role === "admin" || session.role === "moderator";

  const company = supabase
    .from("members")
    .select("companies(team_color)")
    .eq("id", session.memberId)
    .maybeSingle();

  const count = async (query: PromiseLike<{ count: number | null; error: unknown }>) => {
    const { count: n, error } = await query;
    return error ? 0 : (n ?? 0);
  };

  const [me, org, proposals, unscheduled, photoReports, commentReports] = await Promise.all([
    company,
    supabase.from("orgs").select("name").eq("id", session.orgId).maybeSingle(),
    isStaff
      ? count(supabase.from("proposals").select("id", { count: "exact", head: true }).eq("org_id", session.orgId).in("state", ["submitted", "in_review"]))
      : 0,
    isStaff
      ? count(supabase.from("sessions").select("id", { count: "exact", head: true }).eq("org_id", session.orgId).is("starts_at", null).not("state", "in", "(cancelled,archived)"))
      : 0,
    isStaff
      ? count(supabase.from("reports").select("id", { count: "exact", head: true }).eq("org_id", session.orgId).eq("target", "photo").eq("status", "open"))
      : 0,
    isStaff
      ? count(supabase.from("reports").select("id", { count: "exact", head: true }).eq("org_id", session.orgId).eq("target", "comment").eq("status", "open"))
      : 0,
  ]);

  const teamColor = (me.data as { companies: { team_color: string | null } | null } | null)?.companies?.team_color ?? null;
  return {
    teamColor,
    orgName: (org.data as { name: string } | null)?.name ?? null,
    attention: isStaff
      ? { proposals, unscheduled, photoReports, commentReports, total: proposals + unscheduled + photoReports + commentReports }
      : null,
  };
});

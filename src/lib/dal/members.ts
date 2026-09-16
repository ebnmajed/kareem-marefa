import "server-only";
import { z } from "zod";
import { sessionClient } from "@/lib/dal/session";
import { getMemberStanding, type MemberStanding } from "@/lib/dal/leaderboards";
import { getMemberRecognition, type MemberRecognition } from "@/lib/dal/recognition";
import { listSessionsPresentedBy, type PresentedSession } from "@/lib/dal/sessions";

// Members and profiles. Every function returns a DTO, never a row, and the
// two visibility tiers (REQ-PRF-004, A33) are a DAL guarantee: someone
// else's profile comes from `members_member_view`, whose column set IS the
// member tier; the member's own comes from the `me()` RPC.

export interface MemberTier {
  id: string;
  displayName: string | null;
  avatarUrl: string | null;
  companyId: string | null;
  jobTitle: string | null;
  bio: string | null;
  role: "admin" | "moderator" | "member";
  createdAt: string;
}

export interface SelfProfile extends MemberTier {
  email: string;
  status: "active" | "deactivated";
  leaderboardOptOut: boolean;
}

export interface Company {
  id: string;
  name: string;
}

export async function getMe(locale: string): Promise<SelfProfile> {
  const { supabase } = await sessionClient(locale);
  const { data, error } = await supabase.rpc("me");
  if (error || !data) throw new Error(`me(): ${error?.message ?? "no row"}`);
  const m = data as Record<string, unknown>;
  return {
    id: m.id as string,
    email: m.email as string,
    displayName: (m.display_name as string) ?? null,
    avatarUrl: (m.avatar_url as string) ?? null,
    companyId: (m.company_id as string) ?? null,
    jobTitle: (m.job_title as string) ?? null,
    bio: (m.bio as string) ?? null,
    role: m.org_role as SelfProfile["role"],
    status: m.status as SelfProfile["status"],
    leaderboardOptOut: Boolean(m.leaderboard_opt_out),
    createdAt: m.created_at as string,
  };
}

/** Another member, at the member tier. Null when not visible (other org, deactivated). */
export async function getMemberProfile(locale: string, id: string): Promise<MemberTier | null> {
  if (!z.uuid().safeParse(id).success) return null;
  const { supabase } = await sessionClient(locale);
  const { data, error } = await supabase
    .from("members_member_view")
    .select("id, display_name, avatar_url, company_id, job_title, bio, org_role, created_at")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`members_member_view: ${error.message}`);
  if (!data) return null;
  return {
    id: data.id,
    displayName: data.display_name,
    avatarUrl: data.avatar_url,
    companyId: data.company_id,
    jobTitle: data.job_title,
    bio: data.bio,
    role: data.org_role,
    createdAt: data.created_at,
  };
}

export async function listCompanies(locale: string): Promise<Company[]> {
  const { supabase } = await sessionClient(locale);
  const { data, error } = await supabase.from("companies").select("id, name").is("deactivated_at", null).order("name");
  if (error) throw new Error(`companies: ${error.message}`);
  return (data ?? []).map((c) => ({ id: c.id, name: c.name }));
}

export const profileInput = z.object({
  displayName: z.string().trim().min(1).max(120),
  companyId: z.uuid().nullable(),
  jobTitle: z.string().trim().max(120).nullable(),
  bio: z.string().trim().max(600).nullable(),
  leaderboardOptOut: z.boolean(),
});
export type ProfileInput = z.infer<typeof profileInput>;

/**
 * Self-service fields only. Authority is not in the input: the row is the
 * session's own member, and the column grant on `members` (0004) refuses
 * anything beyond these five columns regardless of what is sent.
 */
export async function updateMyProfile(locale: string, input: ProfileInput): Promise<void> {
  const { session, supabase } = await sessionClient(locale);
  const { error } = await supabase
    .from("members")
    .update({
      display_name: input.displayName,
      company_id: input.companyId,
      job_title: input.jobTitle || null,
      bio: input.bio || null,
      leaderboard_opt_out: input.leaderboardOptOut,
    })
    .eq("id", session.memberId);
  if (error) throw new Error(`members.update: ${error.message}`);
}

// ── SCR-020 — a profile, at the viewer's tier (wave 7, DEC-141 ruling 4) ────

export type ProfileTier = "self" | "member" | "admin";

/** A33's admin-only rows, from `admin_member_profile()` — never assembled from tables a moderator can also read. */
export interface AdminProfileRecord {
  email: string;
  attendedCount: number;
  attended: { sessionId: string; title: string; startsAt: string | null }[];
  noShowCount: number;
  lateCancelCount: number;
}

export interface MemberProfileView {
  tier: ProfileTier;
  profile: MemberTier;
  companyName: string | null;
  interests: { id: string; name: string }[];
  /** Points, rank and level. `null` when the member opted out of the boards and the viewer is neither them nor an admin. */
  standing: MemberStanding | null;
  recognition: MemberRecognition;
  presented: PresentedSession[];
  /** Present on the admin tier only. */
  adminRecord: AdminProfileRecord | null;
  /** The org's zone, for «عضو منذ». */
  timeZone: string;
}

/**
 * ★ TIERING IS A DAL GUARANTEE (REQ-PRF-004, A33), so the tier is decided HERE
 * and a field a tier may not see never leaves this function:
 *
 *   self    the member reading their own profile — the member tier's rows;
 *           everything self-only lives in `/app/me`, which is theirs to edit
 *   member  anyone else in the org, a MODERATOR included (A33)
 *   admin   an org admin — the member tier plus `admin_member_profile()`,
 *           whose own gate is `is_org_admin()` re-read in the database
 *
 * ★ An opted-out member's points and rank are hidden on the member tier
 * (DEC-141 ruling 5). The rank already is — `all_time_leaderboard()` omits them
 * for others — but `points_balances` is org-readable, and a total shown on a
 * profile is the number the board withholds.
 *
 * `null` for an id that is not an active member of the viewer's org
 * (`members_member_view`), so the page answers not-found for all of them alike.
 */
export async function getMemberProfileForViewer(locale: string, id: string): Promise<MemberProfileView | null> {
  const profile = await getMemberProfile(locale, id);
  if (!profile) return null;
  const { session, supabase } = await sessionClient(locale);
  const tier: ProfileTier = id === session.memberId ? "self" : session.role === "admin" ? "admin" : "member";

  const [optOutRes, companyRes, interestsRes, settingsRes, standing, recognition, presented, adminRes] = await Promise.all([
    supabase.from("members").select("leaderboard_opt_out").eq("id", id).maybeSingle(),
    profile.companyId ? supabase.from("companies").select("name").eq("id", profile.companyId).maybeSingle() : Promise.resolve({ data: null, error: null }),
    supabase.from("member_interests").select("category_id, categories(name)").eq("member_id", id),
    supabase.from("org_settings").select("time_zone").eq("org_id", session.orgId).maybeSingle(),
    getMemberStanding(locale, id),
    getMemberRecognition(locale, id),
    listSessionsPresentedBy(locale, id),
    tier === "admin" ? supabase.rpc("admin_member_profile", { p_member: id }) : Promise.resolve({ data: null, error: null }),
  ]);
  if (optOutRes.error) throw new Error(`members: ${optOutRes.error.message}`);
  if (interestsRes.error) throw new Error(`member_interests: ${interestsRes.error.message}`);
  if (adminRes.error) throw new Error(`admin_member_profile: ${adminRes.error.message}`);

  type CategoryJoin = { name: string } | { name: string }[] | null;
  const interests = (interestsRes.data ?? []).flatMap((row) => {
    const joined = row.categories as CategoryJoin;
    const category = Array.isArray(joined) ? joined[0] : joined;
    return category ? [{ id: row.category_id as string, name: category.name }] : [];
  });

  type AdminRow = { email: string; attended_count: number; attended: { session_id: string; title: string; starts_at: string | null }[]; no_show_count: number; late_cancel_count: number };
  const adminRow = tier === "admin" ? ((adminRes.data as AdminRow[] | null) ?? [])[0] : undefined;

  return {
    tier,
    profile,
    companyName: (companyRes.data as { name: string } | null)?.name ?? null,
    interests,
    standing: tier === "member" && optOutRes.data?.leaderboard_opt_out ? null : standing,
    recognition,
    presented,
    adminRecord: adminRow
      ? {
          email: adminRow.email,
          attendedCount: adminRow.attended_count,
          attended: (adminRow.attended ?? []).map((a) => ({ sessionId: a.session_id, title: a.title, startsAt: a.starts_at })),
          noShowCount: adminRow.no_show_count,
          lateCancelCount: adminRow.late_cancel_count,
        }
      : null,
    timeZone: (settingsRes.data?.time_zone as string | undefined) ?? "Asia/Riyadh",
  };
}

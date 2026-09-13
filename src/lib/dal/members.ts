import "server-only";
import { z } from "zod";
import { sessionClient } from "@/lib/dal/session";

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

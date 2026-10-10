import "server-only";
import { cache } from "react";
import { z } from "zod";
import { sessionClient } from "@/lib/dal/session";
import { avatarHref } from "@/lib/dal/avatars";
import { getMemberMonthRank, getMemberStanding, type MemberStanding } from "@/lib/dal/leaderboards";
import { listPhotosByUploader, type UploaderPhotos } from "@/lib/dal/photos";
import { getMemberLevel, levelProgress } from "@/lib/dal/points";
import { getPresenterAggregate } from "@/lib/dal/ratings";
import { countActiveBadges, getMemberRecognition, type MemberRecognition } from "@/lib/dal/recognition";
import { countSessionsPresentedBy, getSessionsPresented, type PresentedSession, type PresentedSessionWithAttendance } from "@/lib/dal/sessions";

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
  /** ★ wave 20, add-only (the lead's grant): `#rrggbb` or null — reaches the DOM only as `--team` (SCR-021's dot). */
  teamColor?: string | null;
}

// Request-scoped: the app layout, the console layout and the hub page each read it once per render.
export const getMe = cache(async (locale: string): Promise<SelfProfile> => {
  const { supabase } = await sessionClient(locale);
  const { data, error } = await supabase.rpc("me");
  if (error || !data) throw new Error(`me(): ${error?.message ?? "no row"}`);
  const m = data as Record<string, unknown>;
  return {
    id: m.id as string,
    email: m.email as string,
    displayName: (m.display_name as string) ?? null,
    // ★ DEC-099: never `me()`'s `avatar_url` (Google's source). Our stored copy
    // through contract 4's one resolver, or null → initials (DEC-182).
    avatarUrl: avatarHref({ id: m.id as string, avatarVersion: m.avatar_version as number | null, avatarKey: m.avatar_key as string | null }, 96),
    companyId: (m.company_id as string) ?? null,
    jobTitle: (m.job_title as string) ?? null,
    bio: (m.bio as string) ?? null,
    role: m.org_role as SelfProfile["role"],
    status: m.status as SelfProfile["status"],
    leaderboardOptOut: Boolean(m.leaderboard_opt_out),
    createdAt: m.created_at as string,
  };
});

/** Another member, at the member tier. Null when not visible (other org, deactivated). */
export async function getMemberProfile(locale: string, id: string): Promise<MemberTier | null> {
  if (!z.uuid().safeParse(id).success) return null;
  const { supabase } = await sessionClient(locale);
  const { data, error } = await supabase
    .from("members_member_view")
    .select("id, display_name, avatar_version, avatar_key, company_id, job_title, bio, org_role, created_at")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`members_member_view: ${error.message}`);
  if (!data) return null;
  return {
    id: data.id,
    displayName: data.display_name,
    avatarUrl: avatarHref({ id: data.id, avatarVersion: data.avatar_version, avatarKey: data.avatar_key }, 192), // DEC-099: our copy, never Google's URL
    companyId: data.company_id,
    jobTitle: data.job_title,
    bio: data.bio,
    role: data.org_role,
    createdAt: data.created_at,
  };
}

export async function listCompanies(locale: string): Promise<Company[]> {
  const { supabase } = await sessionClient(locale);
  const { data, error } = await supabase.from("companies").select("id, name, team_color").is("deactivated_at", null).order("name");
  if (error) throw new Error(`companies: ${error.message}`);
  return (data ?? []).map((c) => ({ id: c.id, name: c.name, teamColor: (c.team_color as string | null) ?? null }));
}

// ★ wave 27 (`DEC-254` §2.5, `REQ-PRF-012`): no `companyId`, and `.strict()` — a member's company follows their email
// domain or an admin's placement, never their own edit. The column leaves the member's update grant after PR B merges.
export const profileInput = z
  .object({
  displayName: z.string().trim().min(1).max(120),
  jobTitle: z.string().trim().max(120).nullable(),
  bio: z.string().trim().max(600).nullable(),
  // ★ wave 20 (DEC-218): optional. The opt-out leaves the profile form for `/app/me/settings`; a profile save that
  // does not send it must not write it, or every save after the move would opt the member back in.
  leaderboardOptOut: z.boolean().optional(),
  })
  .strict();
export type ProfileInput = z.infer<typeof profileInput>;

/**
 * Self-service fields only. Authority is not in the input: the row is the
 * session's own member, and the column grant on `members` (0004) refuses
 * anything beyond these columns regardless of what is sent. ★ wave 27: `company_id` is never in the payload — PostgREST
 * names only the payload's columns, so the save passes before and after the column leaves the grant.
 */
export async function updateMyProfile(locale: string, input: ProfileInput): Promise<void> {
  const { session, supabase } = await sessionClient(locale);
  const { error } = await supabase
    .from("members")
    .update({
      display_name: input.displayName,
      job_title: input.jobTitle || null,
      bio: input.bio || null,
      ...(input.leaderboardOptOut === undefined ? {} : { leaderboard_opt_out: input.leaderboardOptOut }),
    })
    .eq("id", session.memberId);
  if (error) throw new Error(`members.update: ${error.message}`);
}

/**
 * ★ wave 20 (DEC-218, REQ-LDR-008, REQ-UIX-077): the leaderboard opt-out alone — `/app/me/settings`' switch. Add-only.
 * The row is the session's own member; the same column grant and `members_update_self` policy (0004) are the
 * boundary. One column, so a member with no display name can still switch it, and nothing else is rewritten.
 */
export async function setLeaderboardOptOut(locale: string, optOut: boolean): Promise<void> {
  const { session, supabase } = await sessionClient(locale);
  const { error } = await supabase.from("members").update({ leaderboard_opt_out: z.boolean().parse(optOut) }).eq("id", session.memberId);
  if (error) throw new Error(`members.update (opt-out): ${error.message}`);
}

// ── SCR-020 — a profile, at the viewer's tier (wave 7, DEC-141 ruling 4) ────

export type ProfileTier = "self" | "member" | "admin";

/** The rows the profile draws — four in the artboards (`ProfileDesktop.dc.html:55-60`); the rest behind «عرض …». */
const PROFILE_PRESENTED_LIMIT = 12;
/** Five tiles and «+N» (`Profile.dc.html:72`). */
const PROFILE_PHOTOS_LIMIT = 5;

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

  // ── wave 19 (SCR-020 rebuilt, REQ-UIX-069, DEC-213 §5.114 – §5.121, DEC-214), add-only ──
  /** The member's company with its team colour (`--team`, REQ-UIX-043). `companyName` above is the same name. */
  company: { id: string; name: string; teamColor: string | null } | null;
  /** ★ Every tier, opted out or not (DEC-213 §5.116): the level is A33 tier 1. Null until evaluated. */
  level: { tier: number; name: string } | null;
  /** The bar and its line. ★ Null whenever `standing` is (withheld), with no level, or at the top (`next: null`, full). */
  progress: { value: number; max: number; remaining: number; next: string | null } | null;
  /** This month's rank (DEC-213 §5.114 — never a week). ★ Null when `standing` is, or absent; the database withholds
   *  an opted-out member's row from everyone but themselves (DEC-214 §1, N8). */
  monthRank: number | null;
  /** «N من M»'s M — the org's badges not retired (DEC-213 §5.121). */
  badgeCatalogue: number;
  /** ★ Contract 4's count: DELIVERED sessions only, a count and never a page's length (DEC-213 §5.120, DEC-214 §2). */
  presentedCount: number;
  /** Contract 4's rows, with the attendance count — and an average on the self and admin tiers only. */
  presentedRows: (PresentedSessionWithAttendance & { average: number | null })[];
  /** Contract 3 — the photographs this member uploaded that the caller may see; never a tagged one. */
  photos: UploaderPhotos;
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

  const [optOutRes, companyRes, interestsRes, settingsRes, standing, recognition, presentedRes, adminRes, memberLevel, monthRank, badgeCatalogue, photos] = await Promise.all([
    supabase.from("members").select("leaderboard_opt_out").eq("id", id).maybeSingle(),
    profile.companyId ? supabase.from("companies").select("name, team_color").eq("id", profile.companyId).maybeSingle() : Promise.resolve({ data: null, error: null }),
    supabase.from("member_interests").select("category_id, categories(name)").eq("member_id", id),
    supabase.from("org_settings").select("time_zone").eq("org_id", session.orgId).maybeSingle(),
    getMemberStanding(locale, id),
    getMemberRecognition(locale, id),
    getSessionsPresented(locale, id, PROFILE_PRESENTED_LIMIT),
    tier === "admin" ? supabase.rpc("admin_member_profile", { p_member: id }) : Promise.resolve({ data: null, error: null }),
    getMemberLevel(locale, id),
    getMemberMonthRank(locale, id),
    countActiveBadges(locale),
    listPhotosByUploader(locale, id, { limit: PROFILE_PHOTOS_LIMIT }),
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

  // ★ DEC-141 r5: an opted-out member's points and ranks are withheld from the MEMBER tier; the level is not.
  const withheld = tier === "member" && Boolean(optOutRes.data?.leaderboard_opt_out);
  const companyRow = companyRes.data as { name: string; team_color?: string | null } | null;
  const progress =
    withheld || !memberLevel.level
      ? null
      : (() => {
          const bar = levelProgress(memberLevel.totalPoints, memberLevel.level, memberLevel.next);
          if (!bar) return null;
          return { ...bar, remaining: memberLevel.next ? Math.max(0, memberLevel.next.threshold - memberLevel.totalPoints) : 0, next: memberLevel.next?.name ?? null };
        })();

  // ★ A33 («aggregate ratings received») and DEC-213 §5.115: an average on the self and admin tiers ONLY — it is
  // never read for a colleague, a moderator included. `session_rating_aggregates` withholds below the org's minimum
  // (REQ-RAT-006), so null is «not drawn».
  const presentedRows = await Promise.all(
    presentedRes.sessions.map(async (s) => {
      if (tier === "member" || (s.state !== "completed" && s.state !== "archived")) return { ...s, average: null };
      const aggregate = await getPresenterAggregate(locale, s.id);
      return { ...s, average: aggregate?.presenterAvg ?? aggregate?.sessionAvg ?? null };
    }),
  );

  return {
    tier,
    profile,
    companyName: companyRow?.name ?? null,
    interests,
    standing: withheld ? null : standing,
    recognition,
    presented: presentedRes.sessions,
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
    company: profile.companyId && companyRow ? { id: profile.companyId, name: companyRow.name, teamColor: companyRow.team_color ?? null } : null,
    level: memberLevel.level ? { tier: memberLevel.level.tier, name: memberLevel.level.name } : null,
    progress,
    monthRank: withheld ? null : monthRank,
    badgeCatalogue,
    presentedCount: presentedRes.count,
    presentedRows,
    photos,
  };
}

// ── SCR-019 — the directory (wave 19, REQ-UIX-068, REQ-PRF-005, DEC-213 §5.106 – §5.113), add-only ─────────
//
// ★ TIER 1 ONLY LEAVES THIS FUNCTION (A33, contract 7). A row is a name, an avatar, a job title, a role, a company
// with its colour, a level and how many sessions the member delivered — never an email, points, a rank or the
// opt-out flag. The component that draws it decides nothing about who may see what; it receives a page.
//
// ★ NEVER ANOTHER ORG (REQ-TEN-003): `members_read_org` is the boundary, and `org_id` is filtered here as well,
// in defence. ★ DEACTIVATED MEMBERS ARE LEFT OUT unless an ADMIN asks (REQ-PRF-005): for everyone else the read is
// `members_member_view`, which holds only active members, whatever the query string says. An anonymised member —
// no name left — is left out for an admin too: a row with no one on it says nothing.
//
// Assembled from reads every member already has (`members`, `companies`, `points_balances` → `levels`,
// `member_interests` → `categories`, and contract 4's batch count), then filtered, ordered and paged here — one
// org's member list per request, and no SQL. «الأنشط أولًا» is the sessions DELIVERED, then the name (DEC-213
// §5.106, DEC-214 §2); the name is Arabic collation.

export const DIRECTORY_PAGE_SIZE = 24;
const DIRECTORY_MAX_PAGES = 50;

export type DirectoryOrder = "active" | "name";

export interface DirectoryQuery {
  /** Name or job title, folded (`foldArabic`). */
  q?: string;
  companyId?: string;
  interestId?: string;
  order: DirectoryOrder;
  /** Cumulative: page N is the first N × 24 matches, so a cold URL renders the same list (DEC-213 §5.110). */
  page: number;
  /** Honoured for an admin only. */
  includeDeactivated?: boolean;
}

export interface DirectoryMember {
  id: string;
  displayName: string;
  avatarUrl: string | null;
  jobTitle: string | null;
  role: "admin" | "moderator" | "member";
  company: { id: string; name: string; teamColor: string | null } | null;
  /** `levels.sort_order` and the name; null until evaluated. Shown opted out or not (DEC-213 §5.111). */
  level: { tier: number; name: string } | null;
  /** ★ Sessions DELIVERED — contract 4's batch, the same figure the profile's heading says. */
  presentedCount: number;
  /** Only on an admin's list with deactivated members shown — marked, never a link. */
  deactivated?: true;
}

export interface DirectoryPage {
  members: DirectoryMember[];
  /** The filtered total — «N من M»'s M. */
  matched: number;
  /** Every member this viewer may list — the title's count. */
  total: number;
  /** Companies with at least one listed member, by name. */
  companies: { id: string; name: string; teamColor: string | null }[];
  /** Interests recorded in the org; empty → the row is not drawn (DEC-213 §5.107). */
  interests: { id: string; name: string }[];
  canShowDeactivated: boolean;
  /** The page actually served, after clamping. */
  page: number;
}

const TASHKEEL = /[ً-ٰٟـ]/g;

/** Search folding, pure — exported for its unit test. Case, tashkīl and tatwīl dropped; the hamza-bearing alifs to
 *  ا, ة to ه, ى to ي; whitespace collapsed. A search for «احمد» finds «أحمد». */
export function foldArabic(text: string): string {
  return text
    .normalize("NFKC")
    .toLowerCase()
    .replace(TASHKEEL, "")
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .replace(/\s+/g, " ")
    .trim();
}

const collator = new Intl.Collator("ar");

/** The order, pure — exported for its unit test. */
export function orderDirectory<T extends { displayName: string; presentedCount: number; id: string }>(rows: T[], order: DirectoryOrder): T[] {
  return [...rows].sort(
    (a, b) =>
      (order === "active" ? b.presentedCount - a.presentedCount : 0) || collator.compare(a.displayName, b.displayName) || a.id.localeCompare(b.id),
  );
}

type DirectoryRow = { id: string; display_name: string | null; avatar_version: number | null; avatar_key?: string | null; company_id: string | null; job_title: string | null; org_role: DirectoryMember["role"]; status?: string };

export async function listDirectory(locale: string, query: DirectoryQuery): Promise<DirectoryPage> {
  const { session, supabase } = await sessionClient(locale);
  const isAdmin = session.role === "admin";
  const withDeactivated = isAdmin && Boolean(query.includeDeactivated);
  const page = Math.min(DIRECTORY_MAX_PAGES, Math.max(1, Math.floor(Number.isFinite(query.page) ? query.page : 1)));

  const membersRead = withDeactivated
    ? supabase.from("members").select("id, display_name, avatar_version, avatar_key, company_id, job_title, org_role, status").eq("org_id", session.orgId)
    : supabase.from("members_member_view").select("id, display_name, avatar_version, avatar_key, company_id, job_title, org_role").eq("org_id", session.orgId);

  const [membersRes, companiesRes, balancesRes, levelsRes, interestsRes, counts] = await Promise.all([
    membersRead,
    supabase.from("companies").select("id, name, team_color").eq("org_id", session.orgId),
    supabase.from("points_balances").select("member_id, current_level_id").eq("org_id", session.orgId),
    supabase.from("levels").select("id, name, sort_order").eq("org_id", session.orgId),
    supabase.from("member_interests").select("member_id, category_id, categories(name)").eq("org_id", session.orgId),
    countSessionsPresentedBy(locale),
  ]);
  if (membersRes.error) throw new Error(`members (directory): ${membersRes.error.message}`);
  if (companiesRes.error) throw new Error(`companies (directory): ${companiesRes.error.message}`);
  if (balancesRes.error) throw new Error(`points_balances (directory): ${balancesRes.error.message}`);
  if (levelsRes.error) throw new Error(`levels (directory): ${levelsRes.error.message}`);
  if (interestsRes.error) throw new Error(`member_interests (directory): ${interestsRes.error.message}`);

  const companyById = new Map(((companiesRes.data ?? []) as { id: string; name: string; team_color: string | null }[]).map((c) => [c.id, { id: c.id, name: c.name, teamColor: c.team_color ?? null }]));
  const levelById = new Map(((levelsRes.data ?? []) as { id: string; name: string; sort_order: number }[]).map((l) => [l.id, { tier: l.sort_order, name: l.name }]));
  const levelOf = new Map(((balancesRes.data ?? []) as { member_id: string; current_level_id: string | null }[]).map((b) => [b.member_id, b.current_level_id ? (levelById.get(b.current_level_id) ?? null) : null]));

  type InterestJoin = { name: string } | { name: string }[] | null;
  const interestNames = new Map<string, string>();
  const interestsOf = new Map<string, Set<string>>();
  for (const row of (interestsRes.data ?? []) as { member_id: string; category_id: string; categories: InterestJoin }[]) {
    const joined = Array.isArray(row.categories) ? row.categories[0] : row.categories;
    if (!joined) continue;
    interestNames.set(row.category_id, joined.name);
    interestsOf.set(row.member_id, (interestsOf.get(row.member_id) ?? new Set()).add(row.category_id));
  }

  const all: DirectoryMember[] = ((membersRes.data ?? []) as DirectoryRow[])
    // An anonymised member has no name left (0073); a deactivated one only reaches here on an admin's ask.
    .filter((m) => Boolean(m.display_name?.trim()))
    .map((m) => ({
      id: m.id,
      displayName: (m.display_name as string).trim(),
      avatarUrl: avatarHref({ id: m.id, avatarVersion: m.avatar_version, avatarKey: m.avatar_key }, 96), // DEC-099: our copy, never Google's URL
      jobTitle: m.job_title ?? null,
      role: m.org_role,
      company: m.company_id ? (companyById.get(m.company_id) ?? null) : null,
      level: levelOf.get(m.id) ?? null,
      presentedCount: counts[m.id] ?? 0,
      ...(m.status && m.status !== "active" ? { deactivated: true as const } : {}),
    }));

  const needle = query.q ? foldArabic(query.q) : "";
  const matching = all.filter(
    (m) =>
      (!needle || foldArabic(m.displayName).includes(needle) || (m.jobTitle !== null && foldArabic(m.jobTitle).includes(needle))) &&
      (!query.companyId || m.company?.id === query.companyId) &&
      (!query.interestId || Boolean(interestsOf.get(m.id)?.has(query.interestId))),
  );
  const ordered = orderDirectory(matching, query.order);

  const listedCompanies = new Set(all.flatMap((m) => (m.company ? [m.company.id] : [])));
  return {
    members: ordered.slice(0, page * DIRECTORY_PAGE_SIZE),
    matched: ordered.length,
    total: all.length,
    companies: [...companyById.values()].filter((c) => listedCompanies.has(c.id)).sort((a, b) => collator.compare(a.name, b.name)),
    interests: [...interestNames.entries()].map(([id, name]) => ({ id, name })).sort((a, b) => collator.compare(a.name, b.name)),
    canShowDeactivated: isAdmin,
    page,
  };
}

// ── SCR-021 — my interests (wave 20, DEC-218 §4.2; `content`, add-only, the lead's grant as custodian) ──────────────
//
// `REQ-PRF-001`: «اهتماماتي — topics of interest, from the org's تصنيفات». `member_interests` (0004:326) has had its
// self-write policies and grant since M1 and NO writer in `src/` until now — the rebuild found it (`DEC-208`).

export interface MyInterests {
  /** The member's own, by name — a deactivated category still shows, so nothing they chose silently vanishes. */
  chosen: { id: string; name: string }[];
  /** What may be chosen: the org's active categories, by name. */
  options: { id: string; name: string }[];
}

export async function getMyInterests(locale: string): Promise<MyInterests> {
  const { session, supabase } = await sessionClient(locale);
  const [chosenRes, optionsRes] = await Promise.all([
    supabase.from("member_interests").select("category_id, categories(name)").eq("member_id", session.memberId),
    supabase.from("categories").select("id, name").eq("org_id", session.orgId).is("deactivated_at", null).order("name"),
  ]);
  if (chosenRes.error) throw new Error(`member_interests (mine): ${chosenRes.error.message}`);
  if (optionsRes.error) throw new Error(`categories (interests): ${optionsRes.error.message}`);
  const collator = new Intl.Collator(locale);
  const chosen = ((chosenRes.data ?? []) as { category_id: string; categories: { name: string } | { name: string }[] | null }[])
    .flatMap((row) => {
      const joined = Array.isArray(row.categories) ? row.categories[0] : row.categories;
      return joined ? [{ id: row.category_id, name: joined.name }] : [];
    })
    .sort((a, b) => collator.compare(a.name, b.name));
  return { chosen, options: (optionsRes.data ?? []).map((c) => ({ id: c.id as string, name: c.name as string })) };
}

export const interestsInput = z.array(z.uuid()).max(50);

/**
 * Replaces the member's interests with `categoryIds`. Authority is not in the input: the rows are the SESSION's
 * member's (`p3_self_*`), and an id that is not one of the org's active categories is dropped here — the policy checks
 * the member and the org, not the category's org, so this filter is what keeps another org's id out.
 */
export async function setMyInterests(locale: string, categoryIds: string[]): Promise<void> {
  const ids = [...new Set(interestsInput.parse(categoryIds))];
  const { session, supabase } = await sessionClient(locale);
  const [valid, current] = await Promise.all([
    ids.length ? supabase.from("categories").select("id").eq("org_id", session.orgId).is("deactivated_at", null).in("id", ids) : Promise.resolve({ data: [], error: null }),
    supabase.from("member_interests").select("category_id").eq("member_id", session.memberId),
  ]);
  if (valid.error) throw new Error(`categories (interests): ${valid.error.message}`);
  if (current.error) throw new Error(`member_interests (mine): ${current.error.message}`);
  const held = new Set(((current.data ?? []) as { category_id: string }[]).map((r) => r.category_id));
  // An active category of the org, or one already held — a category deactivated since it was chosen is kept while
  // the member keeps it, and never added anew.
  const wanted = new Set([...((valid.data ?? []) as { id: string }[]).map((c) => c.id), ...ids.filter((id) => held.has(id))]);

  const add = [...wanted].filter((id) => !held.has(id));
  const drop = [...held].filter((id) => !wanted.has(id));
  if (drop.length) {
    const { error } = await supabase.from("member_interests").delete().eq("member_id", session.memberId).in("category_id", drop);
    if (error) throw new Error(`member_interests.delete: ${error.message}`);
  }
  if (add.length) {
    const { error } = await supabase
      .from("member_interests")
      .insert(add.map((category_id) => ({ org_id: session.orgId, member_id: session.memberId, category_id })));
    if (error) throw new Error(`member_interests.insert: ${error.message}`);
  }
}

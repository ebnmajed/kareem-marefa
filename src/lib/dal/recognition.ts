import "server-only";
import { z } from "zod";
import { sessionClient } from "@/lib/dal/session";

// Recognition as a PROFILE shows it — badges and the current streak (SCR-020,
// REQ-PRF-004's A33 member tier, REQ-REC-*), wave 7 (DEC-137, add-only).
//
// `member_badges`, `badges` and `streak_awards` are org-readable (P1, `0027`),
// so what a member sees about a colleague here is exactly what the policies
// already allow; nothing is widened. The admin screens read and edit the same
// tables through `scoring-admin.ts`, which this module does not touch.

export interface MemberBadge {
  id: string;
  name: string;
  description: string | null;
  awardedAt: string;
  /** wave 19, add-only: the badge has been retired — still held and shown, not counted in «N من M» (DEC-213 §5.121). */
  retired?: boolean;
  /** wave 19, add-only: `badges.rule->>'metric'` — what the profile derives the medallion's fill and glyph from
   *  (DEC-214 §3, N1). A fixed vocabulary even for a badge an admin made (`REQ-REC-001`); null when absent. */
  metric?: string | null;
}

export interface MemberRecognition {
  badges: MemberBadge[];
  /** Consecutive monthly streak periods ending this month or last; 0 when the run has broken. */
  streakMonths: number;
}

/** The count of consecutive months, newest first, ending no earlier than last month. */
export function currentStreak(periodStarts: string[], now: Date = new Date()): number {
  const months = [...new Set(periodStarts.map((d) => d.slice(0, 7)))].sort().reverse();
  if (months.length === 0) return 0;
  const monthIndex = (ym: string) => Number(ym.slice(0, 4)) * 12 + Number(ym.slice(5, 7)) - 1;
  const thisMonth = now.getUTCFullYear() * 12 + now.getUTCMonth();
  if (thisMonth - monthIndex(months[0]) > 1) return 0;
  let run = 1;
  for (let i = 1; i < months.length && monthIndex(months[i - 1]) - monthIndex(months[i]) === 1; i += 1) run += 1;
  return run;
}

export async function getMemberRecognition(locale: string, memberId: string): Promise<MemberRecognition> {
  if (!z.uuid().safeParse(memberId).success) return { badges: [], streakMonths: 0 };
  const { supabase } = await sessionClient(locale);
  const [badgesRes, streaksRes] = await Promise.all([
    supabase.from("member_badges").select("id, awarded_at, badges(name, description, retired_at, rule)").eq("member_id", memberId).order("awarded_at", { ascending: false }),
    supabase.from("streak_awards").select("period_start").eq("member_id", memberId).order("period_start", { ascending: false }).limit(36),
  ]);
  if (badgesRes.error) throw new Error(`member_badges: ${badgesRes.error.message}`);
  if (streaksRes.error) throw new Error(`streak_awards: ${streaksRes.error.message}`);

  type BadgeJoin = { name: string; description: string | null; retired_at: string | null; rule?: { metric?: unknown } | null };
  const badges = (badgesRes.data ?? []).flatMap((row) => {
    const joined = row.badges as BadgeJoin | BadgeJoin[] | null;
    const badge = Array.isArray(joined) ? joined[0] : joined;
    // A retired badge was still earned; it stays on the profile.
    return badge
      ? [
          {
            id: row.id as string,
            name: badge.name,
            description: badge.description,
            awardedAt: row.awarded_at as string,
            retired: Boolean(badge.retired_at),
            metric: typeof badge.rule?.metric === "string" ? badge.rule.metric : null,
          },
        ]
      : [];
  });
  return { badges, streakMonths: currentStreak((streaksRes.data ?? []).map((r) => r.period_start as string)) };
}

// ── The achievement items of the home's feed (wave 18, add-only) ─────────────
//
// `REQ-UIX-055`, `DEC-206` §4.52 – §4.53, `DEC-207` §2 — contract 4. A colleague's
// badge and a completed streak month, the two recognitions that leave a row with a
// time. ★ No level-up and no rank change: neither leaves a row (`points_balances.
// updated_at` moves on every ledger insert). ★ No reaction: `reactions` targets a
// comment or a session.
//
// ★ OPT-OUT IS ENFORCED HERE, in the query (`REQ-UIX-055`): an item of a member who
// opted out of leaderboards never leaves this function — except the viewer's own,
// to the viewer alone (`DEC-207` Q3, as `boards_read` shows an opted-out member their
// own rank). A member who is not active — deactivated, anonymised, whose name is
// gone — is left out too. The rows themselves are org-readable (`p1_org_read`,
// 0027) and every profile shows them already; nothing is widened.
//
// ★ Order: `awarded_at` defaults to the writing transaction's start, so every badge
// one evaluation run awards carries the same instant. This is a feed's order, not
// «the last row»; `id` makes it stable. An admin's `award_reason` is not returned.

export interface AchievementMember {
  memberId: string;
  displayName: string;
  company: string | null;
  /** `companies.team_color`; reaches the DOM only as `--team`. */
  teamColor: string | null;
  isSelf: boolean;
}

export type AchievementItem =
  | { kind: "badge"; id: string; awardedAt: string; member: AchievementMember; badge: { name: string; description: string | null } }
  | { kind: "streak"; id: string; awardedAt: string; member: AchievementMember; /** `YYYY-MM-DD`, the month completed. */ periodStart: string };

export interface AchievementOptions {
  /** ISO instants bounding `awarded_at`: `since` inclusive, `until` exclusive. */
  since?: string;
  until?: string;
  /** Default 20, at most 50. */
  limit?: number;
}

const ITEM_LIMIT = 50;

/** Newest first — `awardedAt`, then `id`. Pure, exported for its unit test. */
export function newestFirst<T extends { awardedAt: string; id: string }>(items: T[]): T[] {
  return [...items].sort((a, b) => (a.awardedAt === b.awardedAt ? b.id.localeCompare(a.id) : b.awardedAt.localeCompare(a.awardedAt)));
}

export async function getAchievementItems(locale: string, opts: AchievementOptions = {}): Promise<AchievementItem[]> {
  const limit = Math.min(ITEM_LIMIT, Math.max(1, Math.floor(opts.limit ?? 20)));
  const { session, supabase } = await sessionClient(locale);

  // Who is left out: every member of the org who opted out (but the viewer) or is not active. Read first, so the
  // two item reads are filtered in the database and a page of `limit` is a full page.
  const { data: hidden, error: hiddenError } = await supabase
    .from("members")
    .select("id")
    .eq("org_id", session.orgId)
    .neq("id", session.memberId)
    .or("leaderboard_opt_out.eq.true,status.neq.active");
  if (hiddenError) throw new Error(`members (achievements): ${hiddenError.message}`);
  const hiddenIds = ((hidden ?? []) as Array<{ id: string }>).map((m) => m.id);

  const bounded = <Q extends { gte: (c: string, v: string) => Q; lt: (c: string, v: string) => Q; not: (c: string, op: string, v: string) => Q }>(q: Q): Q => {
    let out = q;
    if (opts.since) out = out.gte("awarded_at", opts.since);
    if (opts.until) out = out.lt("awarded_at", opts.until);
    if (hiddenIds.length > 0) out = out.not("member_id", "in", `(${hiddenIds.join(",")})`);
    return out;
  };

  const [badgesRes, streaksRes] = await Promise.all([
    bounded(
      supabase
        .from("member_badges")
        .select("id, awarded_at, member_id, badges(name, description)")
        .eq("org_id", session.orgId)
        .order("awarded_at", { ascending: false })
        .order("id", { ascending: false })
        .limit(limit),
    ),
    bounded(
      supabase
        .from("streak_awards")
        .select("id, awarded_at, member_id, period_start")
        .eq("org_id", session.orgId)
        .order("awarded_at", { ascending: false })
        .order("id", { ascending: false })
        .limit(limit),
    ),
  ]);
  if (badgesRes.error) throw new Error(`member_badges (achievements): ${badgesRes.error.message}`);
  if (streaksRes.error) throw new Error(`streak_awards (achievements): ${streaksRes.error.message}`);

  type BadgeJoin = { name: string; description: string | null };
  const badgeRows = (badgesRes.data ?? []) as Array<{ id: string; awarded_at: string; member_id: string; badges: BadgeJoin | BadgeJoin[] | null }>;
  const streakRows = (streaksRes.data ?? []) as Array<{ id: string; awarded_at: string; member_id: string; period_start: string }>;

  const memberIds = [...new Set([...badgeRows, ...streakRows].map((r) => r.member_id))];
  if (memberIds.length === 0) return [];
  const { data: members, error: membersError } = await supabase.from("members").select("id, display_name, company_id").in("id", memberIds);
  if (membersError) throw new Error(`members (achievements, names): ${membersError.message}`);
  const memberRows = (members ?? []) as Array<{ id: string; display_name: string | null; company_id: string | null }>;
  const companyIds = [...new Set(memberRows.map((m) => m.company_id).filter((id): id is string => Boolean(id)))];
  const { data: companies, error: companiesError } = companyIds.length
    ? await supabase.from("companies").select("id, name, team_color").in("id", companyIds)
    : { data: [] as Array<{ id: string; name: string; team_color: string | null }>, error: null };
  if (companiesError) throw new Error(`companies (achievements): ${companiesError.message}`);
  const companyOf = new Map(((companies ?? []) as Array<{ id: string; name: string; team_color: string | null }>).map((c) => [c.id, c]));

  const who = new Map<string, AchievementMember>();
  for (const m of memberRows) {
    // A member with no name is one the DAL must not draw as a blank — anonymisation clears it.
    if (!m.display_name) continue;
    const c = m.company_id ? companyOf.get(m.company_id) : undefined;
    who.set(m.id, { memberId: m.id, displayName: m.display_name, company: c?.name ?? null, teamColor: c?.team_color ?? null, isSelf: m.id === session.memberId });
  }

  const items: AchievementItem[] = [];
  for (const r of badgeRows) {
    const member = who.get(r.member_id);
    const badge = Array.isArray(r.badges) ? r.badges[0] : r.badges;
    if (member && badge) items.push({ kind: "badge", id: r.id, awardedAt: r.awarded_at, member, badge: { name: badge.name, description: badge.description } });
  }
  for (const r of streakRows) {
    const member = who.get(r.member_id);
    if (member) items.push({ kind: "streak", id: r.id, awardedAt: r.awarded_at, member, periodStart: r.period_start });
  }
  return newestFirst(items).slice(0, limit);
}

// ── The org's badge catalogue, counted — the profile's «N من M» (SCR-020, wave 19, add-only) ─────────────────
//
// `DEC-213` §5.121: M is the badges an org has not retired. `badges` is `p1_org_read` (0027). A count, never a
// page's length.

export async function countActiveBadges(locale: string): Promise<number> {
  const { session, supabase } = await sessionClient(locale);
  const { count, error } = await supabase.from("badges").select("id", { count: "exact", head: true }).eq("org_id", session.orgId).is("retired_at", null);
  if (error) throw new Error(`badges (count): ${error.message}`);
  return count ?? 0;
}

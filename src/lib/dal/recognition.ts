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
    supabase.from("member_badges").select("id, awarded_at, badges(name, description, retired_at)").eq("member_id", memberId).order("awarded_at", { ascending: false }),
    supabase.from("streak_awards").select("period_start").eq("member_id", memberId).order("period_start", { ascending: false }).limit(36),
  ]);
  if (badgesRes.error) throw new Error(`member_badges: ${badgesRes.error.message}`);
  if (streaksRes.error) throw new Error(`streak_awards: ${streaksRes.error.message}`);

  type BadgeJoin = { name: string; description: string | null; retired_at: string | null };
  const badges = (badgesRes.data ?? []).flatMap((row) => {
    const joined = row.badges as BadgeJoin | BadgeJoin[] | null;
    const badge = Array.isArray(joined) ? joined[0] : joined;
    // A retired badge was still earned; it stays on the profile.
    return badge ? [{ id: row.id as string, name: badge.name, description: badge.description, awardedAt: row.awarded_at as string }] : [];
  });
  return { badges, streakMonths: currentStreak((streaksRes.data ?? []).map((r) => r.period_start as string)) };
}

import "server-only";
import { avatarHref } from "@/lib/dal/avatars";
import { sessionClient } from "@/lib/dal/session";
import { getOrgPrefs } from "@/lib/dal/proposals";
import type { SessionState } from "@/lib/dal/sessions";
import { seatState, sessionPhase, type DayWindow } from "@/lib/session-status";
import { monthKeyOf, type ConsoleSessionRow } from "@/components/admin/sessions/session-query";

export type { ConsolePresenter, ConsoleSessionRow } from "@/components/admin/sessions/session-query";

// SCR-042 · /app/admin/sessions — the console's session list (wave 21,
// `REQ-UIX-087`, `DEC-228` §3), and SCR-040's «القادمة» and month figures read
// the same rows.
//
// ★ A READ, add-only. Every write on this screen stays `lib/dal/sessions.ts`'s
// (`transitionSession`, `createSession*`), called unchanged — this module never
// writes. RLS is the boundary: an admin and a moderator are both `is_staff()`,
// and the role decides what the PAGE offers, never which rows exist.
//
// An org's sessions are few, so the module reads them once and filters, sorts
// and pages in TS — the same call `admin-dashboard.ts`'s header made. The
// filtering, sorting and paging are pure functions below, unit-tested, so the
// URL is the whole state of the list (the no-JS path, `REQ-NFR-007`).

export interface ConsoleSessions {
  rows: ConsoleSessionRow[];
  timeZone: string;
  role: "admin" | "moderator";
}

type SessionDbRow = {
  id: string;
  title: string;
  state: string;
  starts_at: string | null;
  ends_at: string | null;
  rsvp_deadline_at: string | null;
  capacity: number | null;
  category_id: string | null;
  custom_venue_name: string | null;
  venues: { name: string } | null;
};

/** Every session of the caller's org, as SCR-042 draws it. `null` for anyone who is not staff. */
export async function getConsoleSessions(locale: string, now: Date = new Date()): Promise<ConsoleSessions | null> {
  const { session, supabase } = await sessionClient(locale);
  if (session.role !== "admin" && session.role !== "moderator") return null;

  const [{ data, error }, prefs] = await Promise.all([
    supabase
      .from("sessions")
      .select("id, title, state, starts_at, ends_at, rsvp_deadline_at, capacity, category_id, custom_venue_name, venues(name)")
      .eq("org_id", session.orgId),
    getOrgPrefs(locale),
  ]);
  if (error) throw new Error(`sessions (console): ${error.message}`);
  const sessions = (data ?? []) as unknown as SessionDbRow[];
  if (sessions.length === 0) return { rows: [], timeZone: prefs.timeZone, role: session.role };
  const ids = sessions.map((s) => s.id);

  const [days, presenters, rsvps] = await Promise.all([
    supabase.from("session_days").select("id, session_id, position, starts_at, ends_at").in("session_id", ids),
    supabase.from("session_presenters").select("session_id, member_id, accepted, declined_at").in("session_id", ids),
    supabase.from("rsvps").select("session_id, status").eq("org_id", session.orgId).in("status", ["confirmed", "waitlisted"]),
  ]);
  if (days.error) throw new Error(`session_days (console): ${days.error.message}`);
  if (presenters.error) throw new Error(`session_presenters (console): ${presenters.error.message}`);
  if (rsvps.error) throw new Error(`rsvps (console): ${rsvps.error.message}`);

  const daysBy = new Map<string, DayWindow[]>();
  for (const d of (days.data ?? []) as { id: string; session_id: string; position: number; starts_at: string; ends_at: string }[]) {
    const list = daysBy.get(d.session_id) ?? [];
    list.push({ id: d.id, position: d.position, startsAt: d.starts_at, endsAt: d.ends_at });
    daysBy.set(d.session_id, list);
  }

  const seats = new Map<string, { confirmed: number; waitlisted: number }>();
  for (const r of (rsvps.data ?? []) as { session_id: string; status: string }[]) {
    const s = seats.get(r.session_id) ?? { confirmed: 0, waitlisted: 0 };
    if (r.status === "confirmed") s.confirmed++;
    else s.waitlisted++;
    seats.set(r.session_id, s);
  }

  const presenterRows = (presenters.data ?? []) as { session_id: string; member_id: string; accepted: boolean; declined_at: string | null }[];
  const profiles = await presenterProfiles(supabase, [...new Set(presenterRows.map((p) => p.member_id))]);

  const rows = sessions.map((s): ConsoleSessionRow => {
    const state = s.state as SessionState;
    const sessionDays = (daysBy.get(s.id) ?? []).sort((a, b) => a.position - b.position);
    const counts = seats.get(s.id) ?? { confirmed: 0, waitlisted: 0 };
    return {
      id: s.id,
      title: s.title,
      state,
      phase: sessionPhase({ state, startsAt: s.starts_at, endsAt: s.ends_at, days: sessionDays }, now),
      seat: seatState({ capacity: s.capacity, confirmedCount: counts.confirmed, rsvpDeadlineAt: s.rsvp_deadline_at }, now),
      startsAt: s.starts_at,
      endsAt: s.ends_at,
      dayCount: Math.max(sessionDays.length, s.starts_at ? 1 : 0),
      venueName: s.venues?.name ?? s.custom_venue_name ?? null,
      capacity: s.capacity,
      confirmed: counts.confirmed,
      waitlisted: counts.waitlisted,
      categoryId: s.category_id,
      presenters: presenterRows
        .filter((p) => p.session_id === s.id)
        .map((p) => ({
          memberId: p.member_id,
          displayName: profiles.get(p.member_id)?.displayName ?? null,
          avatarUrl: profiles.get(p.member_id)?.avatarUrl ?? null,
          teamColor: profiles.get(p.member_id)?.teamColor ?? null,
          accepted: p.accepted,
          declinedAt: p.declined_at,
        })),
      monthKey: s.starts_at ? monthKeyOf(s.starts_at, prefs.timeZone) : null,
    };
  });
  return { rows, timeZone: prefs.timeZone, role: session.role };
}

/** The member tier only (`members_member_view`, REQ-PRF-004), our copy of the picture (`DEC-099`), the team colour. */
async function presenterProfiles(
  supabase: Awaited<ReturnType<typeof sessionClient>>["supabase"],
  memberIds: string[],
): Promise<Map<string, { displayName: string | null; avatarUrl: string | null; teamColor: string | null }>> {
  if (memberIds.length === 0) return new Map();
  const { data, error } = await supabase.from("members_member_view").select("id, display_name, company_id, avatar_version").in("id", memberIds);
  if (error) throw new Error(`members_member_view (console): ${error.message}`);
  const rows = (data ?? []) as { id: string; display_name: string | null; company_id: string | null; avatar_version: number | null }[];
  const companyIds = [...new Set(rows.map((r) => r.company_id).filter((v): v is string => v !== null))];
  const colours = new Map<string, string | null>();
  if (companyIds.length > 0) {
    const { data: found, error: cErr } = await supabase.from("companies").select("id, team_color").in("id", companyIds);
    if (cErr) throw new Error(`companies (console): ${cErr.message}`);
    for (const c of (found ?? []) as { id: string; team_color: string | null }[]) colours.set(c.id, c.team_color ?? null);
  }
  return new Map(
    rows.map((r) => [
      r.id,
      {
        displayName: r.display_name,
        avatarUrl: avatarHref({ id: r.id, avatarVersion: r.avatar_version }, 96),
        teamColor: r.company_id ? (colours.get(r.company_id) ?? null) : null,
      },
    ]),
  );
}


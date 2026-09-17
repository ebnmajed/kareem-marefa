import "server-only";
import { z } from "zod";
import { sessionClient } from "@/lib/dal/session";

// Calendar — the ICS download, the add-to-calendar links and the Google
// connection status (REQ-CAL-001 … REQ-CAL-008, SCR-025, the SCR-012 slot).
//
// ONE THING THIS MODULE CANNOT DO, by construction: read a token. The four
// granted columns on `calendar_connections` are `member_id`, `provider`,
// `connected_at` and `disconnected_at` (migration 0026, `03` §5.9c), so a
// `select *` from here is `42501` — not a lint rule, not a convention, a
// grant. `REQ-CAL-003` says tokens are never displayed to anyone, and this is
// the shape that makes a careless query fail rather than leak.

export interface CalendarSessionDTO {
  id: string;
  title: string;
  abstract: string;
  startsAt: string;
  endsAt: string;
  timeZone: string;
  state: string;
  cancelled: boolean;
  venue: { name: string; address: string | null; mapUrl: string | null } | null;
}

type VenueRow = { name: string; address: string | null; map_url: string | null };

/**
 * Everything the ICS and the add-to-calendar links need.
 *
 * Returns null rather than throwing for a session the viewer cannot see: RLS
 * already returns no row, and a 404 that is indistinguishable from "does not
 * exist" is the right answer for a session in another org.
 */
export async function getSessionForCalendar(locale: string, sessionId: string): Promise<CalendarSessionDTO | null> {
  if (!z.uuid().safeParse(sessionId).success) return null;
  const { supabase } = await sessionClient(locale);

  const [{ data, error }] = await Promise.all([
    supabase
      .from("sessions")
      .select("id, title, abstract, starts_at, ends_at, time_zone, state, custom_venue_name, custom_venue_address, custom_venue_map_url, venues(name, address, map_url)")
      .eq("id", sessionId)
      .maybeSingle(),
  ]);
  if (error) throw new Error(`sessions: ${error.message}`);
  if (!data || !data.starts_at || !data.ends_at) return null;

  // A session names EITHER a venue row or a free-text place (migration 0010),
  // and the embed comes back as an object or as an array depending on how
  // PostgREST resolves the relationship — so both shapes are handled here
  // rather than at three call sites.
  const embedded = data.venues as VenueRow | VenueRow[] | null;
  const venueRow = Array.isArray(embedded) ? (embedded[0] ?? null) : embedded;
  const venue = venueRow
    ? { name: venueRow.name, address: venueRow.address, mapUrl: venueRow.map_url }
    : data.custom_venue_name
      ? { name: data.custom_venue_name, address: data.custom_venue_address ?? null, mapUrl: data.custom_venue_map_url ?? null }
      : null;

  return {
    id: data.id,
    title: data.title,
    abstract: data.abstract,
    startsAt: data.starts_at,
    endsAt: data.ends_at,
    timeZone: data.time_zone ?? "Asia/Riyadh",
    state: data.state,
    cancelled: data.state === "cancelled",
    venue,
  };
}

export interface CalendarConnectionDTO {
  provider: "google";
  connectedAt: string;
  disconnectedAt: string | null;
}

/**
 * SCR-025's connection status — and nothing else. The select names its four
 * columns explicitly: naming them is what keeps a later `select("*")` from
 * being a one-character change that turns a 42501 into a leak.
 */
export async function getCalendarConnection(locale: string): Promise<CalendarConnectionDTO | null> {
  const { session, supabase } = await sessionClient(locale);
  const { data, error } = await supabase
    .from("calendar_connections")
    .select("provider, connected_at, disconnected_at")
    .eq("member_id", session.memberId)
    .maybeSingle();
  if (error) throw new Error(`calendar_connections: ${error.message}`);
  if (!data) return null;
  return { provider: data.provider, connectedAt: data.connected_at, disconnectedAt: data.disconnected_at };
}

export interface SyncedEventDTO {
  /** One row per (member, DAY) since wave 9, so this is not unique in the list. */
  id: string;
  sessionId: string;
  sessionTitle: string;
  /** The DAY's start, and the session's own when the day is gone. */
  startsAt: string | null;
  /** The day's rank, 1…n. Null when the day has been deleted from the session. */
  dayPosition: number | null;
  /** How many days the session has, so a screen can tell one meeting from a set. */
  dayCount: number;
  state: "pending" | "synced" | "failed" | "removed";
  error: string | null;
  lastSyncedAt: string | null;
}

/**
 * SCR-025's list of synced entries. `REQ-CAL-005` requires a failed sync be
 * surfaced to the member rather than silently dropped, so `error` is part of
 * the DTO and the screen renders it.
 *
 * ★ ONE ROW PER DAY since wave 9 (`REQ-SES-015`), so a three-day workshop is
 * three entries — which is what a member's calendar holds. The day is embedded
 * rather than read through `listSessionDays()`: DEC-151's rule is that a LIST
 * over many sessions embeds in its own query and a single session goes through
 * the DAL function. Nothing here computes a minimum or a maximum: `dayCount`
 * is counted in the database and `startsAt` is the day's own column.
 *
 * Ordered by the day's start, because a calendar reads forwards.
 */
export async function listSyncedEvents(locale: string): Promise<SyncedEventDTO[]> {
  const { session, supabase } = await sessionClient(locale);
  const { data, error } = await supabase
    .from("calendar_events")
    .select("id, session_id, state, error, last_synced_at, sessions(title, starts_at, session_days(id)), session_days(position, starts_at)")
    .eq("member_id", session.memberId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(`calendar_events: ${error.message}`);

  type SessionEmbed = { title: string; starts_at: string | null; session_days: Array<{ id: string }> | null };
  type Row = {
    id: string;
    session_id: string;
    state: SyncedEventDTO["state"];
    error: string | null;
    last_synced_at: string | null;
    sessions: SessionEmbed | SessionEmbed[] | null;
    session_days: { position: number; starts_at: string } | Array<{ position: number; starts_at: string }> | null;
  };
  const one = <T,>(embedded: T | T[] | null): T | null => (Array.isArray(embedded) ? (embedded[0] ?? null) : embedded);

  const rows = (data ?? []) as unknown as Row[];

  return rows
    .map((row) => {
      const s = one(row.sessions);
      const day = one(row.session_days);
      return {
        id: row.id,
        sessionId: row.session_id,
        sessionTitle: s?.title ?? "",
        startsAt: day?.starts_at ?? s?.starts_at ?? null,
        dayPosition: day?.position ?? null,
        // The session's OWN day count, embedded through the session — not the
        // number of rows this member holds, which is short by one whenever a
        // day's sync has not landed yet.
        dayCount: s?.session_days?.length ?? 1,
        state: row.state,
        error: row.error,
        lastSyncedAt: row.last_synced_at,
      };
    })
    .sort((a, b) => (a.startsAt ?? "").localeCompare(b.startsAt ?? ""));
}

/** `REQ-CAL-007` — disconnect DELETES the row, immediately, outside the
 *  retention schedule entirely. `calendar_delete_self` is the policy; there is
 *  no update path, so there is no "mark disconnected and keep the token". */
export async function disconnectCalendar(locale: string): Promise<void> {
  const { session, supabase } = await sessionClient(locale);
  const { error } = await supabase.from("calendar_connections").delete().eq("member_id", session.memberId);
  if (error) throw new Error(`calendar_connections: ${error.message}`);
}

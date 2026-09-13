import "server-only";
import { z } from "zod";
import { sessionClient } from "@/lib/dal/session";

// Sessions — REQ-SES-001 … REQ-SES-013, REQ-PRO-007, 02 §4.3, §6.2, 03 §5.2c/d.
//
// `sessions` has NO insert policy and NO insert grant, and its four-column
// update grant covers only title, abstract, level and language. Everything
// schedule-shaped — starts_at, venue, capacity, the deadlines, certificate
// mode and state — moves through an admin RPC and nowhere else. That is
// D13/D14 expressed as privileges rather than as UI: a presenter cannot set a
// date even by crafting a request.
//
// Every function goes through sessionClient(), and returns a DTO.

export type SessionState =
  | "draft"
  | "submitted"
  | "in_review"
  | "changes_requested"
  | "approved"
  | "published"
  | "in_progress"
  | "completed"
  | "archived"
  | "cancelled";

export type SessionLevel = "introductory" | "intermediate" | "advanced";
export type SessionLanguage = "ar" | "en";

export interface SessionPresenterDto {
  memberId: string;
  displayName: string | null;
  accepted: boolean;
  declinedAt: string | null;
}

export interface AdminSession {
  id: string;
  title: string;
  state: SessionState;
  level: SessionLevel;
  language: SessionLanguage;
  /** Null until an admin schedules it (REQ-SES-001). */
  startsAt: string | null;
  fromProposal: boolean;
  presenters: SessionPresenterDto[];
  createdAt: string;
}

/** An approved proposal that has not become a session yet. */
export interface SchedulableProposal {
  id: string;
  title: string;
  categoryName: string | null;
  level: SessionLevel;
  presenterNames: string[];
}

async function namesFor(
  supabase: Awaited<ReturnType<typeof sessionClient>>["supabase"],
  memberIds: string[],
): Promise<Map<string, string | null>> {
  if (memberIds.length === 0) return new Map();
  const { data, error } = await supabase.from("members_member_view").select("id, display_name").in("id", memberIds);
  if (error) throw new Error(`members_member_view: ${error.message}`);
  return new Map((data ?? []).map((m) => [m.id as string, m.display_name as string | null]));
}

/**
 * Every session an admin manages (SCR-042).
 *
 * Admin only, decided here: a moderator is `is_staff()` and `sessions_read`
 * therefore shows them drafts, but `09` §7.1 does not give them this screen.
 * Null lets the route 404 rather than render a console they cannot act in.
 */
export async function listSessionsForAdmin(locale: string): Promise<AdminSession[] | null> {
  const { session, supabase } = await sessionClient(locale);
  if (session.role !== "admin") return null;

  const { data, error } = await supabase
    .from("sessions")
    .select("id, title, state, level, language, starts_at, proposal_id, created_at")
    .order("created_at", { ascending: false });
  if (error) throw new Error(`sessions.select: ${error.message}`);
  const rows = data ?? [];
  if (rows.length === 0) return [];

  const { data: presenters, error: pErr } = await supabase
    .from("session_presenters")
    .select("session_id, member_id, accepted, declined_at")
    .in("session_id", rows.map((r) => r.id));
  if (pErr) throw new Error(`session_presenters: ${pErr.message}`);
  const names = await namesFor(supabase, (presenters ?? []).map((p) => p.member_id));

  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    state: r.state as SessionState,
    level: r.level as SessionLevel,
    language: r.language as SessionLanguage,
    startsAt: r.starts_at,
    fromProposal: r.proposal_id !== null,
    presenters: (presenters ?? [])
      .filter((p) => p.session_id === r.id)
      .map((p) => ({ memberId: p.member_id, displayName: names.get(p.member_id) ?? null, accepted: p.accepted, declinedAt: p.declined_at })),
    createdAt: r.created_at,
  }));
}

/**
 * Approved proposals with no session yet (SCR-042's «جاهزة للجدولة»).
 *
 * Two reads and a filter rather than a `not.in` with an inline subquery:
 * PostgREST has no subqueries, and the alternative — a view — would be a
 * schema change for a list an admin reads once a week.
 */
export async function listSchedulableProposals(locale: string): Promise<SchedulableProposal[]> {
  const { session, supabase } = await sessionClient(locale);
  if (session.role !== "admin") return [];

  const { data, error } = await supabase.from("proposals").select("id, title, level, categories(name)").eq("state", "approved").order("updated_at");
  if (error) throw new Error(`proposals.select: ${error.message}`);
  const rows = (data ?? []) as unknown as { id: string; title: string; level: string; categories: { name: string } | null }[];
  if (rows.length === 0) return [];

  const { data: taken, error: tErr } = await supabase.from("sessions").select("proposal_id").not("proposal_id", "is", null);
  if (tErr) throw new Error(`sessions.select: ${tErr.message}`);
  const used = new Set((taken ?? []).map((s) => s.proposal_id as string));

  const free = rows.filter((r) => !used.has(r.id));
  if (free.length === 0) return [];

  const { data: presenters, error: pErr } = await supabase
    .from("proposal_presenters")
    .select("proposal_id, member_id")
    .in("proposal_id", free.map((r) => r.id))
    .eq("accepted", true);
  if (pErr) throw new Error(`proposal_presenters: ${pErr.message}`);
  const names = await namesFor(supabase, (presenters ?? []).map((p) => p.member_id));

  return free.map((r) => ({
    id: r.id,
    title: r.title,
    categoryName: r.categories?.name ?? null,
    level: r.level as SessionLevel,
    presenterNames: (presenters ?? []).filter((p) => p.proposal_id === r.id).map((p) => names.get(p.member_id) ?? ""),
  }));
}

/**
 * What an admin may set when creating a session out of nothing (REQ-PRO-007).
 *
 * ★ No date, no venue, no capacity, and `.strict()` so adding one is a parse
 * failure. Creating and scheduling are two acts (D13/D14, REQ-SES-001), and
 * `create_session()` has no parameter for any of them either.
 */
export const directSessionInput = z
  .object({
    title: z.string().trim().min(3).max(150),
    abstract: z.string().trim().min(1).max(2000),
    categoryId: z.uuid(),
    level: z.enum(["introductory", "intermediate", "advanced"]),
    language: z.enum(["ar", "en"]),
    presenterIds: z.array(z.uuid()).max(10),
  })
  .strict();
export type DirectSessionInput = z.infer<typeof directSessionInput>;

/** Turns an approved proposal into a draft session (REQ-PRO-007, REQ-SES-001). */
export async function createSessionFromProposal(locale: string, proposalId: string): Promise<string> {
  const { supabase } = await sessionClient(locale);
  const { data, error } = await supabase.rpc("create_session", { p_proposal: proposalId });
  if (error || !data) throw new Error(`create_session: ${error?.message ?? "no id"}`);
  return data as string;
}

/** Creates a session with no proposal behind it (REQ-PRO-007). */
export async function createSessionDirect(locale: string, input: DirectSessionInput): Promise<string> {
  const { supabase } = await sessionClient(locale);
  const { data, error } = await supabase.rpc("create_session", {
    p_title: input.title,
    p_abstract: input.abstract,
    p_category: input.categoryId,
    p_level: input.level,
    p_language: input.language,
    p_presenters: input.presenterIds,
  });
  if (error || !data) throw new Error(`create_session: ${error?.message ?? "no id"}`);
  return data as string;
}

// ── Scheduling (SCR-043, REQ-SES-001, REQ-SES-002) ──────────────────────────

export interface Venue {
  id: string;
  name: string;
  address: string | null;
  capacity: number | null;
}

export interface SchedulableSession {
  id: string;
  title: string;
  state: SessionState;
  language: SessionLanguage;
  startsAt: string | null;
  durationMinutes: number | null;
  endsAt: string | null;
  venueId: string | null;
  customVenueName: string | null;
  customVenueAddress: string | null;
  customVenueMapUrl: string | null;
  capacity: number | null;
  rsvpDeadlineAt: string | null;
  cancellationCutoffAt: string | null;
  certificateMode: "off" | "automatic" | "review";
  timeZone: string;
  /** What REQ-SES-001 still wants before this can be published. */
  missing: ("startsAt" | "endsAt" | "capacity" | "venue")[];
}

export async function listVenues(locale: string): Promise<Venue[]> {
  const { supabase } = await sessionClient(locale);
  const { data, error } = await supabase.from("venues").select("id, name, address, capacity").is("deactivated_at", null).order("name");
  if (error) throw new Error(`venues: ${error.message}`);
  return (data ?? []).map((v) => ({ id: v.id, name: v.name, address: v.address, capacity: v.capacity }));
}

/** One session, for the schedule form. Admin only; null lets the route 404. */
export async function getSessionForSchedule(locale: string, id: string): Promise<SchedulableSession | null> {
  if (!z.uuid().safeParse(id).success) return null;
  const { session, supabase } = await sessionClient(locale);
  if (session.role !== "admin") return null;

  const { data, error } = await supabase
    .from("sessions")
    .select(
      "id, title, state, language, starts_at, duration_minutes, ends_at, venue_id, custom_venue_name, custom_venue_address, custom_venue_map_url, capacity, rsvp_deadline_at, cancellation_cutoff_at, certificate_mode, time_zone",
    )
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`sessions.select: ${error.message}`);
  if (!data) return null;

  const missing: SchedulableSession["missing"] = [];
  if (!data.starts_at) missing.push("startsAt");
  if (!data.ends_at) missing.push("endsAt");
  if (data.capacity === null) missing.push("capacity");
  if (!data.venue_id && !data.custom_venue_name) missing.push("venue");

  return {
    id: data.id,
    title: data.title,
    state: data.state as SessionState,
    language: data.language as SessionLanguage,
    startsAt: data.starts_at,
    durationMinutes: data.duration_minutes,
    endsAt: data.ends_at,
    venueId: data.venue_id,
    customVenueName: data.custom_venue_name,
    customVenueAddress: data.custom_venue_address,
    customVenueMapUrl: data.custom_venue_map_url,
    capacity: data.capacity,
    rsvpDeadlineAt: data.rsvp_deadline_at,
    cancellationCutoffAt: data.cancellation_cutoff_at,
    certificateMode: data.certificate_mode as SchedulableSession["certificateMode"],
    timeZone: data.time_zone,
    missing,
  };
}

/**
 * ★ Everything schedule-shaped, and nothing else.
 *
 * `.strict()`, so a `title` or a `state` arriving here is a parse failure:
 * this form sets a time and a place, and the four columns a presenter may
 * edit are not its business. The mirror of `proposalInput`, which refuses
 * exactly the opposite set.
 */
export const scheduleInput = z
  .object({
    startsAt: z.iso.datetime({ offset: true }),
    durationMinutes: z.int().min(15).max(480),
    endsAt: z.iso.datetime({ offset: true }).nullable(),
    venueId: z.uuid().nullable(),
    customVenueName: z.string().trim().max(120).nullable(),
    customVenueAddress: z.string().trim().max(300).nullable(),
    customVenueMapUrl: z.url().startsWith("https://").nullable(),
    capacity: z.int().min(1).max(10000).nullable(),
    rsvpDeadlineAt: z.iso.datetime({ offset: true }).nullable(),
    cancellationCutoffAt: z.iso.datetime({ offset: true }).nullable(),
    certificateMode: z.enum(["off", "automatic", "review"]),
    language: z.enum(["ar", "en"]),
  })
  .strict();
export type ScheduleInput = z.infer<typeof scheduleInput>;

export async function scheduleSession(locale: string, sessionId: string, input: ScheduleInput): Promise<void> {
  const { supabase } = await sessionClient(locale);
  const { error } = await supabase.rpc("schedule_session", {
    p_session: sessionId,
    p_starts_at: input.startsAt,
    p_duration_minutes: input.durationMinutes,
    p_ends_at: input.endsAt,
    p_venue: input.venueId,
    p_custom_venue_name: input.customVenueName,
    p_custom_venue_address: input.customVenueAddress,
    p_custom_venue_map_url: input.customVenueMapUrl,
    p_capacity: input.capacity,
    p_rsvp_deadline_at: input.rsvpDeadlineAt,
    p_cancellation_cutoff_at: input.cancellationCutoffAt,
    p_certificate_mode: input.certificateMode,
    p_language: input.language,
  });
  if (error) throw new Error(`schedule_session: ${error.message}`);
}

/** Publishing (REQ-SES-001). The gate is the table's; this reports its refusal. */
export async function publishSession(locale: string, sessionId: string): Promise<void> {
  const { supabase } = await sessionClient(locale);
  const { error } = await supabase.rpc("publish_session", { p_session: sessionId });
  if (error) throw new Error(`publish_session: ${error.message}`);
}

// ── The event page (SCR-012, REQ-SES-013, REQ-SES-008, REQ-SES-010) ─────────

export interface EventVenue {
  name: string;
  address: string | null;
  mapUrl: string | null;
  /** True when it is a one-off rather than an entry in the org's list. */
  oneOff: boolean;
}

export interface EventSession {
  id: string;
  title: string;
  abstract: string;
  state: SessionState;
  level: SessionLevel;
  language: SessionLanguage;
  categoryName: string | null;
  startsAt: string | null;
  endsAt: string | null;
  timeZone: string;
  venue: EventVenue | null;
  capacity: number | null;
  rsvpDeadlineAt: string | null;
  cancellationCutoffAt: string | null;
  cancellationReason: string | null;
  presenters: { memberId: string; displayName: string | null }[];
  /** The viewer presents this session, so SCR-016 is offered (REQ-CHK-014). */
  viewerIsPresenter: boolean;
  viewerIsStaff: boolean;
}

/**
 * One session for its event page.
 *
 * No role filter of its own: `sessions_read` already decides — published and
 * everything after for any member, drafts for staff and the session's own
 * presenters — and re-stating that here would only be able to get it wrong.
 * Null means the policy returned nothing, which the route turns into a 404.
 *
 * ★ REQ-SES-008: there is no stream URL, no join link and no remote-attendance
 * field anywhere in this DTO, because there is none in the product.
 */
export async function getSessionForEvent(locale: string, id: string): Promise<EventSession | null> {
  if (!z.uuid().safeParse(id).success) return null;
  const { session, supabase } = await sessionClient(locale);

  const { data, error } = await supabase
    .from("sessions")
    .select(
      "id, title, abstract, state, level, language, starts_at, ends_at, time_zone, capacity, rsvp_deadline_at, cancellation_cutoff_at, cancellation_reason, custom_venue_name, custom_venue_address, custom_venue_map_url, categories(name), venues(name, address, map_url)",
    )
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`sessions.select: ${error.message}`);
  if (!data) return null;
  const row = data as unknown as Record<string, unknown>;

  const listed = row.venues as { name: string; address: string | null; map_url: string | null } | null;
  const venue: EventVenue | null = listed
    ? { name: listed.name, address: listed.address, mapUrl: listed.map_url, oneOff: false }
    : row.custom_venue_name
      ? {
          name: row.custom_venue_name as string,
          address: (row.custom_venue_address as string) ?? null,
          mapUrl: (row.custom_venue_map_url as string) ?? null,
          oneOff: true,
        }
      : null;

  const { data: presenters, error: pErr } = await supabase
    .from("session_presenters")
    .select("member_id, accepted")
    .eq("session_id", id)
    .eq("accepted", true);
  if (pErr) throw new Error(`session_presenters: ${pErr.message}`);
  const names = await namesFor(supabase, (presenters ?? []).map((p) => p.member_id));

  return {
    id: row.id as string,
    title: row.title as string,
    abstract: row.abstract as string,
    state: row.state as SessionState,
    level: row.level as SessionLevel,
    language: row.language as SessionLanguage,
    categoryName: (row.categories as { name: string } | null)?.name ?? null,
    startsAt: (row.starts_at as string) ?? null,
    endsAt: (row.ends_at as string) ?? null,
    timeZone: (row.time_zone as string) ?? "Asia/Riyadh",
    venue,
    capacity: (row.capacity as number) ?? null,
    rsvpDeadlineAt: (row.rsvp_deadline_at as string) ?? null,
    cancellationCutoffAt: (row.cancellation_cutoff_at as string) ?? null,
    cancellationReason: (row.cancellation_reason as string) ?? null,
    presenters: (presenters ?? []).map((p) => ({ memberId: p.member_id, displayName: names.get(p.member_id) ?? null })),
    viewerIsPresenter: (presenters ?? []).some((p) => p.member_id === session.memberId),
    viewerIsStaff: session.role === "admin" || session.role === "moderator",
  };
}

// ── Manual transitions (SCR-042, REQ-SES-003, REQ-SES-005, REQ-SES-012) ─────

export type SessionAction = "start" | "complete" | "cancel" | "archive" | "reopen";

/**
 * The actions 02 §6.2 allows from a given state.
 *
 * Exported so the screen and its test agree, and so the list cannot drift from
 * `transition_session()` — which refuses anything else anyway, with the same
 * edge set written the same way.
 */
export function actionsFor(state: SessionState): SessionAction[] {
  switch (state) {
    case "published":
      return ["start", "cancel"];
    case "in_progress":
      return ["complete", "cancel"];
    case "completed":
      return ["archive", "cancel"];
    case "archived":
      return ["reopen", "cancel"];
    case "approved":
      return ["cancel"];
    default:
      return [];
  }
}

/** An admin's manual transition (REQ-SES-005). Every check is in the RPC. */
export async function transitionSession(locale: string, sessionId: string, action: SessionAction, reason: string | null): Promise<void> {
  const { supabase } = await sessionClient(locale);
  const { error } = await supabase.rpc("transition_session", { p_session: sessionId, p_action: action, p_reason: reason });
  if (error) throw new Error(`transition_session: ${error.message}`);
}

// ── Venues (SCR-046, REQ-SES-006, REQ-ADM-006) ──────────────────────────────

export interface AdminVenue extends Venue {
  mapUrl: string | null;
  notes: string | null;
  timeZone: string | null;
  deactivatedAt: string | null;
  /** Future sessions still pointing at it — why deactivating is the only exit. */
  upcomingSessions: number;
}

/**
 * ★ REQ-SES-006's "cannot be deleted, only deactivated" needs no code and no
 * policy: `venues` has `grant select, insert, update` and **no delete grant
 * and no delete policy** (0004), so deletion is impossible for every
 * authenticated role, in use or not. The count below is not a guard — it is
 * the sentence the screen uses to explain why there is no delete button.
 */
export async function listVenuesForAdmin(locale: string): Promise<AdminVenue[] | null> {
  const { session, supabase } = await sessionClient(locale);
  if (session.role !== "admin") return null;

  const { data, error } = await supabase
    .from("venues")
    .select("id, name, address, map_url, capacity, notes, time_zone, deactivated_at")
    .order("deactivated_at", { nullsFirst: true })
    .order("name");
  if (error) throw new Error(`venues: ${error.message}`);
  const rows = data ?? [];
  if (rows.length === 0) return [];

  const { data: upcoming, error: sErr } = await supabase
    .from("sessions")
    .select("venue_id")
    .not("venue_id", "is", null)
    .gte("starts_at", new Date().toISOString())
    .in("state", ["approved", "published", "in_progress"]);
  if (sErr) throw new Error(`sessions: ${sErr.message}`);
  const counts = new Map<string, number>();
  for (const s of upcoming ?? []) counts.set(s.venue_id as string, (counts.get(s.venue_id as string) ?? 0) + 1);

  return rows.map((v) => ({
    id: v.id,
    name: v.name,
    address: v.address,
    mapUrl: v.map_url,
    capacity: v.capacity,
    notes: v.notes,
    timeZone: v.time_zone,
    deactivatedAt: v.deactivated_at,
    upcomingSessions: counts.get(v.id) ?? 0,
  }));
}

export const venueInput = z
  .object({
    name: z.string().trim().min(1).max(120),
    address: z.string().trim().max(300).nullable(),
    mapUrl: z.url().startsWith("https://").nullable(),
    capacity: z.int().min(1).max(10000).nullable(),
    notes: z.string().trim().max(2000).nullable(),
    timeZone: z.string().trim().max(64).nullable(),
  })
  .strict();
export type VenueInput = z.infer<typeof venueInput>;

/** Plain insert: `p2_admin_insert` on `venues` already says who may (0004). */
export async function createVenue(locale: string, input: VenueInput): Promise<void> {
  const { session, supabase } = await sessionClient(locale);
  const { error } = await supabase.from("venues").insert({
    org_id: session.orgId,
    name: input.name,
    address: input.address,
    map_url: input.mapUrl,
    capacity: input.capacity,
    notes: input.notes,
    time_zone: input.timeZone,
  });
  if (error) throw new Error(`venues.insert: ${error.message}`);
}

/** Deactivate or restore. The only exit a venue has (REQ-SES-006). */
export async function setVenueActive(locale: string, venueId: string, active: boolean): Promise<void> {
  const { supabase } = await sessionClient(locale);
  const { error } = await supabase
    .from("venues")
    .update({ deactivated_at: active ? null : new Date().toISOString() })
    .eq("id", venueId);
  if (error) throw new Error(`venues.update: ${error.message}`);
}

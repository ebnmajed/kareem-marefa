import "server-only";
import { z } from "zod";
import { sessionClient } from "@/lib/dal/session";
import { createServerClient } from "@/lib/supabase/server";
import { sessionPhase, viewerRelation as deriveRelation, type ViewerRelation } from "@/lib/session-status";

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
 * The member-tier profile of each presenter, for the event page (`16` §6.3).
 *
 * `members_member_view` is the member tier (REQ-PRF-004) — every field here is
 * one any member may already see. The company name is a second read by id
 * rather than an embed: PostgREST cannot follow a foreign key through a view.
 */
async function presenterProfiles(
  supabase: Awaited<ReturnType<typeof sessionClient>>["supabase"],
  memberIds: string[],
): Promise<Map<string, EventPresenter>> {
  if (memberIds.length === 0) return new Map();
  const { data, error } = await supabase.from("members_member_view").select("id, display_name, job_title, bio, company_id").in("id", memberIds);
  if (error) throw new Error(`members_member_view: ${error.message}`);
  const rows = (data ?? []) as { id: string; display_name: string | null; job_title: string | null; bio: string | null; company_id: string | null }[];

  const companyIds = [...new Set(rows.map((r) => r.company_id).filter((v): v is string => v !== null))];
  const companies = new Map<string, string>();
  if (companyIds.length > 0) {
    const { data: found, error: cErr } = await supabase.from("companies").select("id, name").in("id", companyIds);
    if (cErr) throw new Error(`companies: ${cErr.message}`);
    for (const c of found ?? []) companies.set(c.id as string, c.name as string);
  }

  return new Map(
    rows.map((r) => [
      r.id,
      {
        memberId: r.id,
        displayName: r.display_name,
        jobTitle: r.job_title,
        companyName: r.company_id ? (companies.get(r.company_id) ?? null) : null,
        bio: r.bio,
      },
    ]),
  );
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

// ── console (wave 3) — added for SCR-044, never changes the DTO/signature above ──

export interface AttendanceSessionRow {
  id: string;
  title: string;
  state: SessionState;
  startsAt: string | null;
}

/**
 * SCR-044's own entry point (docs/plan/notes/console.md's moderator/
 * `/sessions` decision): a moderator has no reason to see full session
 * management (`REQ-ADM-005` is admin-only — edit/cancel/publish are exactly
 * the "scheduling endpoint" `REQ-ADM-020` keeps out of a moderator's
 * reach), but DOES have a reason to reach a session's attendance report
 * (`REQ-CHK-008`/`REQ-CHK-012`, `REQ-ADM-020`'s "event-day operations").
 * `admin/sessions/page.tsx` branches on role and renders this minimal list
 * — id, title, state, start time, nothing else — with only an attendance
 * link, for a moderator; an admin keeps the full page exactly as it was.
 */
export async function listSessionsForAttendance(locale: string): Promise<AttendanceSessionRow[] | null> {
  const { session, supabase } = await sessionClient(locale);
  if (session.role !== "admin" && session.role !== "moderator") return null;

  const { data, error } = await supabase.from("sessions").select("id, title, state, starts_at").order("starts_at", { ascending: false, nullsFirst: false });
  if (error) throw new Error(`sessions.select: ${error.message}`);
  return (data ?? []).map((r) => ({ id: r.id, title: r.title, state: r.state as SessionState, startsAt: r.starts_at }));
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
  /** `sessions.allow_walk_ins` — the schedule form's initial value for the walk-in setting (DEC-117, DEC-118, contract 1). */
  allowWalkIns: boolean;
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
      "id, title, state, language, starts_at, duration_minutes, ends_at, venue_id, custom_venue_name, custom_venue_address, custom_venue_map_url, capacity, rsvp_deadline_at, cancellation_cutoff_at, certificate_mode, allow_walk_ins, time_zone",
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
    allowWalkIns: data.allow_walk_ins === true,
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
    /**
     * Walk-ins as a publishing setting (DEC-117, DEC-118, contract 1, 0085).
     * ★ `null` means UNCHANGED — `schedule_session()` keeps the stored value
     * (`coalesce(p_allow_walk_ins, target.allow_walk_ins)`, DEC-141 correction B).
     * It is never coerced to `false`: a save that does not carry the field must
     * not switch walk-ins off. An absent key parses to `null` too, so a schedule
     * form without the control saves exactly as before.
     */
    allowWalkIns: z.boolean().nullable().default(null),
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
    // Sent as given — `null` stays `null`, which the RPC reads as «unchanged».
    p_allow_walk_ins: input.allowWalkIns,
  });
  if (error) throw new Error(`schedule_session: ${error.message}`);
}

/** Publishing (REQ-SES-001). The gate is the table's; this reports its refusal. */
export async function publishSession(locale: string, sessionId: string): Promise<void> {
  const { supabase } = await sessionClient(locale);
  const { error } = await supabase.rpc("publish_session", { p_session: sessionId });
  if (error) throw new Error(`publish_session: ${error.message}`);
}

// ── A session's heading, for the screens under it ──────────────────────────

export interface SessionHeading {
  id: string;
  title: string;
  state: SessionState;
  startsAt: string | null;
  /** The session's zone, else the org's — the room's clock (OQ-018). */
  timeZone: string;
}

/**
 * What a screen UNDER a session needs to say which session it is — the rate
 * screen's breadcrumb and date (SCR-015, wave 7). `null` for an id the viewer
 * cannot see, through `sessions_read`, so the screen can `notFound()` rather
 * than explain a rule about a session that is not there for them.
 */
export async function getSessionHeading(locale: string, id: string): Promise<SessionHeading | null> {
  if (!z.uuid().safeParse(id).success) return null;
  const { session, supabase } = await sessionClient(locale);
  const [{ data, error }, { data: settings }] = await Promise.all([
    supabase.from("sessions").select("id, title, state, starts_at, time_zone").eq("id", id).maybeSingle(),
    supabase.from("org_settings").select("time_zone").eq("org_id", session.orgId).maybeSingle(),
  ]);
  if (error) throw new Error(`sessions.select: ${error.message}`);
  if (!data) return null;
  return {
    id: data.id as string,
    title: data.title as string,
    state: data.state as SessionState,
    startsAt: (data.starts_at as string | null) ?? null,
    timeZone: (data.time_zone as string | null) ?? (settings?.time_zone as string | undefined) ?? "Asia/Riyadh",
  };
}

// ── The sessions a member presented, for their profile ─────────────────────

export interface PresentedSession {
  id: string;
  title: string;
  state: SessionState;
  startsAt: string | null;
  endsAt: string | null;
  durationMinutes: number | null;
  timeZone: string;
}

/**
 * A33's «الجلسات التي قدّمها» — visible at every tier (SCR-020, wave 7).
 *
 * Accepted presenter rows only, and only sessions a member can see through
 * `sessions_read` and would recognise as having happened or being on the
 * schedule: a draft, an approved session and a cancelled one are not a
 * member's record of presenting. Newest first.
 */
export async function listSessionsPresentedBy(locale: string, memberId: string, limit = 12): Promise<PresentedSession[]> {
  if (!z.uuid().safeParse(memberId).success) return [];
  const { session, supabase } = await sessionClient(locale);
  const { data: rows, error } = await supabase.from("session_presenters").select("session_id").eq("member_id", memberId).eq("accepted", true);
  if (error) throw new Error(`session_presenters: ${error.message}`);
  const ids = (rows ?? []).map((r) => r.session_id as string);
  if (ids.length === 0) return [];
  const [{ data, error: sessionsError }, { data: settings }] = await Promise.all([
    supabase
      .from("sessions")
      .select("id, title, state, starts_at, ends_at, duration_minutes, time_zone")
      .in("id", ids)
      .in("state", ["published", "in_progress", "completed", "archived"])
      .order("starts_at", { ascending: false })
      .limit(limit),
    supabase.from("org_settings").select("time_zone").eq("org_id", session.orgId).maybeSingle(),
  ]);
  if (sessionsError) throw new Error(`sessions.select: ${sessionsError.message}`);
  const orgZone = (settings?.time_zone as string | undefined) ?? "Asia/Riyadh";
  return (data ?? []).map((s) => ({
    id: s.id as string,
    title: s.title as string,
    state: s.state as SessionState,
    startsAt: (s.starts_at as string | null) ?? null,
    endsAt: (s.ends_at as string | null) ?? null,
    durationMinutes: (s.duration_minutes as number | null) ?? null,
    timeZone: (s.time_zone as string | null) ?? orgZone,
  }));
}

// ── The event page (SCR-012, REQ-SES-013, REQ-SES-008, REQ-SES-010) ─────────

export interface EventVenue {
  name: string;
  address: string | null;
  mapUrl: string | null;
  /** True when it is a one-off rather than an entry in the org's list. */
  oneOff: boolean;
}

/**
 * A presenter as the event page's «المُقدِّمون» section draws them (`16` §6.3).
 *
 * ★ No avatar URL. `members.avatar_url` is the Google hotlink DEC-099 retires,
 * so it is not selected at all and the card draws initials — the permanent
 * fallback — until the platform-stored avatar exists.
 */
export interface EventPresenter {
  memberId: string;
  displayName: string | null;
  jobTitle: string | null;
  companyName: string | null;
  /** As the member wrote it (REQ-PRF-001). Never a computed history or a rating (§25 Q5). */
  bio: string | null;
}

export interface EventSessionTag {
  label: string;
  /** The tag's identity in a filter URL — `/app/sessions?tag=…` (REQ-DSC-002). */
  normalised: string;
}

export interface EventSession {
  id: string;
  title: string;
  abstract: string;
  state: SessionState;
  level: SessionLevel;
  language: SessionLanguage;
  categoryId: string | null;
  categoryName: string | null;
  /** The hero's «60 دقيقة» chip. The end time stays authoritative (OQ-001). */
  durationMinutes: number | null;
  tags: EventSessionTag[];
  startsAt: string | null;
  endsAt: string | null;
  timeZone: string;
  venue: EventVenue | null;
  capacity: number | null;
  rsvpDeadlineAt: string | null;
  cancellationCutoffAt: string | null;
  cancellationReason: string | null;
  presenters: EventPresenter[];
  /** The viewer presents this session, so SCR-016 is offered (REQ-CHK-014). */
  viewerIsPresenter: boolean;
  viewerIsStaff: boolean;
  /**
   * ★ The viewer's relation to this session, derived ONCE — DEC-092.
   *
   * An amendment to DEC-045's "ids as props and never rows" slot contract,
   * made explicitly rather than by drift. `16` §5.4.1's claim that gating the
   * four slots on the viewer's relation "is not a new query" was WRONG: this
   * DTO carried `viewerIsPresenter` and `viewerIsStaff` and no RSVP at all —
   * the seat was read inside `RsvpPanel`, through `getRsvpPanelData`. Gating
   * four slots on it would have meant four slots each re-reading it: four
   * extra round trips on the product's most important page.
   *
   * A derived enum is not a row, so the spirit of the contract survives.
   */
  viewerRelation: ViewerRelation;
  /**
   * ★ `sessions.allow_walk_ins` (DEC-065). Not in DEC-092's amendment and
   * needed by it: `canOfferCheckInLink()` takes a THIRD input the
   * (phase, relation) pair cannot encode, because a walk-in switch turns
   * `none` from ineligible into eligible for that session alone.
   */
  allowWalkIns: boolean;
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
      "id, title, abstract, state, level, language, category_id, duration_minutes, starts_at, ends_at, time_zone, capacity, rsvp_deadline_at, cancellation_cutoff_at, cancellation_reason, allow_walk_ins, custom_venue_name, custom_venue_address, custom_venue_map_url, categories(name), venues(name, address, map_url)",
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

  // ★ The two reads DEC-092 buys: the viewer's own seat and their own
  // check-in. In parallel with the presenters, and once — the alternative was
  // four slots each re-reading the RSVP on the product's most important page.
  // RLS scopes both to the viewer, so neither can return anyone else's row.
  const [presentersRes, mineRes, checkInRes, tagsRes] = await Promise.all([
    supabase.from("session_presenters").select("member_id, accepted").eq("session_id", id).eq("accepted", true),
    supabase.from("rsvps").select("status").eq("session_id", id).eq("member_id", session.memberId).maybeSingle(),
    // ★ `removed_at is null` (REQ-CHK-017, 0087): an admin's removal soft-deletes
    // the row and RLS does not hide it, so the reader says «active» itself —
    // and with a removed row beside a re-added one, `.maybeSingle()` would
    // otherwise refuse two rows.
    supabase.from("check_ins").select("id").eq("session_id", id).eq("member_id", session.memberId).is("removed_at", null).maybeSingle(),
    supabase.from("session_tags").select("tags(label, normalised)").eq("session_id", id),
  ]);
  const { data: presenters, error: pErr } = presentersRes;
  if (pErr) throw new Error(`session_presenters: ${pErr.message}`);
  if (tagsRes.error) throw new Error(`session_tags: ${tagsRes.error.message}`);
  const profiles = await presenterProfiles(supabase, (presenters ?? []).map((p) => p.member_id));
  const tags = (tagsRes.data ?? [])
    .map((r) => (r as unknown as { tags: EventSessionTag | null }).tags)
    .filter((t): t is EventSessionTag => t !== null)
    .sort((a, b) => a.label.localeCompare(b.label, "ar"));

  const viewerIsPresenter = (presenters ?? []).some((p) => p.member_id === session.memberId);
  const viewerIsStaff = session.role === "admin" || session.role === "moderator";
  const phase = sessionPhase({
    state: row.state as SessionState,
    startsAt: (row.starts_at as string) ?? null,
    endsAt: (row.ends_at as string) ?? null,
  });
  const relation = deriveRelation(
    {
      isStaff: viewerIsStaff,
      isPresenter: viewerIsPresenter,
      rsvpStatus: (mineRes.data?.status as "confirmed" | "waitlisted" | "cancelled" | "late_cancelled" | undefined) ?? null,
      checkedIn: Boolean(checkInRes.data),
    },
    phase,
  );

  return {
    id: row.id as string,
    title: row.title as string,
    abstract: row.abstract as string,
    state: row.state as SessionState,
    level: row.level as SessionLevel,
    language: row.language as SessionLanguage,
    categoryId: (row.category_id as string) ?? null,
    categoryName: (row.categories as { name: string } | null)?.name ?? null,
    durationMinutes: (row.duration_minutes as number) ?? null,
    tags,
    startsAt: (row.starts_at as string) ?? null,
    endsAt: (row.ends_at as string) ?? null,
    timeZone: (row.time_zone as string) ?? "Asia/Riyadh",
    venue,
    capacity: (row.capacity as number) ?? null,
    rsvpDeadlineAt: (row.rsvp_deadline_at as string) ?? null,
    cancellationCutoffAt: (row.cancellation_cutoff_at as string) ?? null,
    cancellationReason: (row.cancellation_reason as string) ?? null,
    presenters: (presenters ?? []).map(
      (p) => profiles.get(p.member_id) ?? { memberId: p.member_id, displayName: null, jobTitle: null, companyName: null, bio: null },
    ),
    viewerIsPresenter,
    viewerIsStaff,
    viewerRelation: relation,
    allowWalkIns: Boolean(row.allow_walk_ins),
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

// ═══════════════════════════════════════════════════════════════════════════
// The public session card — the owner's decision of 2026-09-15
// ═══════════════════════════════════════════════════════════════════════════
//
// ★ THE ONE PLACE IN THIS MODULE THAT DOES NOT CALL requireSession(), and the
// reason is the whole point of the feature: a shared link has to preview in
// WhatsApp, X and LinkedIn, where the fetch carries no cookie and never will.
// `verifyCertificate()` (lib/dal/certificates.ts) is the same shape for the
// same reason — a stranger with a printed code.
//
// What keeps it honest is that the READ is a narrow SECURITY DEFINER function
// (`session_public_card`), not a widened policy: `anon` still has no policy on
// `sessions`, and the function's RETURN TYPE is the allowlist. Nothing here
// chooses which columns to expose — it cannot, because nothing else is
// reachable. A draft or a cancelled session answers with no row, which the
// route renders as notFound().

export interface PublicSessionCard {
  id: string;
  title: string;
  startsAt: string | null;
  endsAt: string | null;
  timeZone: string;
  /** The venue's NAME. Never its address or its map link — 12 T3's line, and
   *  the owner's decision did not move it. */
  venueName: string | null;
  orgName: string;
  /** Whether a poster `og` render exists. The PATH never leaves this module:
   *  the page asks for `/api/s/{id}/og`, which asks again. */
  hasImage: boolean;
  imageWidth: number | null;
  imageHeight: number | null;
}

interface PublicCardRow {
  title: string;
  starts_at: string | null;
  ends_at: string | null;
  time_zone: string;
  venue_name: string | null;
  org_name: string;
  og_path: string | null;
  og_width: number | null;
  og_height: number | null;
}

async function publicCardRow(id: string): Promise<PublicCardRow | null> {
  if (!z.uuid().safeParse(id).success) return null;
  const supabase = await createServerClient();
  const { data, error } = await supabase.rpc("session_public_card", { p_session: id });
  if (error) return null;
  const row = (Array.isArray(data) ? data[0] : null) as PublicCardRow | null | undefined;
  return row ?? null;
}

/** The card for a public link. `null` for anything that is not a published,
 *  in-progress or completed session of an active org — including a draft and
 *  a cancelled one, which are indistinguishable from an unknown id. */
export async function getPublicSessionCard(id: string): Promise<PublicSessionCard | null> {
  const row = await publicCardRow(id);
  if (!row) return null;
  return {
    id,
    title: row.title,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    timeZone: row.time_zone,
    venueName: row.venue_name,
    orgName: row.org_name,
    hasImage: Boolean(row.og_path),
    imageWidth: row.og_width,
    imageHeight: row.og_height,
  };
}

/** The card's image bytes, for the Route Handler that crawlers fetch.
 *
 *  The object is read as the CALLER — `anon` for a crawler — through the one
 *  storage policy that lets `anon` select an `og.png` of a card-eligible
 *  session (`POL-storage.exports.public_card`). No `service_role` (invariant
 *  7) and no signed URL: a signed URL would expire inside a cached `og:image`
 *  tag, and it would keep working for its lifetime after the session was
 *  cancelled. This stops at the same instant the card does. */
export async function getPublicCardImage(id: string): Promise<{ bytes: ArrayBuffer; contentType: string } | null> {
  const row = await publicCardRow(id);
  if (!row?.og_path) return null;
  const supabase = await createServerClient();
  const { data, error } = await supabase.storage.from("exports").download(row.og_path);
  if (error || !data) return null;
  return { bytes: await data.arrayBuffer(), contentType: "image/png" };
}

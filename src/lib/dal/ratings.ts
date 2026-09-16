import "server-only";
import { z } from "zod";
import { sessionClient } from "@/lib/dal/session";

// Ratings — gated by check-in, anonymous to the presenter, and honest about
// the one exception (REQ-RAT-001 … REQ-RAT-006, D35, D36). The `with check`
// on `ratings_write_self` (0010) already rejects a check-in that is not the
// caller's own and a session that is not `completed`; this module's own
// `getRatingEligibility` exists so the UI can explain *why* before the
// member fills the form, not just reject the submit afterwards.

export interface RatingDTO {
  id: string;
  sessionId: string;
  sessionStars: number;
  presenterStars: number;
  comment: string | null;
  submittedAt: string;
  editedAt: string | null;
}

type RatingRow = {
  id: string;
  session_id: string;
  session_stars: number;
  presenter_stars: number;
  comment: string | null;
  submitted_at: string;
  edited_at: string | null;
};

function toRatingDTO(r: RatingRow): RatingDTO {
  return {
    id: r.id,
    sessionId: r.session_id,
    sessionStars: r.session_stars,
    presenterStars: r.presenter_stars,
    comment: r.comment,
    submittedAt: r.submitted_at,
    editedAt: r.edited_at,
  };
}

function mapRatingError(error: { code?: string; message: string }): Error {
  if (error.code === "23505") return new Error("already_rated");
  if (error.code === "42501") return new Error("not_permitted");
  return new Error(`ratings: ${error.message}`);
}

export interface RatingEligibility {
  eligible: boolean;
  reason: "not_completed" | "not_checked_in" | "window_closed" | null;
  checkInId: string | null;
  windowClosesAt: string | null;
  existing: RatingDTO | null;
}

/** SCR-015's gate, computed ahead of the form (REQ-RAT-001, REQ-RAT-003):
 *  the session must be `completed`, the viewer must hold a check-in for it
 *  (D24 — nothing else grants the right to rate), and the org's rating
 *  window must not have closed. */
export async function getRatingEligibility(locale: string, sessionId: string): Promise<RatingEligibility> {
  const notEligible = (reason: RatingEligibility["reason"], existing: RatingDTO | null = null): RatingEligibility => ({
    eligible: false,
    reason,
    checkInId: null,
    windowClosesAt: null,
    existing,
  });
  if (!z.uuid().safeParse(sessionId).success) return notEligible("not_completed");

  const { session, supabase } = await sessionClient(locale);
  const [{ data: sessionRow }, { data: checkIn }, { data: settings }, { data: existingRow }] = await Promise.all([
    supabase.from("sessions").select("id, state, completed_at").eq("id", sessionId).maybeSingle(),
    supabase.from("check_ins").select("id").eq("session_id", sessionId).eq("member_id", session.memberId).maybeSingle(),
    supabase.from("org_settings").select("rating_window_days").eq("org_id", session.orgId).maybeSingle(),
    supabase
      .from("ratings")
      .select("id, session_id, session_stars, presenter_stars, comment, submitted_at, edited_at")
      .eq("session_id", sessionId)
      .eq("member_id", session.memberId)
      .maybeSingle(),
  ]);

  const existing = existingRow ? toRatingDTO(existingRow as RatingRow) : null;

  if (!sessionRow || sessionRow.state !== "completed" || !sessionRow.completed_at) return notEligible("not_completed", existing);
  if (!checkIn) return notEligible("not_checked_in", existing);

  const windowDays = settings?.rating_window_days ?? 14;
  const closesAt = new Date(new Date(sessionRow.completed_at).getTime() + windowDays * 86_400_000);
  const withinWindow = Date.now() <= closesAt.getTime();
  return {
    eligible: withinWindow,
    reason: withinWindow ? null : "window_closed",
    checkInId: checkIn.id,
    windowClosesAt: closesAt.toISOString(),
    existing,
  };
}

export const submitRatingInput = z.object({
  sessionId: z.uuid(),
  checkInId: z.uuid(),
  sessionStars: z.number().int().min(1).max(5),
  presenterStars: z.number().int().min(1).max(5),
  comment: z.string().trim().max(2000).nullable(),
});
export type SubmitRatingInput = z.infer<typeof submitRatingInput>;

export async function submitRating(locale: string, input: SubmitRatingInput): Promise<void> {
  const { session, supabase } = await sessionClient(locale);
  const { error } = await supabase.from("ratings").insert({
    org_id: session.orgId,
    session_id: input.sessionId,
    member_id: session.memberId,
    check_in_id: input.checkInId,
    session_stars: input.sessionStars,
    presenter_stars: input.presenterStars,
    comment: input.comment || null,
  });
  if (error) throw mapRatingError(error);
}

export const updateRatingInput = z.object({
  ratingId: z.uuid(),
  sessionStars: z.number().int().min(1).max(5),
  presenterStars: z.number().int().min(1).max(5),
  comment: z.string().trim().max(2000).nullable(),
});
export type UpdateRatingInput = z.infer<typeof updateRatingInput>;

/** Editable inside the same window as submission (REQ-RAT-003) — the
 *  `ratings_update_self` policy is the actual gate; a zero-row result here
 *  means the window closed between page load and submit. */
export async function updateRating(locale: string, input: UpdateRatingInput): Promise<void> {
  const { supabase } = await sessionClient(locale);
  const { data, error } = await supabase
    .from("ratings")
    .update({
      session_stars: input.sessionStars,
      presenter_stars: input.presenterStars,
      comment: input.comment || null,
      edited_at: new Date().toISOString(),
    })
    .eq("id", input.ratingId)
    .select("id");
  if (error) throw mapRatingError(error);
  if (!data || data.length === 0) throw new Error("window_closed");
}

export interface PresenterAggregate {
  ratingCount: number;
  sessionAvg: number | null;
  presenterAvg: number | null;
  comments: string[];
}

/** The presenter's window (REQ-RAT-004): aggregates only, unattributed free
 *  text, `null` below `org_settings.rating_min_aggregate` (REQ-RAT-006) —
 *  the caller falls back to `getRatingCount` for the count-only copy. */
export async function getPresenterAggregate(locale: string, sessionId: string): Promise<PresenterAggregate | null> {
  const { supabase } = await sessionClient(locale);
  const { data, error } = await supabase
    .from("session_rating_aggregates")
    .select("rating_count, session_avg, presenter_avg, comments")
    .eq("session_id", sessionId)
    .maybeSingle();
  if (error) throw new Error(`session_rating_aggregates: ${error.message}`);
  if (!data) return null;
  return { ratingCount: data.rating_count, sessionAvg: data.session_avg, presenterAvg: data.presenter_avg, comments: data.comments ?? [] };
}

/** "1 or 2 ratings → the count only, never a value" (REQ-RAT-006) — the view
 *  above withholds the whole row below the minimum, so the bare count comes
 *  from `session_rating_count()` (supabase/proposed/event/04_rating_count_rpc.sql).
 *  Zero for an unrelated member is indistinguishable from "no ratings yet". */
export async function getRatingCount(locale: string, sessionId: string): Promise<number> {
  const { supabase } = await sessionClient(locale);
  const { data, error } = await supabase.rpc("session_rating_count", { p_session: sessionId });
  if (error) throw new Error(`session_rating_count: ${error.message}`);
  return (data as number) ?? 0;
}

/** Org-readable (p1_org_read on session_presenters, 0010) — whether the
 *  viewer presents this session, accepted or not (a pending co-presenter
 *  still gets the presenter's ratings view; the anonymity promise does not
 *  depend on having clicked accept). */
export async function isViewerPresenter(locale: string, sessionId: string): Promise<boolean> {
  const { session, supabase } = await sessionClient(locale);
  const { data, error } = await supabase.from("session_presenters").select("member_id").eq("session_id", sessionId).eq("member_id", session.memberId).maybeSingle();
  if (error) throw new Error(`session_presenters: ${error.message}`);
  return Boolean(data);
}

export interface RatingsSummary {
  eligibility: RatingEligibility;
  isPresenter: boolean;
  isStaff: boolean;
  aggregate: PresenterAggregate | null;
  /** Only fetched when the viewer is staff/presenter and the aggregate is withheld. */
  countForWithheld: number | null;
  minAggregate: number;
}

/**
 * Everything the `Ratings` slot (SCR-012 item 10 — a summary/link, not the
 * form) needs, in one place: is the viewer eligible to rate, or do they
 * present this session and see the aggregate view instead (REQ-RAT-004,
 * REQ-RAT-006)?
 */
export async function getRatingsSummary(locale: string, sessionId: string): Promise<RatingsSummary> {
  const { session, supabase } = await sessionClient(locale);
  const isStaff = session.role === "admin" || session.role === "moderator";

  const [eligibility, isPresenter, { data: settings }] = await Promise.all([
    getRatingEligibility(locale, sessionId),
    isViewerPresenter(locale, sessionId),
    supabase.from("org_settings").select("rating_min_aggregate").eq("org_id", session.orgId).maybeSingle(),
  ]);

  const minAggregate = settings?.rating_min_aggregate ?? 3;

  if (!isPresenter && !isStaff) {
    return { eligibility, isPresenter, isStaff, aggregate: null, countForWithheld: null, minAggregate };
  }

  const aggregate = await getPresenterAggregate(locale, sessionId);
  const countForWithheld = aggregate ? null : await getRatingCount(locale, sessionId);
  return { eligibility, isPresenter, isStaff, aggregate, countForWithheld, minAggregate };
}

export interface AdminRatingRow extends RatingDTO {
  member: { id: string; displayName: string | null; avatarUrl: string | null } | null;
}

/** REQ-RAT-005 — org admin only, and AUDITED: this calls
 *  `list_session_ratings_admin()` (supabase/proposed/event/02_ratings_admin_rpc.sql),
 *  never a bare `select` on `ratings`, so every such read leaves an
 *  `audit_log` row (docs/plan/notes/event.md §0). A moderator gets
 *  `not_permitted`, matching REQ-ADM-020. */
export async function getRatingsForAdmin(locale: string, sessionId: string): Promise<AdminRatingRow[]> {
  const { supabase } = await sessionClient(locale);
  const { data, error } = await supabase.rpc("list_session_ratings_admin", { p_session: sessionId });
  if (error) throw new Error(/not_an_admin|stale_claims/.test(error.message) ? "not_permitted" : `ratings: ${error.message}`);

  const rows = (data ?? []) as Array<RatingRow & { member_id: string }>;
  if (rows.length === 0) return [];

  const memberIds = Array.from(new Set(rows.map((r) => r.member_id)));
  const { data: members, error: memberError } = await supabase.from("members_member_view").select("id, display_name, avatar_url").in("id", memberIds);
  if (memberError) throw new Error(`members_member_view: ${memberError.message}`);
  const byId = new Map((members ?? []).map((m) => [m.id as string, m]));

  return rows.map((r) => ({
    ...toRatingDTO(r),
    member: byId.has(r.member_id)
      ? { id: r.member_id, displayName: byId.get(r.member_id)!.display_name, avatarUrl: byId.get(r.member_id)!.avatar_url }
      : null,
  }));
}

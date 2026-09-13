import type { Task } from "graphile-worker";

// JOB-promote_waitlist (11 §2.2, REQ-RSV-003, REQ-RSV-004). A reconciliation
// safety net, NOT the atomicity mechanism: a cancellation instantly
// promotes the next waitlisted member inline, in the SAME transaction as
// the cancellation (public.cancel_rsvp(), supabase/proposed/checkin/01_rsvp.sql)
// — a queued job runs in a later transaction, which would reopen exactly
// the "no window where a seat is free but unassigned" gap the requirement
// forbids. This job exists for the OTHER way a seat frees: an admin
// raising a session's capacity via a plain UPDATE, which has no RPC to
// hang a promotion off.
//
// public.promote_next_waitlisted() is service_role-only and idempotent —
// it is a no-op once confirmed reservations fill capacity — so running
// this over every open session on any schedule is safe. Payload can name
// one session_id to reconcile just that one (e.g. right after a capacity
// change); with none, it sweeps every published/in-progress session.
export const promote_waitlist: Task = async (payload, helpers) => {
  const sessionId = (payload as { session_id?: string } | null)?.session_id;

  const sessionIds = sessionId
    ? [sessionId]
    : (await helpers.query<{ id: string }>(`select id from public.sessions where state in ('published', 'in_progress')`)).rows.map((r) => r.id);

  let promoted = 0;
  for (const id of sessionIds) {
    // Keep promoting until it returns null — one call fills at most one seat.
    for (;;) {
      const { rows } = await helpers.query<{ promote_next_waitlisted: string | null }>(`select public.promote_next_waitlisted($1)`, [id]);
      if (!rows[0]?.promote_next_waitlisted) break;
      promoted++;
    }
  }

  helpers.logger.info(`promote_waitlist: reconciled ${sessionIds.length} session(s), promoted ${promoted} seat(s)`);
};

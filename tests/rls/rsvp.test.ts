// RSVP: reserve_seat(), cancel_rsvp(), session_seat_counts()
// (03 §5.3, STORY-RSV-001..004, supabase/proposed/checkin/01_rsvp.sql).
//
// `03` §8.2 rows: POL-rsvps.insert.rpc, POL-rsvps.reserve.capacity,
// POL-rsvps.reserve.deadline, POL-rsvps.select.member.

import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { errorCode, errorMessage, PERMISSION_DENIED, pool, type Claims, type Tx, withTx } from "./db";
import { seed, type Org } from "./fixture";

afterAll(() => pool.end());

async function applyRsvpSql(tx: Tx) {
}

/** A throwaway extra member, for tests that need more bodies than the base fixture ships. */
async function addMember(tx: Tx, org: Org, local: string, name: string): Promise<{ memberId: string; claims: Claims }> {
  const email = `${local}@${org.domain}`;
  const authUserId = randomUUID();
  await tx.q(`insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, $3::jsonb)`, [authUserId, email, JSON.stringify({ full_name: name })]);
  const [row] = await tx.q<{ id: string; claims_version: number }>(
    `insert into public.members (org_id, auth_user_id, email, display_name, org_role, company_id) values ($1, $2, $3, $4, 'member', $5) returning id, claims_version`,
    [org.id, authUserId, email, name, org.companyId],
  );
  return {
    memberId: row.id,
    claims: {
      sub: authUserId,
      email,
      org_id: org.id,
      member_id: row.id,
      org_role: "member",
      status: "active",
      claims_version: row.claims_version,
      org_status: "active",
    },
  };
}

/** A published session with capacity, deadline and cutoff under the test's control. */
async function makeSession(
  tx: Tx,
  org: Org,
  opts: { capacity: number; deadlineOffsetMinutes?: number; cutoffOffsetMinutes?: number },
): Promise<string> {
  const deadline = opts.deadlineOffsetMinutes ?? 60 * 47;
  const cutoff = opts.cutoffOffsetMinutes ?? 60 * 47;
  const [row] = await tx.q<{ id: string }>(
    `insert into public.sessions (org_id, title, abstract, category_id, level, starts_at, duration_minutes, ends_at,
                                   venue_id, capacity, rsvp_deadline_at, cancellation_cutoff_at, state, published_at)
     values ($1, 'جلسة اختبار', 'ملخص الجلسة', $2, 'introductory',
             now() + interval '48 hours', 60, now() + interval '49 hours',
             $3, $4, now() + ($5 || ' minutes')::interval, now() + ($6 || ' minutes')::interval,
             'published', now() - interval '1 hour')
     returning id`,
    [org.id, org.categoryId, org.venueId, opts.capacity, String(deadline), String(cutoff)],
  );
  return row.id;
}

describe("POL-rsvps.insert.rpc", () => {
  it("direct insert into rsvps is rejected for member, admin and anon", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await applyRsvpSql(tx);
      await tx.asOwner();
      const sessionId = await makeSession(tx, f.a, { capacity: 5 });

      await tx.as(f.a.members[0].claims);
      expect(await errorCode(() => tx.q(`insert into public.rsvps (org_id, session_id, member_id, status) values ($1, $2, $3, 'confirmed')`, [f.a.id, sessionId, f.a.members[0].memberId]))).toBe(
        PERMISSION_DENIED,
      );

      await tx.as(f.a.admin.claims);
      expect(await errorCode(() => tx.q(`insert into public.rsvps (org_id, session_id, member_id, status) values ($1, $2, $3, 'confirmed')`, [f.a.id, sessionId, f.a.admin.memberId]))).toBe(
        PERMISSION_DENIED,
      );

      await tx.asAnon();
      expect(
        await errorCode(() => tx.q(`insert into public.rsvps (org_id, session_id, member_id, status) values ($1, $2, $3, 'confirmed')`, [f.a.id, sessionId, f.a.members[0].memberId])),
      ).toBe(PERMISSION_DENIED);
    });
  });
});

describe("POL-rsvps.reserve.capacity", () => {
  it("sequential reservations against N-1 seats confirm exactly N-1, waitlist the rest in order, no duplicates", async () => {
    // Caveat (tests/rls/db.ts uses one pooled connection, one transaction per
    // test): this proves the counting logic is correct for any call order —
    // each call sees its own transaction's prior writes — not two physically
    // concurrent connections racing the same `for update` lock.
    await withTx(async (tx) => {
      const f = await seed(tx);
      await applyRsvpSql(tx);
      await tx.asOwner();
      const capacity = 3;
      const sessionId = await makeSession(tx, f.a, { capacity });

      const extra1 = await addMember(tx, f.a, "extra1", "متسابق ١");
      const extra2 = await addMember(tx, f.a, "extra2", "متسابق ٢");
      const contenders = [f.a.admin, ...f.a.members, extra1, extra2];
      expect(contenders.length).toBe(5);

      const results: { status: string; waitlist_position: number | null }[] = [];
      for (const person of contenders) {
        await tx.as(person.claims);
        const [r] = await tx.q<{ status: string; waitlist_position: number | null }>(`select * from public.reserve_seat($1)`, [sessionId]);
        results.push(r);
      }

      const confirmed = results.filter((r) => r.status === "confirmed");
      const waitlisted = results.filter((r) => r.status === "waitlisted");
      expect(confirmed.length).toBe(capacity);
      expect(waitlisted.length).toBe(contenders.length - capacity);
      expect(waitlisted.map((r) => r.waitlist_position).sort((a, b) => (a ?? 0) - (b ?? 0))).toEqual([1, 2]);

      await tx.asOwner();
      const rows = await tx.q(`select member_id from public.rsvps where session_id = $1`, [sessionId]);
      expect(rows.length).toBe(contenders.length); // no duplicates
    });
  });

  it("reserving twice is idempotent — one row, unchanged status", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await applyRsvpSql(tx);
      await tx.asOwner();
      const sessionId = await makeSession(tx, f.a, { capacity: 10 });

      const member = f.a.members[0];
      await tx.as(member.claims);
      const [first] = await tx.q<{ id: string; status: string }>(`select * from public.reserve_seat($1)`, [sessionId]);
      const [second] = await tx.q<{ id: string; status: string }>(`select * from public.reserve_seat($1)`, [sessionId]);
      expect(second.id).toBe(first.id);
      expect(second.status).toBe("confirmed");

      await tx.asOwner();
      const rows = await tx.q(`select id from public.rsvps where session_id = $1 and member_id = $2`, [sessionId, member.memberId]);
      expect(rows.length).toBe(1);
    });
  });
});

describe("POL-rsvps.reserve.deadline", () => {
  it("reserving after rsvp_deadline_at is rejected", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await applyRsvpSql(tx);
      await tx.asOwner();
      const sessionId = await makeSession(tx, f.a, { capacity: 10, deadlineOffsetMinutes: -1 });

      await tx.as(f.a.members[0].claims);
      expect(await errorMessage(() => tx.q(`select * from public.reserve_seat($1)`, [sessionId]))).toMatch(/deadline_passed/);
    });
  });

  it("promotion off an existing waitlist succeeds even after the deadline has passed (OQ-002)", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await applyRsvpSql(tx);
      await tx.asOwner();
      // Deadline far enough out to let both members reserve, then rewound.
      const sessionId = await makeSession(tx, f.a, { capacity: 1, deadlineOffsetMinutes: 60 });

      await tx.as(f.a.members[0].claims);
      const [confirmed] = await tx.q<{ status: string }>(`select * from public.reserve_seat($1)`, [sessionId]);
      expect(confirmed.status).toBe("confirmed");

      await tx.as(f.a.members[1].claims);
      const [waitlisted] = await tx.q<{ status: string }>(`select * from public.reserve_seat($1)`, [sessionId]);
      expect(waitlisted.status).toBe("waitlisted");

      await tx.asOwner();
      await tx.q(`update public.sessions set rsvp_deadline_at = now() - interval '1 minute' where id = $1`, [sessionId]);

      await tx.as(f.a.members[0].claims);
      const [cancelled] = await tx.q<{ status: string }>(`select * from public.cancel_rsvp($1)`, [sessionId]);
      expect(cancelled.status).toBe("cancelled");

      await tx.asOwner();
      const [nowConfirmed] = await tx.q<{ status: string; promoted_at: string | null }>(`select status, promoted_at from public.rsvps where session_id = $1 and member_id = $2`, [
        sessionId,
        f.a.members[1].memberId,
      ]);
      expect(nowConfirmed.status).toBe("confirmed");
      expect(nowConfirmed.promoted_at).not.toBeNull();
    });
  });
});

describe("POL-rsvps.select.member", () => {
  it("member B cannot read member A's RSVP; staff and the presenter can", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx); // already an M2Fixture — f.m2.a.published has a confirmed RSVP seeded
      await applyRsvpSql(tx);
      const owner = f.a.members[1]; // fixture-m2's `attendee`, holds the confirmed RSVP
      const presenter = f.a.members[0]; // fixture-m2's `presenter` on that session

      await tx.asOwner();
      const stranger = await addMember(tx, f.a, "rsvp-stranger", "عضو آخر");

      await tx.as(stranger.claims);
      const asOther = await tx.q(`select id from public.rsvps where session_id = $1 and member_id = $2`, [f.m2.a.published, owner.memberId]);
      expect(asOther).toEqual([]);

      await tx.as(f.a.mod.claims);
      const asStaff = await tx.q(`select id from public.rsvps where session_id = $1 and member_id = $2`, [f.m2.a.published, owner.memberId]);
      expect(asStaff.length).toBe(1);

      await tx.as(presenter.claims);
      const asPresenter = await tx.q(`select id from public.rsvps where session_id = $1 and member_id = $2`, [f.m2.a.published, owner.memberId]);
      expect(asPresenter.length).toBe(1);
    });
  });
});

describe("STORY-RSV-002 — waitlist and atomic promotion", () => {
  it("promotes the first waitlisted member, in strict join order, atomically with the cancellation", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await applyRsvpSql(tx);
      await tx.asOwner();
      const sessionId = await makeSession(tx, f.a, { capacity: 1 });
      const extra = await addMember(tx, f.a, "extra3", "متسابق ٣");
      const order = [f.a.admin, f.a.mod, f.a.members[0], extra];

      for (const person of order) {
        await tx.as(person.claims);
        await tx.q(`select * from public.reserve_seat($1)`, [sessionId]);
      }

      await tx.asOwner();
      const before = await tx.q<{ member_id: string; status: string; waitlist_position: number }>(
        `select member_id, status, waitlist_position from public.rsvps where session_id = $1 and status = 'waitlisted' order by waitlist_position`,
        [sessionId],
      );
      expect(before.map((r) => r.member_id)).toEqual([f.a.mod.memberId, f.a.members[0].memberId, extra.memberId]);

      await tx.as(f.a.admin.claims); // the confirmed holder cancels
      const [cancelled] = await tx.q<{ status: string }>(`select * from public.cancel_rsvp($1)`, [sessionId]);
      expect(cancelled.status).toBe("cancelled");

      await tx.asOwner();
      const [confirmedNow] = await tx.q<{ member_id: string; status: string; promoted_at: string | null }>(
        `select member_id, status, promoted_at from public.rsvps where session_id = $1 and status = 'confirmed'`,
        [sessionId],
      );
      // The FIRST waitlisted member (join order) was promoted — not the second or third.
      expect(confirmedNow.member_id).toBe(f.a.mod.memberId);
      expect(confirmedNow.promoted_at).not.toBeNull();

      const stillWaitlisted = await tx.q<{ member_id: string }>(`select member_id from public.rsvps where session_id = $1 and status = 'waitlisted' order by waitlist_position`, [sessionId]);
      expect(stillWaitlisted.map((r) => r.member_id)).toEqual([f.a.members[0].memberId, extra.memberId]);
    });
  });
});

describe("STORY-RSV-003 — deadline and cutoff", () => {
  it("cancelling before the cutoff is 'cancelled'; after the cutoff is 'late_cancelled'", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await applyRsvpSql(tx);
      await tx.asOwner();
      const early = await makeSession(tx, f.a, { capacity: 5, cutoffOffsetMinutes: 60 });
      const late = await makeSession(tx, f.a, { capacity: 5, cutoffOffsetMinutes: -1 });

      await tx.as(f.a.members[0].claims);
      await tx.q(`select * from public.reserve_seat($1)`, [early]);
      const [onTime] = await tx.q<{ status: string; was_late_cancellation: boolean }>(`select * from public.cancel_rsvp($1)`, [early]);
      expect(onTime.status).toBe("cancelled");
      expect(onTime.was_late_cancellation).toBe(false);

      await tx.q(`select * from public.reserve_seat($1)`, [late]);
      const [lateResult] = await tx.q<{ status: string; was_late_cancellation: boolean }>(`select * from public.cancel_rsvp($1)`, [late]);
      expect(lateResult.status).toBe("late_cancelled");
      expect(lateResult.was_late_cancellation).toBe(true);
    });
  });
});

describe("STORY-RSV-004 — leaving the waitlist is always free", () => {
  it("a waitlisted member who cancels past the cutoff is still 'cancelled', never 'late_cancelled'", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await applyRsvpSql(tx);
      await tx.asOwner();
      const sessionId = await makeSession(tx, f.a, { capacity: 1, cutoffOffsetMinutes: -1 });

      await tx.as(f.a.admin.claims);
      await tx.q(`select * from public.reserve_seat($1)`, [sessionId]);

      await tx.as(f.a.members[0].claims);
      const [waitlisted] = await tx.q<{ status: string }>(`select * from public.reserve_seat($1)`, [sessionId]);
      expect(waitlisted.status).toBe("waitlisted");

      const [result] = await tx.q<{ status: string; was_late_cancellation: boolean }>(`select * from public.cancel_rsvp($1)`, [sessionId]);
      expect(result.status).toBe("cancelled");
      expect(result.was_late_cancellation).toBe(false);
    });
  });
});

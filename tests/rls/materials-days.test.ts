// content, wave 9 (DEC-119, DEC-120, DEC-121, DEC-150) — T1/T3: rescope_material() and the
// day-scoped «بعد» release. New behaviour, new file (rule 4) — materials-schema.test.ts is
// untouched. Applied with applyProposed() inside each test's rolled-back transaction (DEC-040).
//
// Days are placed the way `tests/rls/session-days.test.ts`'s own `addDay()` does — integer hour
// offsets from `now()`, chosen with wide, obvious gaps between them — rather than ad hoc interval
// arithmetic: a session_days_no_overlap collision is easy to introduce by accident when two
// windows are each computed independently, and easy to rule out at a glance when they are not.
import { afterAll, describe, expect, it } from "vitest";
import { applyProposed, errorCode, PERMISSION_DENIED, pool, withTx, type Tx } from "./db";
import { seed } from "./fixture";

afterAll(() => pool.end());

const FOREIGN_KEY_VIOLATION = "23503";

async function apply(tx: Tx) {
  await applyProposed(tx, "content/0001_day_scope_writes.sql");
  await applyProposed(tx, "content/0002_materials_phase_by_scope.sql");
}

/** A day written the way a day-aware RPC writes one: as the owner, offsets in hours from now. */
async function addDay(tx: Tx, orgId: string, sessionId: string, venueId: string, fromH: number, toH: number) {
  const [row] = await tx.q<{ id: string }>(
    `insert into public.session_days (org_id, session_id, starts_at, ends_at, venue_id)
     values ($1, $2, now() + ($3 || ' hours')::interval, now() + ($4 || ' hours')::interval, $5) returning id`,
    [orgId, sessionId, String(fromH), String(toH), venueId],
  );
  return row.id as string;
}

/** A three-day session, built directly (owner) rather than through schedule_session() — this
 * suite proves the READ/rescope behaviour against a day set, not the scheduling form. Day 1
 * (the session's own window, auto-created by trigger A, 0100) is `-72 .. -70` — ended, days ago.
 * Day 2 is `-1 .. 2` — spans "now", still running. Day 3 is `48 .. 50` — has not begun. The gaps
 * are wide on purpose, so a later `update` moving one of them can never collide with another. */
async function seedThreeDaySession(tx: Tx, orgId: string, categoryId: string, venueId: string, presenterId: string, state: string = "published") {
  const [session] = await tx.q<{ id: string }>(
    `insert into public.sessions (org_id, title, abstract, category_id, level, starts_at, duration_minutes, ends_at,
                                   venue_id, capacity, rsvp_deadline_at, cancellation_cutoff_at, state, published_at, completed_at)
     values ($1, 'ورشة ثلاثية الأيام', 'ملخص', $2, 'introductory',
             now() - interval '72 hours', 120, now() - interval '70 hours',
             $3, 30, now() - interval '96 hours', now() - interval '96 hours', $4::public.session_state,
             now() - interval '120 hours', case when $4 = 'completed' then now() - interval '1 hour' end)
     returning id`,
    [orgId, categoryId, venueId, state],
  );
  const sessionId = session.id as string;
  await tx.q(`insert into public.session_presenters (org_id, session_id, member_id, accepted) values ($1, $2, $3, true)`, [orgId, sessionId, presenterId]);

  // Day 1 already exists (trigger A, 0100) with the session's own window — ended.
  const [day1] = await tx.q<{ id: string }>(`select id from public.session_days where session_id = $1`, [sessionId]);
  const day2Id = await addDay(tx, orgId, sessionId, venueId, -1, 2); // running right now
  const day3Id = await addDay(tx, orgId, sessionId, venueId, 48, 50); // has not begun
  return { sessionId, day1Id: day1.id as string, day2Id, day3Id };
}

async function seedDayScopedMaterial(tx: Tx, orgId: string, sessionId: string, dayId: string | null, presenterId: string, phase: "before" | "after" = "after") {
  const [row] = await tx.q<{ id: string }>(
    `insert into public.materials (org_id, session_id, session_day_id, kind, title, phase, added_by)
     values ($1, $2, $3, 'pdf', 'مادة', $4, $5) returning id`,
    [orgId, sessionId, dayId, phase, presenterId],
  );
  return row.id as string;
}

describe("RPC-rescope_material", () => {
  it("the presenter and staff may move a material between the session and one of its own days; a plain member is refused", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await tx.asOwner();
      await apply(tx);
      const { sessionId, day1Id, day2Id } = await seedThreeDaySession(tx, f.a.id, f.a.categoryId, f.a.venueId, f.a.members[0].memberId);
      const materialId = await seedDayScopedMaterial(tx, f.a.id, sessionId, null, f.a.members[0].memberId);

      await tx.as(f.a.members[1].claims); // attendee, not this session's presenter
      expect(await errorCode(() => tx.q(`select public.rescope_material($1, $2)`, [materialId, day1Id]))).toBe(PERMISSION_DENIED);

      await tx.as(f.a.members[0].claims); // the presenter
      const [afterPresenter] = await tx.q<{ session_day_id: string | null }>(`select r.session_day_id from public.rescope_material($1, $2) r`, [materialId, day1Id]);
      expect(afterPresenter.session_day_id).toBe(day1Id);

      await tx.as(f.a.mod.claims); // staff (moderator) — not the presenter, still allowed
      const [afterStaff] = await tx.q<{ session_day_id: string | null }>(`select r.session_day_id from public.rescope_material($1, $2) r`, [materialId, day2Id]);
      expect(afterStaff.session_day_id).toBe(day2Id);

      // Back to the session — day_id null is the other direction of the same chip.
      const [afterSession] = await tx.q<{ session_day_id: string | null }>(`select r.session_day_id from public.rescope_material($1, null) r`, [materialId]);
      expect(afterSession.session_day_id).toBeNull();
    });
  });

  it("★ RPC-rescope_material.day_of_own_session — a day of a DIFFERENT session is refused before the bare FK violation", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await tx.asOwner();
      await apply(tx);
      const a = await seedThreeDaySession(tx, f.a.id, f.a.categoryId, f.a.venueId, f.a.members[0].memberId);
      const otherSession = await seedThreeDaySession(tx, f.a.id, f.a.categoryId, f.a.venueId, f.a.members[0].memberId);
      const materialId = await seedDayScopedMaterial(tx, f.a.id, a.sessionId, null, f.a.members[0].memberId);

      await tx.as(f.a.members[0].claims);
      const code = await errorCode(() => tx.q(`select public.rescope_material($1, $2)`, [materialId, otherSession.day1Id]));
      expect(code).toBe(FOREIGN_KEY_VIOLATION);
    });
  });

  it("★ RPC-rescope_material.audited — a successful rescope writes one material.rescoped row naming the old and new day", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await tx.asOwner();
      await apply(tx);
      const { sessionId, day1Id } = await seedThreeDaySession(tx, f.a.id, f.a.categoryId, f.a.venueId, f.a.members[0].memberId);
      const materialId = await seedDayScopedMaterial(tx, f.a.id, sessionId, null, f.a.members[0].memberId);

      await tx.as(f.a.members[0].claims);
      await tx.q(`select public.rescope_material($1, $2)`, [materialId, day1Id]);

      await tx.asOwner();
      const rows = await tx.q<{ action: string; subject_id: string; before: { session_day_id: string | null }; after: { session_day_id: string | null } }>(
        `select action, subject_id, before, after from public.audit_log where action = 'material.rescoped' and subject_id = $1`,
        [materialId],
      );
      expect(rows.length).toBe(1);
      expect(rows[0].before.session_day_id).toBeNull();
      expect(rows[0].after.session_day_id).toBe(day1Id);
    });
  });

  it("a proposal's own material (no session, no days) is refused not_found", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await tx.asOwner();
      await apply(tx);
      const [proposalMaterial] = await tx.q<{ id: string }>(
        `insert into public.materials (org_id, proposal_id, kind, title, phase, added_by) values ($1, $2, 'pdf', 'م', 'after', $3) returning id`,
        [f.a.id, f.m2.a.proposal, f.a.members[0].memberId],
      );
      await tx.as(f.a.members[0].claims);
      expect(await errorCode(() => tx.q(`select public.rescope_material($1, null)`, [proposalMaterial.id]))).toBe("P0002");
    });
  });
});

describe("POL-materials.day_scoped_after_release", () => {
  it("a day-scoped «بعد» material is hidden from a plain member until ITS OWN day ends, visible to the presenter and staff meanwhile, then visible to everyone", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await tx.asOwner();
      await apply(tx);
      // day3 (48 .. 50) has not begun — the material must stay hidden from a plain member.
      const { sessionId, day3Id } = await seedThreeDaySession(tx, f.a.id, f.a.categoryId, f.a.venueId, f.a.members[0].memberId);
      const materialId = await seedDayScopedMaterial(tx, f.a.id, sessionId, day3Id, f.a.members[0].memberId, "after");

      await tx.as(f.a.members[1].claims); // plain member
      expect(await tx.q(`select id from public.materials where id = $1`, [materialId])).toEqual([]);

      await tx.as(f.a.members[0].claims); // the presenter — sees it regardless of phase
      expect((await tx.q(`select id from public.materials where id = $1`, [materialId])).length).toBe(1);

      await tx.as(f.a.mod.claims); // staff — sees it regardless of phase
      expect((await tx.q(`select id from public.materials where id = $1`, [materialId])).length).toBe(1);

      // Move day3 into the past: -6 .. -4 — clear of day1 (-72..-70) and day2 (-1..2) alike, so
      // session_days_no_overlap never fires.
      await tx.asOwner();
      await tx.q(`update public.session_days set starts_at = now() - interval '6 hours', ends_at = now() - interval '4 hours' where id = $1`, [day3Id]);

      await tx.as(f.a.members[1].claims);
      expect((await tx.q(`select id from public.materials where id = $1`, [materialId])).length).toBe(1);
    });
  });

  it("★ POL-materials.day_scoped_after_release_on_early_completion — a day-scoped «بعد» material releases when the SESSION completes early, even though its own day has not ended yet", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await tx.asOwner();
      await apply(tx);
      // The session is marked `completed` while day3 (its own day) is still in the future.
      const { sessionId, day3Id } = await seedThreeDaySession(tx, f.a.id, f.a.categoryId, f.a.venueId, f.a.members[0].memberId, "completed");
      const materialId = await seedDayScopedMaterial(tx, f.a.id, sessionId, day3Id, f.a.members[0].memberId, "after");

      await tx.as(f.a.members[1].claims);
      expect((await tx.q(`select id from public.materials where id = $1`, [materialId])).length).toBe(1);
    });
  });

  it("a session-scoped «بعد» material is unaffected — released only when the session completes, exactly as before this file", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await tx.asOwner();
      await apply(tx);
      const { sessionId } = await seedThreeDaySession(tx, f.a.id, f.a.categoryId, f.a.venueId, f.a.members[0].memberId, "published");
      const materialId = await seedDayScopedMaterial(tx, f.a.id, sessionId, null, f.a.members[0].memberId, "after");

      await tx.as(f.a.members[1].claims);
      expect(await tx.q(`select id from public.materials where id = $1`, [materialId])).toEqual([]);
    });
  });
});

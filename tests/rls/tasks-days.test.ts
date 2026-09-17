// content, wave 9 (DEC-119, DEC-120, DEC-121, DEC-150) — T1: session_tasks' day-scoped write path
// and rescope_task(). New behaviour, new file (rule 4) — tasks-schema.test.ts is untouched.
// Applied with applyProposed() inside each test's rolled-back transaction (DEC-040).
//
// Days are placed the way `tests/rls/session-days.test.ts`'s own `addDay()` does — integer hour
// offsets from `now()`, chosen with wide, obvious gaps between them.
import { afterAll, describe, expect, it } from "vitest";
import { applyProposed, errorCode, PERMISSION_DENIED, pool, withTx, type Tx } from "./db";
import { seed } from "./fixture";

afterAll(() => pool.end());

const FOREIGN_KEY_VIOLATION = "23503";

async function apply(tx: Tx) {
  await applyProposed(tx, "content/0001_day_scope_writes.sql");
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

// Day 1 (the session's own window, auto-created by trigger A, 0100) is `-72 .. -70`. Day 2 is
// `48 .. 50` — well clear, so a second call in the same test (two independent sessions) never
// collides with the first's days either (the exclusion constraint is scoped per session_id, but
// wide gaps make every window trivially non-overlapping at a glance regardless).
async function seedThreeDaySession(tx: Tx, orgId: string, categoryId: string, venueId: string, presenterId: string) {
  const [session] = await tx.q<{ id: string }>(
    `insert into public.sessions (org_id, title, abstract, category_id, level, starts_at, duration_minutes, ends_at,
                                   venue_id, capacity, rsvp_deadline_at, cancellation_cutoff_at, state, published_at)
     values ($1, 'ورشة ثلاثية الأيام', 'ملخص', $2, 'introductory',
             now() - interval '72 hours', 120, now() - interval '70 hours',
             $3, 30, now() - interval '96 hours', now() - interval '96 hours', 'published', now() - interval '120 hours')
     returning id`,
    [orgId, categoryId, venueId],
  );
  const sessionId = session.id as string;
  await tx.q(`insert into public.session_presenters (org_id, session_id, member_id, accepted) values ($1, $2, $3, true)`, [orgId, sessionId, presenterId]);
  const [day1] = await tx.q<{ id: string }>(`select id from public.session_days where session_id = $1`, [sessionId]);
  const day2Id = await addDay(tx, orgId, sessionId, venueId, 48, 50);
  return { sessionId, day1Id: day1.id as string, day2Id };
}

describe("session_tasks — writing an optional day", () => {
  it("the presenter's insert may name a day of its own session; task_tasks' read policy (org-wide) is unchanged by scope", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await tx.asOwner();
      await apply(tx);
      const { sessionId, day1Id } = await seedThreeDaySession(tx, f.a.id, f.a.categoryId, f.a.venueId, f.a.members[0].memberId);

      await tx.as(f.a.members[0].claims);
      const [task] = await tx.q<{ id: string; session_day_id: string | null }>(
        `insert into public.session_tasks (org_id, session_id, session_day_id, kind, title) values ($1, $2, $3, 'checklist', 'أحضر جهازك') returning id, session_day_id`,
        [f.a.id, sessionId, day1Id],
      );
      expect(task.session_day_id).toBe(day1Id);

      // p1_org_read (0037) is unconditional — a plain member reads a day-scoped task exactly like
      // a session-scoped one, REQ-TSK-002's own "reminder-only" invariant untouched by this file.
      await tx.as(f.a.members[1].claims);
      expect((await tx.q(`select id from public.session_tasks where id = $1`, [task.id])).length).toBe(1);
    });
  });

  it("a day naming a DIFFERENT session is refused by the composite FK (23503)", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await tx.asOwner();
      await apply(tx);
      const a = await seedThreeDaySession(tx, f.a.id, f.a.categoryId, f.a.venueId, f.a.members[0].memberId);
      const b = await seedThreeDaySession(tx, f.a.id, f.a.categoryId, f.a.venueId, f.a.members[0].memberId);

      await tx.as(f.a.members[0].claims);
      expect(
        await errorCode(() =>
          tx.q(`insert into public.session_tasks (org_id, session_id, session_day_id, kind, title) values ($1, $2, $3, 'checklist', 'x')`, [
            f.a.id,
            a.sessionId,
            b.day1Id,
          ]),
        ),
      ).toBe(FOREIGN_KEY_VIOLATION);
    });
  });
});

describe("RPC-rescope_task", () => {
  it("the presenter and staff may move a task between the session and one of its own days; a plain member is refused", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await tx.asOwner();
      await apply(tx);
      const { sessionId, day1Id, day2Id } = await seedThreeDaySession(tx, f.a.id, f.a.categoryId, f.a.venueId, f.a.members[0].memberId);
      const [task] = await tx.q<{ id: string }>(
        `insert into public.session_tasks (org_id, session_id, kind, title) values ($1, $2, 'checklist', 'مهمة') returning id`,
        [f.a.id, sessionId],
      );

      await tx.as(f.a.members[1].claims);
      expect(await errorCode(() => tx.q(`select public.rescope_task($1, $2)`, [task.id, day1Id]))).toBe(PERMISSION_DENIED);

      await tx.as(f.a.members[0].claims);
      const [afterPresenter] = await tx.q<{ session_day_id: string | null }>(`select r.session_day_id from public.rescope_task($1, $2) r`, [task.id, day1Id]);
      expect(afterPresenter.session_day_id).toBe(day1Id);

      await tx.as(f.a.mod.claims);
      const [afterStaff] = await tx.q<{ session_day_id: string | null }>(`select r.session_day_id from public.rescope_task($1, $2) r`, [task.id, day2Id]);
      expect(afterStaff.session_day_id).toBe(day2Id);
    });
  });

  it("★ RPC-rescope_task.day_of_own_session — a day of a DIFFERENT session is refused before the bare FK violation", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await tx.asOwner();
      await apply(tx);
      const a = await seedThreeDaySession(tx, f.a.id, f.a.categoryId, f.a.venueId, f.a.members[0].memberId);
      const b = await seedThreeDaySession(tx, f.a.id, f.a.categoryId, f.a.venueId, f.a.members[0].memberId);
      const [task] = await tx.q<{ id: string }>(
        `insert into public.session_tasks (org_id, session_id, kind, title) values ($1, $2, 'checklist', 'مهمة') returning id`,
        [f.a.id, a.sessionId],
      );

      await tx.as(f.a.members[0].claims);
      expect(await errorCode(() => tx.q(`select public.rescope_task($1, $2)`, [task.id, b.day1Id]))).toBe(FOREIGN_KEY_VIOLATION);
    });
  });
});

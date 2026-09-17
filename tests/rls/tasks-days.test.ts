// content, wave 9 (DEC-119, DEC-120, DEC-121, DEC-150) — T1: session_tasks' day-scoped write path
// and rescope_task(). New behaviour, new file (rule 4) — tasks-schema.test.ts is untouched.
// Applied with applyProposed() inside each test's rolled-back transaction (DEC-040).
import { afterAll, describe, expect, it } from "vitest";
import { applyProposed, errorCode, PERMISSION_DENIED, pool, withTx, type Tx } from "./db";
import { seed } from "./fixture";

afterAll(() => pool.end());

const FOREIGN_KEY_VIOLATION = "23503";

async function apply(tx: Tx) {
  await applyProposed(tx, "content/0001_day_scope_writes.sql");
}

async function seedThreeDaySession(tx: Tx, orgId: string, categoryId: string, venueId: string, presenterId: string) {
  const [session] = await tx.q<{ id: string }>(
    `insert into public.sessions (org_id, title, abstract, category_id, level, starts_at, duration_minutes, ends_at,
                                   venue_id, capacity, rsvp_deadline_at, cancellation_cutoff_at, state, published_at)
     values ($1, 'ورشة ثلاثية الأيام', 'ملخص', $2, 'introductory',
             now() - interval '3 days', 120, now() - interval '3 days' + interval '2 hours',
             $3, 30, now() - interval '4 days', now() - interval '4 days', 'published', now() - interval '5 days')
     returning id`,
    [orgId, categoryId, venueId],
  );
  const sessionId = session.id as string;
  await tx.q(`insert into public.session_presenters (org_id, session_id, member_id, accepted) values ($1, $2, $3, true)`, [orgId, sessionId, presenterId]);
  const [day1] = await tx.q<{ id: string }>(`select id from public.session_days where session_id = $1`, [sessionId]);
  const [day2] = await tx.q<{ id: string }>(
    `insert into public.session_days (org_id, session_id, starts_at, ends_at, venue_id)
     values ($1, $2, now() + interval '1 day', now() + interval '1 day' + interval '2 hours', $3) returning id`,
    [orgId, sessionId, venueId],
  );
  return { sessionId, day1Id: day1.id as string, day2Id: day2.id as string };
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

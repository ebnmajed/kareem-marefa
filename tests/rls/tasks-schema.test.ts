// session_tasks / task_completions / task_form_responses — 02 §4.6, 03 §5.5b
// (verbatim), REQ-TSK-001…005. Applied with applyProposed() inside each
// test's rolled-back transaction (DEC-040).
import { afterAll, describe, expect, it } from "vitest";
import { errorCode, PERMISSION_DENIED, pool, withTx } from "./db";
import { seed } from "./fixture";

afterAll(() => pool.end());

const CHECK_VIOLATION = "23514";

describe("POL-session_tasks.write.presenter", () => {
  it("a member who is not a presenter cannot insert a session task; the presenter and an admin can", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      // Promoted as migration 0037 at wave-2 sync 5: applied by `supabase db reset`.

      await tx.as(f.a.members[1].claims);
      expect(
        await errorCode(() =>
          tx.q(`insert into public.session_tasks (org_id, session_id, kind, title) values ($1, $2, 'checklist', 'أحضر جهازك المحمول')`, [
            f.a.id,
            f.m2.a.published,
          ]),
        ),
      ).toBe(PERMISSION_DENIED);

      await tx.as(f.a.members[0].claims);
      const [task] = await tx.q<{ id: string }>(
        `insert into public.session_tasks (org_id, session_id, kind, title) values ($1, $2, 'checklist', 'أحضر جهازك المحمول') returning id`,
        [f.a.id, f.m2.a.published],
      );
      expect(task.id).toBeTruthy();

      await tx.as(f.a.admin.claims);
      const [task2] = await tx.q<{ id: string }>(
        `insert into public.session_tasks (org_id, session_id, kind, title, external_url) values ($1, $2, 'external', 'ثبّت التطبيق', 'https://example.com') returning id`,
        [f.a.id, f.m2.a.published],
      );
      expect(task2.id).toBeTruthy();
    });
  });

  it("a non-presenter member's update and delete leave the row untouched; the presenter's and an admin's succeed", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      // Promoted as migration 0037 at wave-2 sync 5: applied by `supabase db reset`.
      await tx.asOwner();
      const [task] = await tx.q<{ id: string }>(
        `insert into public.session_tasks (org_id, session_id, kind, title) values ($1, $2, 'checklist', 'قبل الأصلي') returning id`,
        [f.a.id, f.m2.a.published],
      );

      await tx.as(f.a.members[1].claims);
      await tx.q(`update public.session_tasks set title = 'محاولة' where id = $1`, [task.id]);
      await tx.q(`delete from public.session_tasks where id = $1`, [task.id]);
      await tx.asOwner();
      const [row] = await tx.q<{ title: string }>(`select title from public.session_tasks where id = $1`, [task.id]);
      expect(row.title).toBe("قبل الأصلي");

      await tx.as(f.a.members[0].claims);
      await tx.q(`update public.session_tasks set title = 'بعد التعديل' where id = $1`, [task.id]);
      const [row2] = await tx.q<{ title: string }>(`select title from public.session_tasks where id = $1`, [task.id]);
      expect(row2.title).toBe("بعد التعديل");

      await tx.as(f.a.admin.claims);
      await tx.q(`delete from public.session_tasks where id = $1`, [task.id]);
      await tx.asOwner();
      expect(await tx.q(`select id from public.session_tasks where id = $1`, [task.id])).toEqual([]);
    });
  });

  it("kind and its matching column are enforced together (REQ-TSK-001)", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      // Promoted as migration 0037 at wave-2 sync 5: applied by `supabase db reset`.
      await tx.as(f.a.members[0].claims);
      expect(
        await errorCode(() =>
          tx.q(`insert into public.session_tasks (org_id, session_id, kind, title) values ($1, $2, 'form', 'استبيان')`, [f.a.id, f.m2.a.published]),
        ),
      ).toBe(CHECK_VIOLATION);
      const ok = await tx.q(
        `insert into public.session_tasks (org_id, session_id, kind, title, form_schema) values ($1, $2, 'form', 'استبيان', '{}'::jsonb) returning id`,
        [f.a.id, f.m2.a.published],
      );
      expect(ok.length).toBe(1);
    });
  });
});

describe("POL-task_completions.self", () => {
  it("a member marks only their own task complete; the presenter reads it, a moderator does not (03 §5.5: P7 + presenter, no staff carve-out)", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      // Promoted as migration 0037 at wave-2 sync 5: applied by `supabase db reset`.
      await tx.asOwner();
      const [task] = await tx.q<{ id: string }>(
        `insert into public.session_tasks (org_id, session_id, kind, title) values ($1, $2, 'checklist', 'مهمة') returning id`,
        [f.a.id, f.m2.a.published],
      );

      await tx.as(f.a.members[1].claims);
      expect(
        await errorCode(() =>
          tx.q(`insert into public.task_completions (org_id, task_id, member_id) values ($1, $2, $3)`, [f.a.id, task.id, f.a.members[0].memberId]),
        ),
      ).toBe(PERMISSION_DENIED);

      const [c] = await tx.q<{ id: string }>(
        `insert into public.task_completions (org_id, task_id, member_id) values ($1, $2, $3) returning id`,
        [f.a.id, task.id, f.a.members[1].memberId],
      );
      expect(c.id).toBeTruthy();

      await tx.as(f.a.members[0].claims); // the session's presenter
      expect((await tx.q(`select id from public.task_completions where id = $1`, [c.id])).length).toBe(1);

      await tx.as(f.a.mod.claims);
      expect(await tx.q(`select id from public.task_completions where id = $1`, [c.id])).toEqual([]);
    });
  });
});

describe("POL-task_form_responses.select", () => {
  it("a moderator reading form responses gets nothing (REQ-ADM-020); the presenter, the admin and the author can", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      // Promoted as migration 0037 at wave-2 sync 5: applied by `supabase db reset`.
      await tx.asOwner();
      const [task] = await tx.q<{ id: string }>(
        `insert into public.session_tasks (org_id, session_id, kind, title, form_schema) values ($1, $2, 'form', 'استبيان', '{}'::jsonb) returning id`,
        [f.a.id, f.m2.a.published],
      );

      await tx.as(f.a.members[1].claims);
      const [r] = await tx.q<{ id: string }>(
        `insert into public.task_form_responses (org_id, task_id, member_id, response) values ($1, $2, $3, '{"a":1}'::jsonb) returning id`,
        [f.a.id, task.id, f.a.members[1].memberId],
      );

      await tx.as(f.a.mod.claims);
      expect(await tx.q(`select id from public.task_form_responses where id = $1`, [r.id])).toEqual([]);

      await tx.as(f.a.members[0].claims); // presenter
      expect((await tx.q(`select id from public.task_form_responses where id = $1`, [r.id])).length).toBe(1);

      await tx.as(f.a.admin.claims);
      expect((await tx.q(`select id from public.task_form_responses where id = $1`, [r.id])).length).toBe(1);

      await tx.as(f.a.members[1].claims); // the author
      expect((await tx.q(`select id from public.task_form_responses where id = $1`, [r.id])).length).toBe(1);
    });
  });

  it("a member cannot write another member's response", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      // Promoted as migration 0037 at wave-2 sync 5: applied by `supabase db reset`.
      await tx.asOwner();
      const [task] = await tx.q<{ id: string }>(
        `insert into public.session_tasks (org_id, session_id, kind, title, form_schema) values ($1, $2, 'form', 'استبيان', '{}'::jsonb) returning id`,
        [f.a.id, f.m2.a.published],
      );
      await tx.as(f.a.members[1].claims);
      expect(
        await errorCode(() =>
          tx.q(`insert into public.task_form_responses (org_id, task_id, member_id, response) values ($1, $2, $3, '{}'::jsonb)`, [
            f.a.id,
            task.id,
            f.a.members[0].memberId,
          ]),
        ),
      ).toBe(PERMISSION_DENIED);
    });
  });
});

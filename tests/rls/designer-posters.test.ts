// The three poster paths and the live/detached rule — 02 §4.13, 03 §5.9,
// REQ-DSG-001, REQ-DSG-002, REQ-DSG-003, DEC-012, 11 §2.5.
//
// ★ THE ASYMMETRY IS THE DECISION, and it is what this file exists to hold:
// a LIVE poster is a pure function of template plus data, so a change
// regenerates it; a DETACHED one carries somebody's judgement, so a change
// marks it for review and renders NOTHING. Everything else here is
// scaffolding around those two sentences.
import { existsSync } from "node:fs";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { applyProposed, errorCode, PERMISSION_DENIED, pool, withTx, type Tx } from "./db";
import { seed } from "./fixture";

afterAll(() => pool.end());

const PROPOSED = ["designer/0005_poster_pipeline.sql"];

async function setup(tx: Tx) {
  const f = await seed(tx);
  for (const file of PROPOSED) {
    if (existsSync(join(process.cwd(), "supabase", "proposed", file))) await applyProposed(tx, file);
  }
  await tx.asOwner();
  // fixture-m6 seeds every M6 table on both orgs (DEC-049); these cases
  // COUNT posters and queue rows, so they start from an empty M6 world.
  for (const t of ["certificates", "export_artifacts", "session_posters", "design_documents"]) {
    await tx.q(`delete from public.${t}`);
  }
  await tx.q(`delete from graphile_worker._private_jobs`);
  return f;
}

const posterJobs = (tx: Tx) =>
  tx.q<{ key: string; task_identifier: string; queue_name: string }>(
    `select key, task_identifier, queue_name from graphile_worker.jobs where task_identifier = 'regenerate_poster' order by key`,
  );

/** A session sitting at `approved`, ready to have the publish EDGE walked.
 *
 *  The fixture's session is already published and 0024's guard is
 *  forward-only (DEC-045), so the edge cannot be re-walked on it — a fresh
 *  row is the only honest way to observe the transition. Copied from the
 *  fixture's own published session so every NOT NULL and every check is
 *  satisfied by construction rather than by a column list that rots. */
async function approvedSession(tx: Tx, from: string, title: string): Promise<string> {
  const [row] = await tx.q<{ id: string }>(
    `insert into public.sessions (org_id, title, abstract, category_id, level, language, starts_at, duration_minutes,
                                  ends_at, time_zone, venue_id, capacity, state)
     select org_id, $2, abstract, category_id, level, language, starts_at, duration_minutes,
            ends_at, time_zone, venue_id, capacity, 'approved'
       from public.sessions where id = $1
     returning id`,
    [from, title],
  );
  await tx.q(`delete from graphile_worker._private_jobs`);
  return row.id;
}

async function publish(tx: Tx, sessionId: string) {
  await tx.q(`update public.sessions set state = 'published', published_at = now() where id = $1`, [sessionId]);
}

describe("POL-session_posters.publish", () => {
  it("★ REQ-DSG-001: publishing a session enqueues one regeneration, with 11 §2.5's key", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      const sessionId = await approvedSession(tx, f.m2.a.published, "جلسة تُنشر الآن");
      await publish(tx, sessionId);

      const jobs = await posterJobs(tx);
      expect(jobs).toHaveLength(1);
      expect(jobs[0]?.key).toBe(`poster:${sessionId}`);
      // 11 §1.4: its own queue, so one 30-second A3 never starves a reminder.
      expect(jobs[0]?.queue_name).toBe("render");
    });
  });

  it("fires on the EDGE, so a publish that walks four states announces once", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      const sessionId = await approvedSession(tx, f.m2.a.published, "جلسة تُنشر مرة واحدة");
      await publish(tx, sessionId);
      // Already published: touching it again without leaving the state must
      // not enqueue a second publish job (0036's own lesson).
      await tx.q(`update public.sessions set capacity = 99 where id = $1`, [sessionId]);
      expect(await posterJobs(tx)).toHaveLength(1);
    });
  });

  it("a change to what the poster PRINTS enqueues; a change to what it does not, does not", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      await tx.q(`delete from graphile_worker._private_jobs`);

      // Capacity is not on the poster. Re-rendering seven variants for it is
      // waste the job key cannot absorb.
      await tx.q(`update public.sessions set capacity = 77 where id = $1`, [f.m2.a.published]);
      expect(await posterJobs(tx)).toEqual([]);

      await tx.q(`update public.sessions set title = 'عنوان جديد' where id = $1`, [f.m2.a.published]);
      expect(await posterJobs(tx)).toHaveLength(1);
    });
  });

  it("a burst of edits leaves ONE pending regeneration, not one per keystroke", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      await tx.q(`delete from graphile_worker._private_jobs`);
      // `sessions_title_check` has a minimum: a one-letter title is not a
      // title, and the constraint says so.
      for (const title of ["عنوان أول", "عنوان ثانٍ", "عنوان ثالث"]) {
        await tx.q(`update public.sessions set title = $2 where id = $1`, [f.m2.a.published, title]);
      }
      expect(await posterJobs(tx)).toHaveLength(1);
    });
  });

  it("★ the trigger fires AS A MEMBER, not only as the owner", async () => {
    // The bug this case exists for, found at promotion: both hooks were
    // invoker functions, so a PRESENTER editing their own session called
    // `enqueue_job()` as that member and got «permission denied for
    // function enqueue_job» — three wave-1 cases went red. A trigger that
    // enqueues or notifies is `security definer` (0034's `rsvps_notify()`
    // is the precedent), and a test that only ever runs as the owner cannot
    // see the difference, which is why this one changes identity first.
    await withTx(async (tx) => {
      const f = await setup(tx);
      await tx.q(`delete from graphile_worker._private_jobs`);

      // members[0] is the fixture's accepted presenter of every session.
      await tx.as(f.a.members[0].claims);
      const refused = await errorCode(() =>
        tx.q(`update public.session_presenters set accepted = false where session_id = $1 and member_id = $2`, [
          f.m2.a.published,
          f.a.members[0].memberId,
        ]),
      );
      // Whatever the row policy decides about the edit itself, the TRIGGER
      // must never be the thing that refuses it.
      expect(refused).not.toBe("42501");

      await tx.asOwner();
      // And when the edit lands, the job is enqueued all the same.
      if (refused === null) expect(await posterJobs(tx)).toHaveLength(1);
    });
  });

  it("a presenter joining or leaving changes the poster too (A5)", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      await tx.q(`delete from graphile_worker._private_jobs`);
      await tx.q(`insert into public.session_presenters (org_id, session_id, member_id, accepted) values ($1, $2, $3, true)`, [
        f.a.id,
        f.m2.a.published,
        f.a.members[1].memberId,
      ]);
      expect(await posterJobs(tx)).toHaveLength(1);
    });
  });
});

describe("POL-session_posters.detach", () => {
  async function livePoster(tx: Tx, orgId: string, sessionId: string) {
    const [d] = await tx.q<{ id: string }>(
      `insert into public.design_documents (org_id, purpose, document, bound_session_id)
       values ($1, 'poster', '{"schemaVersion":1,"purpose":"poster","master":{"width":1080,"height":1350,"unit":"px"},"direction":"rtl","layers":[]}'::jsonb, $2)
       returning id`,
      [orgId, sessionId],
    );
    await tx.q(`select public.record_session_poster($1, $2, false)`, [sessionId, d.id]);
    return d.id;
  }

  it("★ REQ-DSG-003: the flip is visible, and it is ONE WAY", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      await livePoster(tx, f.a.id, f.m2.a.published);

      await tx.as(f.a.admin.claims);
      await tx.q(`select public.detach_poster($1)`, [f.m2.a.published]);

      await tx.asOwner();
      const [row] = await tx.q<{ mode: string; binding: string; detached_at: string | null }>(
        `select mode, binding, detached_at from public.session_posters where session_id = $1`,
        [f.m2.a.published],
      );
      expect(row.binding).toBe("detached");
      expect(row.mode).toBe("customised");
      expect(row.detached_at).not.toBeNull();

      // There is no re-attach. An automatic poster that silently replaced
      // someone's edit is the failure DEC-012 exists to prevent, and a
      // re-attach button is that failure with a confirmation dialog.
      await tx.as(f.a.admin.claims);
      await tx.q(`select public.detach_poster($1)`, [f.m2.a.published]);
      await tx.asOwner();
      const [again] = await tx.q<{ binding: string }>(`select binding from public.session_posters where session_id = $1`, [f.m2.a.published]);
      expect(again.binding).toBe("detached");
    });
  });

  it("detaching is an admin's act, and is audited", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      await livePoster(tx, f.a.id, f.m2.a.published);

      for (const claims of [f.a.mod.claims, f.a.members[0].claims, f.b.admin.claims]) {
        await tx.as(claims);
        expect(await errorCode(() => tx.q(`select public.detach_poster($1)`, [f.m2.a.published]))).toBe(PERMISSION_DENIED);
      }

      await tx.as(f.a.admin.claims);
      await tx.q(`select public.detach_poster($1)`, [f.m2.a.published]);
      await tx.asOwner();
      const [audit] = await tx.q<{ actor_id: string }>(
        `select actor_id from public.audit_log where action = 'design.poster_detached' and subject_id = $1`,
        [f.m2.a.published],
      );
      expect(audit.actor_id).toBe(f.a.admin.memberId);
    });
  });

  it("★ a DETACHED poster is marked stale and its document is left alone", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      const documentId = await livePoster(tx, f.a.id, f.m2.a.published);
      await tx.as(f.a.admin.claims);
      await tx.q(`select public.detach_poster($1)`, [f.m2.a.published]);

      // What the worker does when the session's details then change.
      await tx.asOwner();
      await tx.q(`select public.record_session_poster($1, null, true)`, [f.m2.a.published]);

      const [row] = await tx.q<{ binding: string; stale_since: string | null; document_id: string }>(
        `select binding, stale_since, document_id from public.session_posters where session_id = $1`,
        [f.m2.a.published],
      );
      expect(row.binding).toBe("detached");
      expect(row.stale_since).not.toBeNull();
      // Untouched: the prompt replaces the overwrite, it does not precede it.
      expect(row.document_id).toBe(documentId);
    });
  });

  it("★ a LIVE poster is rebuilt in place and never goes stale", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      await livePoster(tx, f.a.id, f.m2.a.published);

      const [second] = await tx.q<{ id: string }>(
        `insert into public.design_documents (org_id, purpose, document)
         values ($1, 'poster', '{"schemaVersion":1,"purpose":"poster","master":{"width":1080,"height":1350,"unit":"px"},"direction":"rtl","layers":[]}'::jsonb)
         returning id`,
        [f.a.id],
      );
      await tx.q(`select public.record_session_poster($1, $2, true)`, [f.m2.a.published, second.id]);

      const [row] = await tx.q<{ binding: string; stale_since: string | null; document_id: string }>(
        `select binding, stale_since, document_id from public.session_posters where session_id = $1`,
        [f.m2.a.published],
      );
      expect(row.binding).toBe("live");
      // A live poster is regenerated rather than flagged, so there is never
      // anything to review.
      expect(row.stale_since).toBeNull();
      expect(row.document_id).toBe(second.id);
    });
  });
});

describe("POL-request_render.system", () => {
  it("the worker's render door is service_role only", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      const [d] = await tx.q<{ id: string }>(
        `insert into public.design_documents (org_id, purpose, document)
         values ($1, 'poster', '{"schemaVersion":1,"purpose":"poster","master":{"width":1080,"height":1350,"unit":"px"},"direction":"rtl","layers":[]}'::jsonb)
         returning id`,
        [f.a.id],
      );

      for (const claims of [f.a.admin.claims, f.a.members[0].claims]) {
        await tx.as(claims);
        expect(
          await errorCode(() => tx.q(`select * from public.system_request_render($1, $2, '{}'::jsonb, '[]'::jsonb)`, [d.id, "f".repeat(64)])),
        ).toBe(PERMISSION_DENIED);
      }

      await tx.asServiceRole();
      const rows = await tx.q(`select * from public.system_request_render($1, $2, '{}'::jsonb, $3::jsonb)`, [
        d.id,
        "f".repeat(64),
        JSON.stringify([{ preset: "master", format: "png" }]),
      ]);
      expect(rows).toHaveLength(1);
    });
  });

  it("poster_render_context hands the worker the session, its presenters and the template to bind", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      await tx.asServiceRole();
      const [ctx] = await tx.q<{ title: string; presenters: string[]; org_name: string; template_document: unknown; numerals: string }>(
        `select title, presenters, org_name, template_document, numerals from public.poster_render_context($1)`,
        [f.m2.a.published],
      );
      expect(ctx.title).toBeTruthy();
      // members[0] is the fixture's accepted presenter of every session (A5).
      expect(ctx.presenters.length).toBeGreaterThan(0);
      expect(ctx.org_name).toBe("كريم معرفة");
      expect(ctx.numerals).toBe("western");
      // 0061's baseline library is the platform fallback every org can bind.
      expect(ctx.template_document).toBeTruthy();
    });
  });
});

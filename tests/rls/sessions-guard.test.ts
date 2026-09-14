// Migration 0024 — the session state machine as a property of the TABLE
// (REQ-SES-003, REQ-SES-012, the REQ-PRO-007 decline edge) and the
// per-statement clock on the evidence tables (DEC-046).
//
// 03 §8.2 rows: POL-sessions.transition.legal,
//               POL-sessions.transition.rpcs_pass,
//               POL-evidence.occurred_at.ordered
import { afterAll, describe, expect, it } from "vitest";
import { errorMessage, pool, withTx } from "./db";
import { seed } from "./fixture";
import type { Tx } from "./db";

afterAll(() => pool.end());

/** One edge, written directly as the owner — past every RPC, so only the guard can refuse it. */
const move = (tx: Tx, id: string, to: string, extra = "") =>
  tx.q(`update public.sessions set state = $2::public.session_state ${extra} where id = $1`, [id, to]);

const stateOf = async (tx: Tx, id: string) => (await tx.q<{ state: string }>(`select state from public.sessions where id = $1`, [id]))[0].state;

const CANCEL = ", cancellation_reason = 'أُلغيت للاختبار'";

describe("POL-sessions.transition.legal", () => {
  it("refuses every jump 02 §6.2 does not draw, even for the migration owner", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await tx.asOwner();
      const { draft, published, completed } = f.m2.a;

      const illegal: Array<[string, string]> = [
        [draft, "published"],
        [draft, "approved"],
        [draft, "in_progress"],
        [draft, "completed"],
        [draft, "cancelled"], // no edge out of draft except submitted
        [published, "draft"],
        [published, "completed"],
        [published, "archived"],
        [completed, "draft"],
        [completed, "in_progress"],
        [completed, "published"],
      ];
      for (const [id, to] of illegal) {
        expect(await errorMessage(() => move(tx, id, to, to === "cancelled" ? CANCEL : "")), `${to}`).toMatch(/illegal_session_transition/);
      }
      expect(await stateOf(tx, draft)).toBe("draft");
      expect(await stateOf(tx, published)).toBe("published");
      expect(await stateOf(tx, completed)).toBe("completed");

      // `cancelled` has no outgoing edge at all: a cancelled session is
      // superseded by a new one, never revived.
      await move(tx, published, "cancelled", CANCEL);
      for (const to of ["draft", "approved", "published", "in_progress", "completed", "archived"]) {
        expect(await errorMessage(() => move(tx, published, to)), `cancelled -> ${to}`).toMatch(/illegal_session_transition/);
      }
      expect(await stateOf(tx, published)).toBe("cancelled");
    });
  });

  it("accepts the whole diagram, one edge at a time", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await tx.asOwner();
      const id = f.m2.a.draft; // scheduled by the fixture, so the publish constraint is satisfied
      const walk = [
        "submitted",
        "in_review",
        "changes_requested",
        "submitted",
        "in_review",
        "approved",
        "published",
        "in_progress",
        "completed",
        "archived",
        "completed",
      ];
      for (const to of walk) {
        await move(tx, id, to);
        expect(await stateOf(tx, id)).toBe(to);
      }
      await move(tx, id, "cancelled", CANCEL);
      expect(await stateOf(tx, id)).toBe("cancelled");

      // An update that names the column without changing it is not a transition.
      await tx.q(`update public.sessions set state = state, title = 'عنوان جديد' where id = $1`, [id]);
      expect(await stateOf(tx, id)).toBe("cancelled");
    });
  });

  it("the decline edge (REQ-PRO-007): an unpublished session returns to draft; a published one cannot", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await tx.asOwner();
      const id = f.m2.a.draft;
      for (const from of ["submitted", "in_review", "changes_requested"]) {
        // Walk there legally, then back to draft.
        if (from === "in_review") await move(tx, id, "submitted");
        if (from === "changes_requested") {
          await move(tx, id, "submitted");
          await move(tx, id, "in_review");
        }
        await move(tx, id, from);
        await move(tx, id, "draft");
        expect(await stateOf(tx, id)).toBe("draft");
      }
      await move(tx, id, "submitted");
      await move(tx, id, "in_review");
      await move(tx, id, "approved");
      await move(tx, id, "draft");
      expect(await stateOf(tx, id)).toBe("draft");

      expect(await errorMessage(() => move(tx, f.m2.a.published, "draft"))).toMatch(/illegal_session_transition/);
    });
  });
});

describe("POL-sessions.transition.rpcs_pass", () => {
  it("publish_session() walks the chain, the clock moves it on, transition_session() finishes it", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      const id = f.m2.a.draft;

      await tx.as(f.a.admin.claims);
      expect((await tx.q<{ state: string }>(`select state from public.publish_session($1)`, [id]))[0].state).toBe("published");

      // Bring its clock into the past; the deadlines move with starts_at (0010's constraints).
      await tx.asOwner();
      await tx.q(
        `update public.sessions
            set starts_at = now() - interval '5 minutes', ends_at = now() - interval '1 minute',
                rsvp_deadline_at = now() - interval '5 minutes', cancellation_cutoff_at = now() - interval '5 minutes'
          where id = $1`,
        [id],
      );
      await tx.asServiceRole();
      expect((await tx.q<{ id: string }>(`select public.clock_start_sessions() as id`)).map((r) => r.id)).toContain(id);
      expect((await tx.q<{ id: string }>(`select public.clock_complete_sessions() as id`)).map((r) => r.id)).toContain(id);

      await tx.as(f.a.admin.claims);
      const act = (action: string, reason: string | null = null) =>
        tx.q<{ state: string }>(`select state from public.transition_session($1, $2, $3)`, [id, action, reason]);
      expect((await act("archive"))[0].state).toBe("archived");
      expect((await act("reopen"))[0].state).toBe("completed");
      expect((await act("cancel", "أُلغيت بأثر رجعي"))[0].state).toBe("cancelled");
    });
  });
});

describe("POL-evidence.occurred_at.ordered", () => {
  it("the publish chain's transition rows order by time alone", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      const id = f.m2.a.draft;
      await tx.as(f.a.admin.claims);
      await tx.q(`select public.publish_session($1)`, [id]);

      await tx.asOwner();
      const [row] = await tx.q<{ chain: string[]; total: string; distinct_instants: string }>(
        `select array_agg(to_state::text order by occurred_at) as chain,
                count(*)::text as total,
                count(distinct occurred_at)::text as distinct_instants
           from public.session_state_transitions where session_id = $1`,
        [id],
      );
      // The fixture's birth row, then the four edges of the walk — in one transaction.
      expect(row.chain).toEqual(["draft", "submitted", "in_review", "approved", "published"]);
      expect(row.distinct_instants).toBe(row.total);
    });
  });

  it("two audit rows from one transaction carry distinct, increasing instants", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await tx.as(f.a.admin.claims);
      const [{ id }] = await tx.q<{ id: string }>(
        `select public.create_session('جلسة للتدقيق', 'ملخص', $1, 'introductory', 'ar', '{}', null) as id`,
        [f.a.categoryId],
      );
      await tx.q(`select public.schedule_session($1, now() + interval '2 days', 60, null, $2, null, null, null, 20, null, null, 'off', 'ar')`, [id, f.a.venueId]);

      await tx.asOwner();
      const [row] = await tx.q<{ actions: string[]; distinct_instants: string }>(
        `select array_agg(action order by occurred_at) as actions, count(distinct occurred_at)::text as distinct_instants
           from public.audit_log where subject_type = 'session' and subject_id = $1`,
        [id],
      );
      expect(row.actions).toEqual(["session.created_direct", "session.scheduled"]);
      expect(row.distinct_instants).toBe("2");
    });
  });
});

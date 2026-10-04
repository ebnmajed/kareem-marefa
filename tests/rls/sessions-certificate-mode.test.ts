// REQ-SES-020 — the certificate mode has one writer (DEC-176 contract 2, sync
// 1's rulings DEC-178). Applied with applyProposed() inside each rolled-back
// transaction (DEC-040); a promoted file is a no-op there.
//
// 03 §8.2 rows: RPC-schedule_session.certificate_mode_unchanged,
//               RPC-schedule_session.certificate_mode_named,
//               RPC-set_session_certificate_mode.admin_only,
//               RPC-set_session_certificate_mode.audited,
//               RPC-set_session_certificate_mode.refusals,
//               RPC-set_session_certificate_mode.no_side_effects,
//               RPC-set_session_certificate_mode.after_completion,
//               RPC-set_session_certificate_mode.after_completion_off,
//               RPC-set_session_certificate_mode.late_switch_is_idempotent
//
// ★ DEC-250 (REQ-CRT-017, `0194`): a COMPLETED or ARCHIVED session is no longer
// refused — it is accepted and FANS OUT in the same transaction. Three
// assertions below changed with it, each an expectation and not a selector,
// each a ledger line in STATUS.md. `cancelled` is still refused.
//
// Fixture (fixture-m2): per org, a draft, a published and a completed session.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { applyProposed, errorCode, errorMessage, PERMISSION_DENIED, pool, withTx } from "./db";
import { seed } from "./fixture";
import type { Tx } from "./db";

afterAll(() => pool.end());

const PROPOSED = "sessions/0001_certificate_mode_one_writer.sql";
const CHECK_VIOLATION = "23514";

// ★ DEC-250: `0194` is applied INSIDE the rolled-back transaction, like a
// proposed file, so the suite is green on a database that has not been reset
// since the migration landed. It is safe to apply twice: every statement in it
// is `create or replace`, `revoke`, `grant` or `comment` — there is no
// `create function` to collide, which is the one thing `applyProposed()`'s
// no-op path exists to avoid.
const MIGRATION = "0194_certificate_mode_after_completion.sql";

async function setup(tx: Tx) {
  const f = await seed(tx);
  await applyProposed(tx, PROPOSED);
  await tx.asOwner();
  await tx.q(readFileSync(join(process.cwd(), "supabase", "migrations", MIGRATION), "utf8"));
  return f;
}

/** Pending `issue_certificates` jobs for one session. `task_identifier` is not a column on the job
 *  row — it is `_private_tasks.identifier`, joined (the pattern at
 *  `tests/rls/award-hooks-ratings-comments.test.ts:40`). */
async function certificateJobs(tx: Tx, session: string): Promise<number> {
  await tx.asOwner();
  const [row] = await tx.q<{ n: number }>(
    `select count(*)::int as n
       from graphile_worker._private_jobs j
       join graphile_worker._private_tasks t on t.id = j.task_id
      where t.identifier = 'issue_certificates' and j.payload->>'session_id' = $1`,
    [session],
  );
  return row.n;
}

const setMode = (tx: Tx, session: string, mode: string) =>
  tx.q<{ status: string }>(`select public.set_session_certificate_mode($1, $2::public.certificate_mode) as status`, [session, mode]);

async function modeOf(tx: Tx, session: string): Promise<string> {
  await tx.asOwner();
  const [row] = await tx.q<{ certificate_mode: string }>(`select certificate_mode from public.sessions where id = $1`, [session]);
  return row.certificate_mode;
}

async function modeAudit(tx: Tx, session: string) {
  await tx.asOwner();
  return tx.q<{ action: string; before: Record<string, unknown> | null; after: Record<string, unknown> | null }>(
    `select action, before, after from public.audit_log
      where subject_id = $1 and action = 'session.certificate_mode_changed' order by occurred_at, ctid`,
    [session],
  );
}

async function forceMode(tx: Tx, session: string, mode: string) {
  await tx.asOwner();
  await tx.q(`update public.sessions set certificate_mode = $2::public.certificate_mode where id = $1`, [session, mode]);
}

async function forceState(tx: Tx, session: string, state: "archived" | "cancelled") {
  await tx.asOwner();
  await tx.q(
    state === "cancelled"
      ? `update public.sessions set state = 'cancelled', cancelled_at = now(), cancellation_reason = 'اختبار' where id = $1`
      : `update public.sessions set state = 'archived' where id = $1`,
    [session],
  );
}

/** `schedule_session()` for the fixture's draft, positionally, with or without the mode. */
function schedule(tx: Tx, session: string, venue: string, mode?: string) {
  return mode === undefined
    ? tx.q(`select id from public.schedule_session(p_session => $1, p_starts_at => now() + interval '3 days', p_duration_minutes => 60, p_venue => $2)`, [session, venue])
    : tx.q(`select id from public.schedule_session($1, now() + interval '3 days', 60, null, $2, null, null, null, null, null, null, $3::public.certificate_mode, 'ar')`, [
        session,
        venue,
        mode,
      ]);
}

describe("RPC-schedule_session.certificate_mode_unchanged", () => {
  it("a save that does not name the mode leaves the stored mode standing", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      await forceMode(tx, f.m2.a.draft, "automatic");
      await tx.as(f.a.admin.claims);
      await schedule(tx, f.m2.a.draft, f.a.venueId);
      expect(await modeOf(tx, f.m2.a.draft)).toBe("automatic");
    });
  });

  it("the default is null now, and nothing else about the signature moved", async () => {
    await withTx(async (tx) => {
      await setup(tx);
      const rows = await tx.q<{ args: string }>(
        `select pg_get_function_arguments(p.oid) as args from pg_proc p
          join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'public' and p.proname = 'schedule_session'`,
      );
      // One overload, as 0112 left it (0085's lesson).
      expect(rows).toHaveLength(1);
      expect(rows[0].args).toMatch(/p_certificate_mode certificate_mode DEFAULT NULL::certificate_mode/);
      expect(rows[0].args).toMatch(/p_require_all_days boolean DEFAULT NULL::boolean$/);
    });
  });
});

describe("RPC-schedule_session.certificate_mode_named", () => {
  it("a save that names the mode still writes it — main's call, byte for byte", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      await tx.as(f.a.admin.claims);
      await schedule(tx, f.m2.a.draft, f.a.venueId, "review");
      expect(await modeOf(tx, f.m2.a.draft)).toBe("review");
      await tx.as(f.a.admin.claims);
      await schedule(tx, f.m2.a.draft, f.a.venueId, "off");
      expect(await modeOf(tx, f.m2.a.draft)).toBe("off");
    });
  });
});

describe("RPC-set_session_certificate_mode.admin_only", () => {
  it("refuses a member, a moderator, the session's own presenter and a stale admin", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      for (const who of [f.a.members[0].claims, f.a.members[1].claims, f.a.mod.claims]) {
        await tx.as(who);
        expect(await errorMessage(() => setMode(tx, f.m2.a.published, "automatic"))).toMatch(/not_an_admin/);
      }
      await tx.as({ ...f.a.admin.claims, claims_version: (f.a.admin.claims.claims_version ?? 0) + 3 });
      expect(await errorCode(() => setMode(tx, f.m2.a.published, "automatic"))).toBe(PERMISSION_DENIED);
      expect(await modeOf(tx, f.m2.a.published)).toBe("off");
    });
  });

  it("an admin of another org cannot reach the session", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      await tx.as(f.b.admin.claims);
      expect(await errorMessage(() => setMode(tx, f.m2.a.published, "automatic"))).toMatch(/session_not_found/);
      expect(await errorCode(() => setMode(tx, f.m2.a.published, "automatic"))).toBe(PERMISSION_DENIED);
      expect(await modeOf(tx, f.m2.a.published)).toBe("off");
    });
  });

  it("is granted to authenticated and to no anonymous caller", async () => {
    await withTx(async (tx) => {
      await setup(tx);
      const [row] = await tx.q<{ authed: boolean; anon: boolean }>(
        `select has_function_privilege('authenticated', 'public.set_session_certificate_mode(uuid, public.certificate_mode)', 'execute') as authed,
                has_function_privilege('anon', 'public.set_session_certificate_mode(uuid, public.certificate_mode)', 'execute') as anon`,
      );
      expect(row).toEqual({ authed: true, anon: false });
    });
  });
});

describe("RPC-set_session_certificate_mode.audited", () => {
  it("a change writes the mode and one audit row with the old and the new", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      await tx.as(f.a.admin.claims);
      expect(await setMode(tx, f.m2.a.published, "review")).toEqual([{ status: "ok" }]);
      expect(await modeOf(tx, f.m2.a.published)).toBe("review");
      expect(await modeAudit(tx, f.m2.a.published)).toEqual([
        { action: "session.certificate_mode_changed", before: { certificate_mode: "off" }, after: { certificate_mode: "review" } },
      ]);
    });
  });

  it("the same mode writes nothing and says so", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      await tx.as(f.a.admin.claims);
      expect(await setMode(tx, f.m2.a.draft, "off")).toEqual([{ status: "unchanged" }]);
      expect(await modeAudit(tx, f.m2.a.draft)).toEqual([]);
    });
  });
});

describe("RPC-set_session_certificate_mode.refusals", () => {
  // ★ DEC-250: ONLY a cancelled session is refused now. It has no attendance to
  // attest and no fan-out will ever run for it, so a mode on it would be a
  // setting that cannot become a certificate.
  it("a cancelled session is refused, with no write and no audit", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      await forceState(tx, f.m2.a.published, "cancelled");
      await tx.as(f.a.admin.claims);
      expect(await errorMessage(() => setMode(tx, f.m2.a.published, "review"))).toMatch(/session_cancelled/);
      expect(await errorCode(() => setMode(tx, f.m2.a.published, "review"))).toBe(CHECK_VIOLATION);
      expect(await modeOf(tx, f.m2.a.published)).toBe("off");
      expect(await modeAudit(tx, f.m2.a.published)).toEqual([]);
    });
  });
});

describe("RPC-set_session_certificate_mode.after_completion", () => {
  // ★ The defect DEC-250 closes, asserted from the admin's side: a session that
  // completed at the DEFAULT `off` had no way back. Now it has one, and the mode
  // is written and audited like any other.
  it("a completed session accepts the mode, writes it, audits it and fans out", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      await tx.as(f.a.admin.claims);
      const [row] = await setMode(tx, f.m2.a.completed, "review");
      expect(row.status).toBe("fanned_out");
      expect(await modeOf(tx, f.m2.a.completed)).toBe("review");
      expect(await modeAudit(tx, f.m2.a.completed)).toEqual([
        { action: "session.certificate_mode_changed", before: { certificate_mode: "off" }, after: { certificate_mode: "review" } },
      ]);
    });
  });

  it("an archived session is accepted too", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      await forceState(tx, f.m2.a.completed, "archived");
      await tx.as(f.a.admin.claims);
      const [row] = await setMode(tx, f.m2.a.completed, "automatic");
      expect(row.status).toBe("fanned_out");
      expect(await modeOf(tx, f.m2.a.completed)).toBe("automatic");
    });
  });

  // ★ One job per eligible recipient per kind, under 11 §2.5's key — and the key
  // is why a re-run is safe. The fixture's completed session has an accepted
  // presenter, so the fan-out has at least that recipient to find.
  it("enqueues one issue_certificates job per recipient per kind, and a re-run adds none", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      const jobs = () => certificateJobs(tx, f.m2.a.completed);
      await tx.as(f.a.admin.claims);
      await setMode(tx, f.m2.a.completed, "review");
      const after = await jobs();
      expect(after).toBeGreaterThan(0);

      // The same mode again is `unchanged` and enqueues nothing new; a different
      // non-off mode fans out again and MOVES each job rather than duplicating it.
      await tx.as(f.a.admin.claims);
      const [same] = await setMode(tx, f.m2.a.completed, "review");
      expect(same.status).toBe("unchanged");
      expect(await jobs()).toBe(after);

      await tx.as(f.a.admin.claims);
      const [again] = await setMode(tx, f.m2.a.completed, "automatic");
      expect(again.status).toBe("fanned_out");
      expect(await jobs()).toBe(after);
    });
  });
});

describe("RPC-set_session_certificate_mode.after_completion_off", () => {
  // ★ Switching a completed session back to `off` is accepted and enqueues
  // NOTHING. It deletes nothing either: what has reached a member is governed by
  // release/revoke, never by the mode (DEC-250 §4).
  it("switching a completed session to off is accepted, audited and enqueues nothing", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      await tx.as(f.a.admin.claims);
      await setMode(tx, f.m2.a.completed, "review");
      const before = await certificateJobs(tx, f.m2.a.completed);

      await tx.as(f.a.admin.claims);
      const [row] = await setMode(tx, f.m2.a.completed, "off");
      expect(row.status).toBe("ok");
      expect(await modeOf(tx, f.m2.a.completed)).toBe("off");
      expect(await certificateJobs(tx, f.m2.a.completed)).toBe(before);
    });
  });
});

describe("RPC-set_session_certificate_mode.no_side_effects", () => {
  // ★ DEC-250 narrows this to what it always meant: the mode itself has no side
  // effects. BEFORE completion it still enqueues nothing — the trigger will fan
  // out on the edge into `completed`, and doing it early would issue against an
  // attendance list still being written. The late switch's own jobs are asserted
  // in `after_completion` above; neither path writes a notification or a
  // transition, which is the part that never changed.
  it("enqueues no job and writes no notification and no transition before completion", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      const count = async () => {
        await tx.asOwner();
        const [row] = await tx.q<{ jobs: number; notices: number; transitions: number }>(
          `select (select count(*)::int from graphile_worker._private_jobs) as jobs,
                  (select count(*)::int from public.notifications) as notices,
                  (select count(*)::int from public.session_state_transitions where session_id = $1) as transitions`,
          [f.m2.a.published],
        );
        return row;
      };
      const before = await count();
      await tx.as(f.a.admin.claims);
      await setMode(tx, f.m2.a.published, "automatic");
      expect(await count()).toEqual(before);
    });
  });
});

// Contract 5 — supabase/proposed/checkin/03_contract_5.sql (DEC-150, DEC-151).
// The three check-in RPCs stop deciding what a check-in earns and call
// `attendance_recorded()` / `attendance_removed()` (0102).
//
// ★ The point of these cases is that NOTHING OBSERVABLE MOVES. `0102` lifted
// the blocks out of these bodies verbatim, so every assertion below is one the
// pre-switch suite already makes — `checkin-manual-mark.test.ts`'s own
// `award_points` case reads the same job row by the same key, and
// `checkin-removal.test.ts` reads the same reversal. They are repeated here
// against the switched bodies because «the hook is called» is not the property
// worth guarding; «the member's points did not change» is.
//
// `03` §8.2 rows: RPC-check_in.calls_attendance_recorded,
// RPC-mark_checked_in_manually.calls_attendance_recorded,
// RPC-remove_check_in.calls_attendance_removed,
// RPC-remove_check_in.certificate_revoked_through_the_hook,
// RPC-check_in.certificate_synced, RPC-checkin_functions.decide_nothing.
import { afterAll, describe, expect, it } from "vitest";
import { applyProposed, errorMessage, pool, withTx, type Tx } from "./db";
import { seed, type Org } from "./fixture";

afterAll(() => pool.end());

const apply = (tx: Tx) => applyProposed(tx, "checkin/03_contract_5.sql");

async function liveSession(tx: Tx, org: Org): Promise<string> {
  const [row] = await tx.q<{ id: string }>(
    `insert into public.sessions (org_id, title, abstract, category_id, level, starts_at, duration_minutes, ends_at,
                                   venue_id, capacity, state, published_at, allow_walk_ins)
     values ($1, 'جلسة العقد الخامس', 'ملخص', $2, 'introductory',
             now() - interval '30 minutes', 60, now() + interval '30 minutes',
             $3, 40, 'in_progress', now() - interval '1 day', true)
     returning id`,
    [org.id, org.categoryId, org.venueId],
  );
  return row.id;
}

const jobsFor = (tx: Tx, key: string) =>
  tx.q<{ task_identifier: string; payload: { rule: string; source: string; source_id: string; session_id: string } }>(
    `select t.identifier as task_identifier, j.payload
       from graphile_worker._private_jobs j
       join graphile_worker._private_tasks t on t.id = j.task_id
      where j.key = $1`,
    [key],
  );

describe("the award is the hook's, and it is byte for byte the one main enqueues", () => {
  it("a code check-in enqueues exactly one award_points job under pts:check_in:<id>", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await apply(tx);
      await tx.asOwner();
      const s = await liveSession(tx, f.a);
      const [code] = await tx.q<{ code: string }>(`select * from public.rotate_check_in_code($1)`, [s]);

      await tx.as(f.a.members[0].claims);
      const [row] = await tx.q<{ r: { status: string; check_in: { id: string } } }>(`select public.check_in($1, $2) as r`, [s, code.code]);
      expect(row.r.status).toBe("ok");

      await tx.asOwner();
      const jobs = await jobsFor(tx, `pts:check_in:${row.r.check_in.id}`);
      expect(jobs).toHaveLength(1);
      expect(jobs[0].task_identifier).toBe("award_points");
      expect(jobs[0].payload).toMatchObject({ rule: "check_in", source: "check_in", source_id: row.r.check_in.id, session_id: s });
    });
  });

  it("a manual mark enqueues the same one job under the same key — REQ-CHK-008's «same rights», as one call site each", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await apply(tx);
      await tx.asOwner();
      const s = await liveSession(tx, f.a);

      await tx.as(f.a.mod.claims);
      const [ci] = await tx.q<{ id: string }>(`select * from public.mark_checked_in_manually($1, $2, $3)`, [s, f.a.members[0].memberId, "نسي هاتفه"]);

      await tx.asOwner();
      const jobs = await jobsFor(tx, `pts:check_in:${ci.id}`);
      expect(jobs).toHaveLength(1);
      expect(jobs[0].task_identifier).toBe("award_points");
      expect(jobs[0].payload).toMatchObject({ rule: "check_in", source: "check_in", source_id: ci.id });
    });
  });
});

describe("a removal still reverses exactly what it reversed", () => {
  it("writes one compensating row per unreversed award, with the same key and reason, and awards the no-show", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await apply(tx);
      await tx.asOwner();
      const s = await liveSession(tx, f.a);
      const member = f.a.members[0];
      await tx.q(`insert into public.rsvps (org_id, session_id, member_id, status) values ($1, $2, $3, 'confirmed')`, [f.a.id, s, member.memberId]);

      await tx.as(f.a.admin.claims);
      const [ci] = await tx.q<{ id: string }>(`select * from public.mark_checked_in_manually($1, $2, $3)`, [s, member.memberId, "حضر"]);

      // The award the worker would have written, so there is something to reverse.
      await tx.asOwner();
      await tx.q(`select public.award_points('check_in', $1, 'check_in', $2, $3)`, [member.memberId, ci.id, s]);
      const [awarded] = await tx.q<{ id: string; amount: number }>(
        `select id, amount from public.points_ledger where source = 'check_in' and source_id = $1`,
        [ci.id],
      );
      expect(awarded.amount).toBeGreaterThan(0);

      await tx.as(f.a.admin.claims);
      await tx.q(`select * from public.remove_check_in($1, $2, $3)`, [s, member.memberId, "سُجّل خطأً"]);

      await tx.asOwner();
      const [reversal] = await tx.q<{ amount: number; reason: string; idempotency_key: string }>(
        `select amount, reason, idempotency_key from public.points_ledger where source = 'reversal' and source_id = $1`,
        [awarded.id],
      );
      expect(reversal.amount).toBe(-awarded.amount);
      expect(reversal.reason).toBe("أُلغي تسجيل الحضور");
      expect(reversal.idempotency_key).toBe(`reversal:${awarded.id}:v1`);

      const noShow = await tx.q<{ n: string }>(`select count(*) as n from public.points_ledger where source = 'no_show' and member_id = $1`, [member.memberId]);
      expect(noShow[0].n).toBe("1");

      // Idempotent: a second removal is refused and writes no second reversal.
      await tx.as(f.a.admin.claims);
      expect(await errorMessage(() => tx.q(`select * from public.remove_check_in($1, $2, $3)`, [s, member.memberId, "مرة أخرى"]))).toMatch(/not_found/);
      await tx.asOwner();
      const all = await tx.q<{ n: string }>(`select count(*) as n from public.points_ledger where source = 'reversal' and source_id = $1`, [awarded.id]);
      expect(all[0].n).toBe("1");
    });
  });

  it("still revokes an issued attendance certificate — now through the hook, and by session and member rather than by check_in_id", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await apply(tx);
      await tx.asOwner();
      const s = await liveSession(tx, f.a);
      const member = f.a.members[0];
      await tx.q(`update public.sessions set certificate_mode = 'automatic' where id = $1`, [s]);

      await tx.as(f.a.admin.claims);
      await tx.q(`select * from public.mark_checked_in_manually($1, $2, $3)`, [s, member.memberId, "حضر"]);

      await tx.asServiceRole();
      const [cert] = await tx.q<{ id: string; state: string }>(`select * from public.issue_certificate($1, $2, 'attendance')`, [s, member.memberId]);
      expect(cert.state).toBe("issued");

      await tx.as(f.a.admin.claims);
      await tx.q(`select * from public.remove_check_in($1, $2, $3)`, [s, member.memberId, "لم يكن حاضرًا — خطأ إداري"]);

      await tx.asOwner();
      const [after] = await tx.q<{ state: string; revocation_reason: string }>(
        `select state, revocation_reason from public.certificates where id = $1`,
        [cert.id],
      );
      expect(after.state).toBe("revoked");
      // Only the FIXED phrase reaches it — never the admin's own words.
      expect(after.revocation_reason).toBe("أُلغي تسجيل الحضور");
    });
  });
});

describe("a check-in after the fact reaches the certificate hook too", () => {
  it("★ named difference 3 — a member marked present on a COMPLETED session becomes eligible, instead of being silently skipped", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await apply(tx);
      await tx.asOwner();
      const s = await liveSession(tx, f.a);
      const member = f.a.members[0];
      await tx.q(`update public.sessions set certificate_mode = 'automatic', state = 'completed', completed_at = now() where id = $1`, [s]);

      await tx.as(f.a.admin.claims);
      await tx.q(`select * from public.mark_checked_in_manually($1, $2, 'حضر ولم يُسجَّل', null)`, [s, member.memberId]);

      await tx.asOwner();
      const jobs = await tx.q<{ task_identifier: string }>(
        `select t.identifier as task_identifier
           from graphile_worker._private_jobs j
           join graphile_worker._private_tasks t on t.id = j.task_id
          where j.key = $1`,
        [`cert:${s}:${member.memberId}:attendance`],
      );
      expect(jobs).toHaveLength(1);
      expect(jobs[0].task_identifier).toBe("issue_certificates");
    });
  });
});

describe("★ the three functions decide nothing about points or certificates", () => {
  it("their source, comments stripped, names neither the ledger nor the award nor the queue nor a certificate", async () => {
    await withTx(async (tx) => {
      await seed(tx);
      await apply(tx);
      await tx.asOwner();
      const defs = await tx.q<{ proname: string; def: string }>(
        `select p.proname, pg_get_functiondef(p.oid) as def
           from pg_proc p join pg_namespace n on n.oid = p.pronamespace
          where n.nspname = 'public'
            and p.proname in ('check_in', 'mark_checked_in_manually', 'remove_check_in')`,
      );
      expect(defs).toHaveLength(3);
      for (const { proname, def } of defs) {
        // A comment may name what the code no longer does; the CODE may not.
        const code = def
          .split("\n")
          .map((line) => line.replace(/--.*$/, ""))
          .join("\n");
        // ★ The whole list now, not just the points half: the certificate
        // left too, with the `check_in_id` lookup that could not see day 3.
        for (const primitive of ["points_ledger", "award_points", "enqueue_job", "certificates", "revoke_certificate"]) {
          expect(`${proname}: ${code}`).not.toContain(primitive);
        }
      }
      // And each names the hook it now defers to.
      const byName = Object.fromEntries(defs.map((d) => [d.proname, d.def]));
      expect(byName.check_in).toContain("attendance_recorded");
      expect(byName.mark_checked_in_manually).toContain("attendance_recorded");
      expect(byName.remove_check_in).toContain("attendance_removed");
      // And all three defer the certificate to the one function that can read
      // contract 6's predicate.
      for (const name of ["check_in", "mark_checked_in_manually", "remove_check_in"]) {
        expect(`${name}: ${byName[name]}`).toContain("attendance_certificate_sync");
      }
      // REQ-TSK-002: nothing on this path reads a task, before or after.
      for (const { def } of defs) {
        for (const task of ["session_tasks", "task_completions", "task_form_responses"]) {
          expect(def).not.toContain(task);
        }
      }
    });
  });
});

// Issuance, release and revocation — 02 §4.12, 03 §5.8/§5.8a, REQ-CRT-001 …
// REQ-CRT-006, REQ-CRT-008, REQ-CRT-011, DEC-010, 11 §2.5.
//
// The four properties this file exists for:
//
//   · the fan-out keys off the CHECK-IN EVENT and nothing else, and `off`
//     generates nothing at all rather than generating and hiding;
//   · an attendance certificate RE-DERIVES its check-in, so REQ-CHK-009 has
//     two independent guards and the job's payload is trusted for neither;
//   · the serial is gapless and per-org, allocated inside the issuing
//     transaction so a rollback returns the number (DEC-010);
//   · `review` HOLDS — invisible to the recipient and unemailed — and a
//     release is an admin's audited act that notifies once.
import { existsSync } from "node:fs";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { applyProposed, errorCode, PERMISSION_DENIED, pool, withTx, type Tx } from "./db";
import { seed } from "./fixture";

afterAll(() => pool.end());

const PROPOSED = ["designer/0007_certificates.sql"];
const CHECK_VIOLATION = "23514";

async function setup(tx: Tx) {
  const f = await seed(tx);
  for (const file of PROPOSED) {
    if (existsSync(join(process.cwd(), "supabase", "proposed", file))) await applyProposed(tx, file);
  }
  await tx.asOwner();
  // fixture-m6 seeds certificates on both orgs (DEC-049); these cases count
  // rows and allocate serials, so they start from an empty world.
  for (const t of ["certificates", "certificate_serial_counters", "export_artifacts", "design_documents"]) {
    await tx.q(`delete from public.${t}`);
  }
  await tx.q(`delete from graphile_worker._private_jobs`);
  await tx.q(`delete from public.notifications`);
  // `certificate_mode` defaults to `off` (0010), which is the right default
  // for the product and the wrong one for a file about issuance — so the
  // fixture's sessions are switched on here and each case that cares about
  // a mode sets its own.
  await tx.q(`update public.sessions set certificate_mode = 'automatic' where org_id = any($1::uuid[])`, [[f.a.id, f.b.id]]);
  return f;
}

/** REQ-CHK-013 is structural: `exclude using gist (member_id with =,
 *  session_window with &&)` makes attendance at two overlapping sessions
 *  impossible (DEC-015). An EMPTY range overlaps nothing, which is why the
 *  M2 fixture can check one member into two sessions — so a fixture row
 *  that is arranging history rather than exercising the window uses the
 *  same empty range it does. */
const checkIn = (tx: Tx, orgId: string, sessionId: string, memberId: string, markedBy: string) =>
  tx.q(
    `insert into public.check_ins (org_id, session_id, member_id, method, manual_reason, marked_by, session_window)
     values ($1, $2, $3, 'manual', 'حضر', $4, 'empty'::tstzrange)`,
    [orgId, sessionId, memberId, markedBy],
  );

const certJobs = (tx: Tx) => tx.q<{ key: string }>(`select key from graphile_worker.jobs where task_identifier = 'issue_certificates' order by key`);

/** The fixture's completed session, walked back into a state the completion
 *  edge can be crossed from. 0024's guard is forward-only, so a fresh row is
 *  the honest way — copied from the fixture's own so every constraint holds.
 *
 *  ★ THE CLONE IS SHIFTED IN TIME, and that is not cosmetic. `check_ins` has
 *  a BEFORE INSERT trigger (`check_ins_window`, 0010) that OVERWRITES
 *  whatever `session_window` the caller supplies with the session's own
 *  `tstzrange(starts_at, ends_at)`. A clone at the source's hours therefore
 *  produces the source's exact window, and `check_ins_member_id_session_
 *  window_excl` refuses a second check-in for a member the fixture already
 *  checked into the original (DEC-015, REQ-CHK-013). Each clone takes a
 *  week of its own, so the windows are disjoint by construction. */
let cloneWeek = 0;
async function completableSession(tx: Tx, from: string, title: string): Promise<string> {
  const weeks = String(++cloneWeek) + ' weeks';
  const [row] = await tx.q<{ id: string }>(
    `insert into public.sessions (org_id, title, abstract, category_id, level, language, starts_at, duration_minutes,
                                  ends_at, time_zone, venue_id, capacity, state, certificate_mode, published_at)
     select org_id, $2, abstract, category_id, level, language, starts_at - $3::interval, duration_minutes,
            ends_at - $3::interval, time_zone, venue_id, capacity, 'in_progress', 'automatic', now()
       from public.sessions where id = $1
     returning id`,
    [from, title, weeks],
  );
  return row.id;
}

describe("POL-certificates.fanout", () => {
  it("★ REQ-CRT-001: one job per checked-in attendee and per accepted presenter, with 11 §2.5's key", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      const sessionId = await completableSession(tx, f.m2.a.completed, "جلسة تكتمل الآن");
      // members[1] checked in; members[0] is the accepted presenter.
      await checkIn(tx, f.a.id, sessionId, f.a.members[1].memberId, f.a.admin.memberId);
      await tx.q(`insert into public.session_presenters (org_id, session_id, member_id, accepted) values ($1, $2, $3, true)`, [
        f.a.id,
        sessionId,
        f.a.members[0].memberId,
      ]);
      await tx.q(`delete from graphile_worker._private_jobs`);

      await tx.q(`update public.sessions set state = 'completed', completed_at = now() where id = $1`, [sessionId]);

      const jobs = await certJobs(tx);
      expect(jobs).toHaveLength(2);
      expect(jobs.map((j) => j.key).sort()).toEqual(
        [`cert:${sessionId}:${f.a.members[1].memberId}:attendance`, `cert:${sessionId}:${f.a.members[0].memberId}:presenter`].sort(),
      );
    });
  });

  it("★ `off` generates NOTHING — not generated and hidden (D50)", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      const sessionId = await completableSession(tx, f.m2.a.completed, "جلسة بلا شهادات");
      await tx.q(`update public.sessions set certificate_mode = 'off' where id = $1`, [sessionId]);
      await checkIn(tx, f.a.id, sessionId, f.a.members[1].memberId, f.a.admin.memberId);
      await tx.q(`delete from graphile_worker._private_jobs`);

      await tx.q(`update public.sessions set state = 'completed', completed_at = now() where id = $1`, [sessionId]);
      expect(await certJobs(tx)).toEqual([]);
    });
  });

  it("★ the completion trigger is `security definer` — it fires for a member too", async () => {
    // 0063's lesson, applied before the fact this time: an invoker trigger
    // that enqueues is refused by `enqueue_job`'s own grant the moment
    // something other than the owner fires it.
    //
    // The member-reachable path is `transition_session(…, 'complete')`
    // (0023, granted to `authenticated`) — REQ-SES-005's manual complete.
    // There is no admin UPDATE policy on `public.sessions` at all, so a
    // direct update refuses at the ROW and would prove nothing about the
    // trigger either way.
    await withTx(async (tx) => {
      const f = await setup(tx);
      const sessionId = await completableSession(tx, f.m2.a.completed, "جلسة يكملها غير المالك");
      await checkIn(tx, f.a.id, sessionId, f.a.members[1].memberId, f.a.admin.memberId);
      await tx.q(`delete from graphile_worker._private_jobs`);

      await tx.as(f.a.admin.claims);
      await tx.q(`select public.transition_session($1, 'complete', null)`, [sessionId]);

      // Positive, not «did not raise 42501»: an invoker trigger here fails
      // loudly, but a fan-out that silently enqueued nothing would pass a
      // negative assertion while shipping no certificates at all.
      await tx.asOwner();
      expect((await certJobs(tx)).map((j) => j.key)).toEqual([`cert:${sessionId}:${f.a.members[1].memberId}:attendance`]);
    });
  });
});

describe("POL-issue_certificate", () => {
  async function issue(tx: Tx, sessionId: string, memberId: string, kind = "attendance") {
    return tx.q<{ id: string; serial: string; state: string; check_in_id: string | null }>(
      `select id, serial, state, check_in_id from public.issue_certificate($1, $2, $3::public.certificate_kind)`,
      [sessionId, memberId, kind],
    );
  }

  it("★ REQ-CHK-009: an attendance certificate re-derives its check-in, and is refused without one", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      await tx.asServiceRole();
      // members[1] is the fixture's checked-in attendee of the completed session.
      const [ok] = await issue(tx, f.m2.a.completed, f.a.members[1].memberId);
      expect(ok.check_in_id).not.toBeNull();

      // members[0] presented but never checked in as an attendee.
      expect(await errorCode(() => issue(tx, f.m2.a.completed, f.a.members[0].memberId))).toBe(PERMISSION_DENIED);
      // …and gets a PRESENTER certificate with no check-in at all (A5).
      const [presenter] = await issue(tx, f.m2.a.completed, f.a.members[0].memberId, "presenter");
      expect(presenter.check_in_id).toBeNull();
    });
  });

  it("★ REQ-CRT-003: running it twice produces ONE certificate and consumes ONE serial", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      await tx.asServiceRole();
      const [first] = await issue(tx, f.m2.a.completed, f.a.members[1].memberId);
      const [again] = await issue(tx, f.m2.a.completed, f.a.members[1].memberId);
      expect(again.id).toBe(first.id);
      expect(again.serial).toBe(first.serial);

      await tx.asOwner();
      expect(await tx.q(`select id from public.certificates`)).toHaveLength(1);
      const [counter] = await tx.q<{ next_value: number }>(`select next_value from public.certificate_serial_counters where org_id = $1`, [f.a.id]);
      // One issuance, one number. A second allocation here would be the gap
      // DEC-010 exists to prevent, arriving from the other direction.
      expect(counter.next_value).toBe(2);
    });
  });

  it("★ REQ-CRT-004: `review` HOLDS — invisible to the recipient, and unemailed", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      await tx.q(`update public.sessions set certificate_mode = 'review' where id = $1`, [f.m2.a.completed]);
      await tx.asServiceRole();
      const [held] = await issue(tx, f.m2.a.completed, f.a.members[1].memberId);
      expect(held.state).toBe("held");

      await tx.as(f.a.members[1].claims);
      expect(await tx.q(`select id from public.certificates`)).toEqual([]);

      await tx.asOwner();
      expect(await tx.q(`select id from public.notifications where key = 'MSG-certificate_issued'`)).toEqual([]);
    });
  });

  it("`automatic` issues immediately, with an issued_at", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      await tx.q(`update public.sessions set certificate_mode = 'automatic' where id = $1`, [f.m2.a.completed]);
      await tx.asServiceRole();
      const [row] = await issue(tx, f.m2.a.completed, f.a.members[1].memberId);
      expect(row.state).toBe("issued");
      await tx.asOwner();
      const [full] = await tx.q<{ issued_at: string | null }>(`select issued_at from public.certificates where id = $1`, [row.id]);
      expect(full.issued_at).not.toBeNull();
    });
  });

  it("issuing is service_role only, and `off` refuses outright", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      await tx.as(f.a.admin.claims);
      expect(await errorCode(() => issue(tx, f.m2.a.completed, f.a.members[1].memberId))).toBe(PERMISSION_DENIED);

      await tx.asOwner();
      await tx.q(`update public.sessions set certificate_mode = 'off' where id = $1`, [f.m2.a.completed]);
      await tx.asServiceRole();
      expect(await errorCode(() => issue(tx, f.m2.a.completed, f.a.members[1].memberId))).toBe(PERMISSION_DENIED);
    });
  });

  it("pins the template version and freezes the printed name (REQ-CRT-014)", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      await tx.asServiceRole();
      const [row] = await issue(tx, f.m2.a.completed, f.a.members[1].memberId);

      await tx.asOwner();
      const [full] = await tx.q<{ template_version_id: string; recipient_name_snapshot: string }>(
        `select template_version_id, recipient_name_snapshot from public.certificates where id = $1`,
        [row.id],
      );
      expect(full.template_version_id).toBeTruthy();
      expect(full.recipient_name_snapshot).toBe("يمان رضا");

      // A later rename does NOT reach the certificate: it records what was
      // printed, and someone is holding that piece of paper.
      await tx.q(`update public.members set display_name = 'اسم جديد' where id = $1`, [f.a.members[1].memberId]);
      const [after] = await tx.q<{ recipient_name_snapshot: string }>(`select recipient_name_snapshot from public.certificates where id = $1`, [row.id]);
      expect(after.recipient_name_snapshot).toBe("يمان رضا");
    });
  });
});

describe("POL-release_certificates.admin", () => {
  it("★ an admin releases; the recipient then sees it and is notified once", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      await tx.q(`update public.sessions set certificate_mode = 'review' where id = $1`, [f.m2.a.completed]);
      await tx.asServiceRole();
      const [held] = await tx.q<{ id: string }>(
        `select id from public.issue_certificate($1, $2, 'attendance'::public.certificate_kind)`,
        [f.m2.a.completed, f.a.members[1].memberId],
      );

      await tx.as(f.a.mod.claims);
      expect(await errorCode(() => tx.q(`select * from public.release_certificates($1::uuid[])`, [[held.id]]))).toBe(PERMISSION_DENIED);

      await tx.as(f.a.admin.claims);
      const released = await tx.q(`select * from public.release_certificates($1::uuid[])`, [[held.id]]);
      expect(released).toHaveLength(1);

      await tx.as(f.a.members[1].claims);
      expect(await tx.q(`select id from public.certificates`)).toHaveLength(1);

      await tx.asOwner();
      const notices = await tx.q(`select id from public.notifications where key = 'MSG-certificate_issued' and member_id = $1`, [f.a.members[1].memberId]);
      expect(notices).toHaveLength(1);
      const audits = await tx.q(`select id from public.audit_log where action = 'certificate.released' and subject_id = $1`, [held.id]);
      expect(audits).toHaveLength(1);
    });
  });

  it("releasing an already-issued certificate does nothing — no second notice", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      await tx.asServiceRole();
      const [issued] = await tx.q<{ id: string }>(
        `select id from public.issue_certificate($1, $2, 'attendance'::public.certificate_kind)`,
        [f.m2.a.completed, f.a.members[1].memberId],
      );
      await tx.as(f.a.admin.claims);
      expect(await tx.q(`select * from public.release_certificates($1::uuid[])`, [[issued.id]])).toEqual([]);
      await tx.asOwner();
      expect(await tx.q(`select id from public.notifications where key = 'MSG-certificate_issued'`)).toEqual([]);
    });
  });
});

describe("POL-revoke_certificate.reason", () => {
  async function issued(tx: Tx, f: Awaited<ReturnType<typeof seed>>) {
    await tx.asServiceRole();
    const [row] = await tx.q<{ id: string }>(`select id from public.issue_certificate($1, $2, 'attendance'::public.certificate_kind)`, [
      f.m2.a.completed,
      f.a.members[1].memberId,
    ]);
    return row.id;
  }

  it("★ the reason is mandatory, and the certificate is not deleted", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      const id = await issued(tx, f);

      await tx.as(f.a.admin.claims);
      expect(await errorCode(() => tx.q(`select public.revoke_certificate($1, '   ')`, [id]))).toBe("22023");
      expect(await errorCode(() => tx.q(`select public.revoke_certificate($1, null)`, [id]))).toBe("22023");

      await tx.q(`select public.revoke_certificate($1, 'أُصدرت لشخص خاطئ')`, [id]);
      await tx.asOwner();
      const [row] = await tx.q<{ state: string; revocation_reason: string }>(`select state, revocation_reason from public.certificates where id = $1`, [id]);
      // REQ-CRT-011: /verify resolves by certificate identity, so an old
      // printed copy keeps resolving — to «ملغاة».
      expect(row.state).toBe("revoked");
      expect(row.revocation_reason).toBe("أُصدرت لشخص خاطئ");
    });
  });

  it("a moderator and another org's admin are refused, and the act is audited with its reason", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      const id = await issued(tx, f);
      for (const claims of [f.a.mod.claims, f.b.admin.claims, f.a.members[1].claims]) {
        await tx.as(claims);
        expect(await errorCode(() => tx.q(`select public.revoke_certificate($1, 'سبب')`, [id]))).toBe(PERMISSION_DENIED);
      }

      await tx.as(f.a.admin.claims);
      await tx.q(`select public.revoke_certificate($1, 'خطأ إداري')`, [id]);
      await tx.asOwner();
      const [audit] = await tx.q<{ reason: string; actor_id: string }>(
        `select reason, actor_id from public.audit_log where action = 'certificate.revoked' and subject_id = $1`,
        [id],
      );
      expect(audit.reason).toBe("خطأ إداري");
      expect(audit.actor_id).toBe(f.a.admin.memberId);
    });
  });

  it("the table still refuses a revoked row with no reason, whatever the RPC does", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      const id = await issued(tx, f);
      await tx.asOwner();
      expect(await errorCode(() => tx.q(`update public.certificates set state = 'revoked', revoked_at = now() where id = $1`, [id]))).toBe(CHECK_VIOLATION);
    });
  });
});

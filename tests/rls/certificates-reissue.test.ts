// Certificates, re-issued — supabase/proposed/designer/0001_certificates_reissue.sql
// (REQ-CRT-003, REQ-CRT-008, REQ-CRT-011, REQ-CHK-017, DEC-160 §6 + contract 10,
// DEC-153's carry, DEC-010).
//
// ★ WHAT IS NOT HERE. That a one-day session's certificates are what they were
// is proved by tests/rls/{designer-certificates,certificates-designs,
// checkin-removal,checkin-late-job-hooks,session-days-certificates}.test.ts
// passing UNMODIFIED — they are evidence and this wave does not edit them. This
// file proves only what is new: a second certificate after a removal, and no
// second certificate after a revocation FOR CAUSE.
//
// The distinction those two cases turn on is the reason this file exists. An
// admin may revoke a certificate deliberately while the member's attendance is
// still complete; nothing may quietly replace THAT one. The discriminator is a
// column — `certificates.revocation_cause` — and never the fixed Arabic phrase,
// which is display copy an admin can type verbatim into the reason field.
//
// 03 §8.2: POL-certificates.live_once, RPC-issue_certificate.
// {replacement_after_removal,no_replacement_after_for_cause},
// RPC-revoke_certificate.records_its_cause,
// RPC-attendance_certificate_sync.reissues_after_removal.

import { afterAll, describe, expect, it } from "vitest";
import { applyProposed, errorCode, pool, withTx, type Tx } from "./db";
import { seed, type Org } from "./fixture";

afterAll(() => pool.end());

type F = Awaited<ReturnType<typeof seed>>;

const FILE = "designer/0001_certificates_reissue.sql";

/** A completed one-day session with certificates on — `main`'s shape, and the
 *  shape every removal in production has had so far. `0100`'s trigger gives it
 *  its one day, which is what `check_ins.session_day_id` resolves to. */
async function completedSession(tx: Tx, org: Org, mode = "automatic"): Promise<string> {
  const [row] = await tx.q<{ id: string }>(
    `insert into public.sessions (org_id, title, abstract, category_id, level, starts_at, duration_minutes, ends_at,
                                  venue_id, capacity, state, published_at, completed_at, certificate_mode)
     values ($1, 'جلسة شهادة معاد إصدارها', 'ملخص', $2, 'introductory',
             now() - interval '3 hours', 60, now() - interval '2 hours', $3, 40,
             'completed', now() - interval '2 days', now() - interval '1 hour', $4::public.certificate_mode)
     returning id`,
    [org.id, org.categoryId, org.venueId, mode],
  );
  return row.id;
}

/** A three-day workshop that has already happened, completed, certificates
 *  automatic — for the one assertion that needs more than one day: that the
 *  REPLACEMENT names the new check-in rather than the removed one. */
async function workshop(tx: Tx, f: F): Promise<{ id: string; days: string[] }> {
  const [s] = await tx.q<{ id: string }>(
    `insert into public.sessions (org_id, title, abstract, category_id, level, starts_at, ends_at, venue_id, capacity,
                                  state, published_at, completed_at, certificate_mode, require_all_days)
     values ($1, 'ورشة ثلاثة أيام', 'ملخص', $2, 'introductory', now() - interval '200 hours', now() - interval '198 hours', $3, 20,
             'completed', now() - interval '10 days', now() - interval '1 hour', 'automatic', true) returning id`,
    [f.a.id, f.a.categoryId, f.a.venueId],
  );
  for (const from of [176, 152]) {
    await tx.q(
      `insert into public.session_days (org_id, session_id, position, starts_at, ends_at, venue_id)
       values ($1, $2, 1, now() - ($3 || ' hours')::interval, now() - ($3 || ' hours')::interval + interval '2 hours', $4)`,
      [f.a.id, s.id, String(from), f.a.venueId],
    );
  }
  const days = (await tx.q<{ id: string }>(`select id from public.session_days where session_id = $1 order by position`, [s.id])).map((d) => d.id);
  expect(days).toHaveLength(3);
  return { id: s.id, days };
}

/** A check-in written straight in, as the fixtures do. `session_day_id` is left
 *  to `0105`'s before-insert trigger where no day is named. */
const attend = (tx: Tx, f: F, session: string, member: string, day: string | null = null) =>
  tx.q<{ id: string }>(
    `insert into public.check_ins (org_id, session_id, session_day_id, member_id, method, manual_reason, marked_by, session_window)
     values ($1, $2, $3, $4, 'manual', 'حضر', $5, 'empty'::tstzrange) returning id`,
    [f.a.id, session, day, member, f.a.admin.memberId],
  );

const issue = (tx: Tx, session: string, member: string) =>
  tx.q<{ id: string; serial: string; state: string; check_in_id: string; verification_code: string }>(
    `select * from public.issue_certificate($1, $2, 'attendance')`,
    [session, member],
  );

const certsOf = (tx: Tx, session: string, member: string) =>
  tx.q<{ id: string; serial: string; state: string; revocation_cause: string | null; check_in_id: string }>(
    `select id, serial, state, revocation_cause, check_in_id from public.certificates
      where session_id = $1 and member_id = $2 and kind = 'attendance' order by serial`,
    [session, member],
  );

const certJobs = (tx: Tx, session: string) =>
  tx.q<{ key: string }>(
    `select key from graphile_worker.jobs where task_identifier = 'issue_certificates' and key like $1 order by key`,
    [`cert:${session}:%:attendance`],
  );

/** The org's whole serial register, exactly as `allocate_serial()` leaves it. */
const counters = (tx: Tx, org: string) =>
  tx.q<{ year: number; next_value: number }>(`select year, next_value from public.certificate_serial_counters where org_id = $1 order by year`, [org]);

/** Owner's privileges, an admin's identity — the way `remove_check_in()` calls
 *  the hook, which no client role may execute. */
async function asOwnerWithClaims(tx: Tx, claims: F["a"]["admin"]["claims"]) {
  await tx.as(claims);
  await tx.q(`reset role`);
}

describe("POL-certificates.live_once", () => {
  it("a second LIVE row for one (org, session, member, kind) is refused; a second REVOKED row is accepted", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await applyProposed(tx, FILE);
      const session = await completedSession(tx, f.a);
      const member = f.a.members[1].memberId;
      await attend(tx, f, session, member);
      const [first] = await issue(tx, session, member);

      // The whole row again, differing only in the two columns that cannot
      // collide whatever this index says — the serial and the code. The serial
      // keeps its shape (`certificates_serial_shape`, six digits): only the
      // counter part is replaced, so a 23514 can never be mistaken for the
      // 23505 this case is about.
      const insertWith = (state: string, tail: string) =>
        tx.q(
          `insert into public.certificates (org_id, member_id, kind, session_id, check_in_id, serial, verification_code,
                                            state, template_version_id, recipient_name_snapshot, issued_at, revoked_at, revocation_reason)
           select org_id, member_id, kind, session_id, check_in_id, left(serial, length(serial) - 6) || $2, public.new_verification_code(),
                  $3::public.certificate_state, template_version_id, recipient_name_snapshot,
                  case when $3 = 'held' then null else now() end,
                  case when $3 = 'revoked' then now() end,
                  case when $3 = 'revoked' then 'سبب' end
             from public.certificates where id = $1`,
          [first.id, tail, state],
        );

      // `issued` and `held` are both live, and both collide with the live row.
      expect(await errorCode(() => insertWith("issued", "900001"))).toBe("23505");
      expect(await errorCode(() => insertWith("held", "900002"))).toBe("23505");
      // A revoked one does not — which is exactly what keeps the first
      // certificate on the register once a replacement is issued.
      expect(await errorCode(() => insertWith("revoked", "900003"))).toBeNull();
      // …and a SECOND revoked one does not either: the register keeps every
      // document that ever existed.
      expect(await errorCode(() => insertWith("revoked", "900004"))).toBeNull();
    });
  });

  it("the index, and not the dropped constraint, is what refuses — by name", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await applyProposed(tx, FILE);
      const uniques = await tx.q<{ conname: string }>(
        `select conname from pg_constraint where conrelid = 'public.certificates'::regclass and contype = 'u' order by conname`,
      );
      expect(uniques.map((u) => u.conname)).not.toContain("certificates_org_id_session_id_member_id_kind_key");
      // The other two are untouched (DEC-010: the serial is per org, and the
      // verification code is the only key /verify accepts).
      expect(uniques.map((u) => u.conname)).toContain("certificates_org_id_serial_key");

      const [idx] = await tx.q<{ indexdef: string }>(`select indexdef from pg_indexes where indexname = 'certificates_live_once'`);
      expect(idx?.indexdef).toContain("UNIQUE");
      expect(idx?.indexdef).toContain("WHERE (state <> 'revoked'");
      void f;
    });
  });
});

describe("RPC-revoke_certificate.records_its_cause", () => {
  it("an admin's own revocation is `for_cause`; the removal path passes `attendance_removed`, with the fixed phrase unchanged", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await applyProposed(tx, FILE);
      const session = await completedSession(tx, f.a);
      const [one, two] = [f.a.members[1].memberId, f.a.members[0].memberId];
      await attend(tx, f, session, one);
      await attend(tx, f, session, two);
      const [certOne] = await issue(tx, session, one);
      await issue(tx, session, two);

      // (a) SCR-045's revocation — two arguments, `main`'s call.
      await tx.as(f.a.admin.claims);
      await tx.q(`select * from public.revoke_certificate($1, $2)`, [certOne.id, "صدرت باسم خاطئ"]);
      await tx.asOwner();
      const [revoked] = await certsOf(tx, session, one);
      expect(revoked.state).toBe("revoked");
      expect(revoked.revocation_cause).toBe("for_cause");

      // (b) the removal path, through the hook the check-in RPCs call.
      await tx.as(f.a.admin.claims);
      await tx.q(`select * from public.remove_check_in($1, $2, $3)`, [session, two, "لم يكن حاضرًا فعليًا"]);
      await tx.asOwner();
      const [byRemoval] = await certsOf(tx, session, two);
      expect(byRemoval.state).toBe("revoked");
      expect(byRemoval.revocation_cause).toBe("attendance_removed");
      // ★ The phrase is unchanged and the admin's own words never reach the
      // member (REQ-CHK-017). The CAUSE travels in its own column beside it —
      // it is never read back out of the sentence.
      const [reason] = await tx.q<{ revocation_reason: string }>(`select revocation_reason from public.certificates where id = $1`, [byRemoval.id]);
      expect(reason.revocation_reason).toBe("أُلغي تسجيل الحضور");
    });
  });

  it("the cause is audited beside the serial, so the log says which kind of revocation it was", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await applyProposed(tx, FILE);
      const session = await completedSession(tx, f.a);
      const member = f.a.members[1].memberId;
      await attend(tx, f, session, member);
      const [cert] = await issue(tx, session, member);

      await tx.as(f.a.admin.claims);
      await tx.q(`select * from public.revoke_certificate($1, $2)`, [cert.id, "صدرت باسم خاطئ"]);
      await tx.asOwner();
      const [row] = await tx.q<{ after: { cause: string; serial: string } }>(
        `select after from public.audit_log where action = 'certificate.revoked' and subject_type = 'certificate' and subject_id = $1`,
        [cert.id],
      );
      expect(row.after.cause).toBe("for_cause");
      expect(row.after.serial).toBe(cert.serial);
    });
  });
});

describe("RPC-issue_certificate.replacement_after_removal", () => {
  it("★ removed and re-added: a SECOND certificate under the NEXT serial, the first still revoked and still verifying", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await applyProposed(tx, FILE);
      const session = await completedSession(tx, f.a);
      const member = f.a.members[1].memberId;
      await attend(tx, f, session, member);
      const [first] = await issue(tx, session, member);

      await tx.as(f.a.admin.claims);
      await tx.q(`select * from public.remove_check_in($1, $2, $3)`, [session, member, "خطأ إداري"]);
      await tx.q(`select * from public.mark_checked_in_manually($1, $2, $3)`, [session, member, "حضر فعلًا"]);
      await tx.asOwner();

      const [second] = await issue(tx, session, member);
      expect(second.id).not.toBe(first.id);
      expect(second.state).toBe("issued");

      // ★ The NEXT serial — consecutive, nothing skipped (DEC-010).
      const n = (s: string) => Number(s.slice(s.lastIndexOf("-") + 1));
      expect(n(second.serial)).toBe(n(first.serial) + 1);

      // Ordered by serial, so: the revoked original, then its replacement.
      const rows = await certsOf(tx, session, member);
      expect(rows).toHaveLength(2);
      expect(rows.map((r) => r.state)).toEqual(["revoked", "issued"]);
      const [older, newer] = rows;
      expect(older.state).toBe("revoked");
      expect(older.revocation_cause).toBe("attendance_removed");
      expect(newer.state).toBe("issued");
      // The replacement names the attendance it actually attests, not the
      // removed check-in.
      expect(newer.check_in_id).not.toBe(older.check_in_id);

      // ★ Two rows, two random codes, two public pages: the revoked one keeps
      // resolving — as revoked, and WITHOUT its reason (REQ-CRT-007, and the
      // reason is the member's and the admin's, never the public's).
      const codes = await tx.q<{ id: string; verification_code: string }>(
        `select id, verification_code from public.certificates where session_id = $1 and member_id = $2`,
        [session, member],
      );
      await tx.asAnon();
      for (const c of codes) {
        const [v] = await tx.q<{ state: string; recipient_name: string }>(`select * from public.verify_certificate($1)`, [c.verification_code]);
        expect(v.state).toBe(c.id === older.id ? "revoked" : "issued");
      }
    });
  });

  it("at three days the replacement names the member's LATEST day, not the removed one", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await applyProposed(tx, FILE);
      const w = await workshop(tx, f);
      const member = f.a.members[1].memberId;
      const ids: string[] = [];
      for (const d of w.days) ids.push((await attend(tx, f, w.id, member, d))[0].id);
      const [first] = await issue(tx, w.id, member);
      expect(first.check_in_id).toBe(ids[2]); // day 3, by the day's own start

      // Remove day 1 — attendance is no longer complete, so the certificate
      // that names day 3 is revoked (DEC-153's own case, still true).
      await tx.as(f.a.admin.claims);
      await tx.q(`select * from public.remove_check_in($1, $2, $3, $4)`, [w.id, member, "خطأ", w.days[0]]);
      await tx.asOwner();
      expect((await certsOf(tx, w.id, member))[0].state).toBe("revoked");

      // Mark day 1 again: complete once more, and the replacement still names
      // day 3 — the last day attended, never the newest row by `created_at`.
      await tx.as(f.a.admin.claims);
      await tx.q(`select * from public.mark_checked_in_manually($1, $2, $3, $4)`, [w.id, member, "حضر", w.days[0]]);
      await tx.asOwner();
      const [second] = await issue(tx, w.id, member);
      expect(second.check_in_id).toBe(ids[2]);
      expect(second.state).toBe("issued");
      expect((await certsOf(tx, w.id, member))).toHaveLength(2);
    });
  });
});

describe("RPC-issue_certificate.no_replacement_after_for_cause", () => {
  it("★ a certificate revoked FOR CAUSE is never replaced — and the refusal does not move the org's serial counter", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await applyProposed(tx, FILE);
      const session = await completedSession(tx, f.a);
      const member = f.a.members[1].memberId;
      await attend(tx, f, session, member);
      const [cert] = await issue(tx, session, member);

      // The admin revokes deliberately. Attendance stays COMPLETE throughout —
      // that is what makes this different from a removal, and what every hook
      // below would otherwise read as «this member deserves a certificate».
      await tx.as(f.a.admin.claims);
      await tx.q(`select * from public.revoke_certificate($1, $2)`, [cert.id, "صدرت لشخص لم يُكمل المتطلبات"]);
      await tx.asOwner();
      const before = await counters(tx, f.a.id);

      // (a) the sync hook, on the next attendance change: nothing enqueued.
      await tx.q(`delete from graphile_worker._private_jobs`);
      await asOwnerWithClaims(tx, f.a.admin.claims);
      await tx.q(`select public.attendance_certificate_sync($1, $2)`, [session, member]);
      await tx.asOwner();
      expect(await certJobs(tx, session)).toEqual([]);

      // (b) a re-run fan-out. It fans out by ELIGIBILITY, never by existing
      // rows, so the job IS enqueued — and the function refuses it.
      expect(await tx.q(`select public.fan_out_certificates($1) as n`, [session])).toEqual([{ n: 1 }]);
      expect((await certJobs(tx, session)).map((j) => j.key)).toEqual([`cert:${session}:${member}:attendance`]);

      // (c) the job runs: 42501, which the worker reads as «no longer eligible
      // — nothing issued» and returns from without retrying.
      expect(await errorCode(() => issue(tx, session, member))).toBe("42501");

      // Still exactly one row, still revoked.
      const rows = await certsOf(tx, session, member);
      expect(rows).toHaveLength(1);
      expect(rows[0].state).toBe("revoked");
      expect(rows[0].revocation_cause).toBe("for_cause");

      // ★ AND NO NUMBER WAS TAKEN. The refusal is raised before
      // `allocate_serial()`, which is called in the insert's value list — so a
      // blocked re-issue leaves the register exactly where it was. A gap reads
      // as a lost or hidden certificate (DEC-010), and this is the assertion
      // that keeps a refusal from making one.
      expect(await counters(tx, f.a.id)).toEqual(before);
    });
  });

  it("a revocation written before this file — no cause at all — reads as final", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await applyProposed(tx, FILE);
      const session = await completedSession(tx, f.a);
      const member = f.a.members[1].memberId;
      await attend(tx, f, session, member);
      const [cert] = await issue(tx, session, member);

      await tx.as(f.a.admin.claims);
      await tx.q(`select * from public.revoke_certificate($1, $2)`, [cert.id, "سبب"]);
      await tx.asOwner();
      // Exactly the shape of every row revoked before this migration: revoked,
      // with a reason, and no cause. `coalesce(…, 'for_cause')` reads it as
      // final, which is the conservative direction and is deliberate.
      await tx.q(`update public.certificates set revocation_cause = null where id = $1`, [cert.id]);

      expect(await errorCode(() => issue(tx, session, member))).toBe("42501");
      expect(await certsOf(tx, session, member)).toHaveLength(1);
    });
  });
});

describe("RPC-attendance_certificate_sync.reissues_after_removal", () => {
  it("a removal-revoked row lets the job through; a for-cause one does not; a LIVE one still does not", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await applyProposed(tx, FILE);
      const session = await completedSession(tx, f.a);
      const member = f.a.members[1].memberId;
      const sync = async () => {
        await asOwnerWithClaims(tx, f.a.admin.claims);
        await tx.q(`select public.attendance_certificate_sync($1, $2)`, [session, member]);
        await tx.asOwner();
      };

      await attend(tx, f, session, member);
      await issue(tx, session, member);

      // A LIVE row: nothing to do — `issue_certificate()` would return it
      // unchanged, so a job would be a no-op that looks like work. This is the
      // half of the old «any row» guard that does NOT change.
      await tx.q(`delete from graphile_worker._private_jobs`);
      await sync();
      expect(await certJobs(tx, session)).toEqual([]);

      // Removed, then re-added: the revocation was a removal's, so the job is
      // enqueued under 11 §2.5's own key — unchanged, and free again because a
      // completed graphile job is deleted.
      await tx.as(f.a.admin.claims);
      await tx.q(`select * from public.remove_check_in($1, $2, $3)`, [session, member, "خطأ"]);
      await tx.q(`select * from public.mark_checked_in_manually($1, $2, $3)`, [session, member, "حضر"]);
      await tx.asOwner();
      expect((await certJobs(tx, session)).map((j) => j.key)).toEqual([`cert:${session}:${member}:attendance`]);

      // Now revoke the replacement FOR CAUSE and sync again: nothing.
      await tx.q(`delete from graphile_worker._private_jobs`);
      const [replacement] = await issue(tx, session, member);
      await tx.as(f.a.admin.claims);
      await tx.q(`select * from public.revoke_certificate($1, $2)`, [replacement.id, "صدرت خطأً"]);
      await tx.asOwner();
      await tx.q(`delete from graphile_worker._private_jobs`);
      await sync();
      expect(await certJobs(tx, session)).toEqual([]);
    });
  });

  it("never_fails_a_check_in still holds: called as a plain member it raises nothing, whatever rows exist", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await applyProposed(tx, FILE);
      const session = await completedSession(tx, f.a);
      const member = f.a.members[1];
      await attend(tx, f, session, member.memberId);
      const [cert] = await issue(tx, session, member.memberId);
      await tx.as(f.a.admin.claims);
      await tx.q(`select * from public.revoke_certificate($1, $2)`, [cert.id, "سبب"]);

      await asOwnerWithClaims(tx, member.claims);
      expect(await errorCode(() => tx.q(`select public.attendance_certificate_sync($1, $2)`, [session, member.memberId]))).toBeNull();
    });
  });
});

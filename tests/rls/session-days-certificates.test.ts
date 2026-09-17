// Certificates follow attendance — supabase/migrations/0108 (REQ-SES-017,
// DEC-150 contract 6, DEC-151 contract 5's third hook, DEC-153).
//
// ★ The proof that a ONE-day session's certificates are what they were is NOT
// here: it is tests/rls/{designer-certificates,certificates-designs,
// checkin-removal,checkin-late-job-hooks}.test.ts passing unmodified. This file
// proves what is new — three days, the relaxed rule, the certificate that names
// day 3 when day 1 is removed, and the member marked present after completion.
import { afterAll, describe, expect, it } from "vitest";
import { errorCode, errorMessage, PERMISSION_DENIED, pool, withTx, type Tx } from "./db";
import { seed } from "./fixture";

afterAll(() => pool.end());

type F = Awaited<ReturnType<typeof seed>>;

/** A three-day workshop that has already happened, `in_progress`, certificates automatic. Days 1…3 by position. */
async function workshop(tx: Tx, f: F, requireAll = true): Promise<{ id: string; days: string[] }> {
  await tx.asOwner();
  const [s] = await tx.q<{ id: string }>(
    `insert into public.sessions (org_id, title, abstract, category_id, level, starts_at, ends_at, venue_id, capacity,
                                  state, published_at, certificate_mode, require_all_days)
     values ($1, 'ورشة ثلاثة أيام', 'ملخص', $2, 'introductory', now() - interval '200 hours', now() - interval '198 hours', $3, 20,
             'in_progress', now() - interval '10 days', 'automatic', $4) returning id`,
    [f.a.id, f.a.categoryId, f.a.venueId, requireAll],
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

const attend = (tx: Tx, f: F, session: string, day: string, member: string) =>
  tx.q<{ id: string }>(
    `insert into public.check_ins (org_id, session_id, session_day_id, member_id, method, manual_reason, marked_by, session_window)
     values ($1, $2, $3, $4, 'manual', 'حضر', $5, 'empty'::tstzrange) returning id`,
    [f.a.id, session, day, member, f.a.admin.memberId],
  );

const complete = (tx: Tx, session: string) =>
  tx.q(`update public.sessions set state = 'completed', completed_at = now() where id = $1`, [session]);

const certJobs = (tx: Tx, session: string) =>
  tx.q<{ key: string }>(
    `select key from graphile_worker.jobs where task_identifier = 'issue_certificates' and key like $1 order by key`,
    [`cert:${session}:%:attendance`],
  );

/** Owner's privileges, an admin's identity: a definer hook no client role may execute, called the way remove_check_in() calls it. */
async function asOwnerWithClaims(tx: Tx, claims: F["a"]["admin"]["claims"]) {
  await tx.as(claims);
  await tx.q(`reset role`);
}

describe("RPC-fan_out_certificates.complete_attendance", () => {
  it("three days attended → one job; two of three → none; the fan-out is once per member, never once per check-in", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      const w = await workshop(tx, f);
      const [full, partial] = [f.a.members[1].memberId, f.a.members[0].memberId];
      for (const d of w.days) await attend(tx, f, w.id, d, full);
      for (const d of w.days.slice(0, 2)) await attend(tx, f, w.id, d, partial);
      await tx.q(`delete from graphile_worker._private_jobs`);

      await complete(tx, w.id);
      expect((await certJobs(tx, w.id)).map((j) => j.key)).toEqual([`cert:${w.id}:${full}:attendance`]);
    });
  });

  it("with require_all_days = false, one day is enough", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      const w = await workshop(tx, f, false);
      const once = f.a.members[1].memberId;
      await attend(tx, f, w.id, w.days[1], once);
      await tx.q(`delete from graphile_worker._private_jobs`);
      await complete(tx, w.id);
      expect((await certJobs(tx, w.id)).map((j) => j.key)).toEqual([`cert:${w.id}:${once}:attendance`]);
    });
  });
});

describe("RPC-issue_certificate.complete_attendance", () => {
  it("a late job for a member who attended two days of three raises `no_check_in`; a full attendee's certificate names their LATEST check-in", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      const w = await workshop(tx, f);
      const [full, partial] = [f.a.members[1].memberId, f.a.members[0].memberId];
      const ids: string[] = [];
      for (const d of w.days) ids.push((await attend(tx, f, w.id, d, full))[0].id);
      for (const d of w.days.slice(0, 2)) await attend(tx, f, w.id, d, partial);
      await complete(tx, w.id);

      const issue = (member: string) => tx.q<{ check_in_id: string; state: string }>(`select * from public.issue_certificate($1, $2, 'attendance')`, [w.id, member]);
      expect(await errorMessage(() => issue(partial))).toMatch(/no_check_in/);
      expect(await errorCode(() => issue(partial))).toBe(PERMISSION_DENIED);
      const [cert] = await issue(full);
      expect(cert.state).toBe("issued");
      expect(cert.check_in_id).toBe(ids[2]); // the last day attended — the row `scoring` keys the award to
    });
  });
});

describe("RPC-attendance_certificate_sync.*", () => {
  it("revokes_whichever_day — removing DAY 1's check-in revokes a certificate that names DAY 3", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      const w = await workshop(tx, f);
      const member = f.a.members[1].memberId;
      const ids: string[] = [];
      for (const d of w.days) ids.push((await attend(tx, f, w.id, d, member))[0].id);
      await complete(tx, w.id);
      const [cert] = await tx.q<{ id: string; check_in_id: string }>(`select * from public.issue_certificate($1, $2, 'attendance')`, [w.id, member]);
      expect(cert.check_in_id).toBe(ids[2]);

      // what remove_check_in() does to the row, then the hook it will call
      await tx.q(`update public.check_ins set removed_at = now(), removed_by = $2, removal_reason = 'خطأ' where id = $1`, [ids[0], f.a.admin.memberId]);
      await asOwnerWithClaims(tx, f.a.admin.claims);
      await tx.q(`select public.attendance_certificate_sync($1, $2)`, [w.id, member]);

      await tx.asOwner();
      const [after] = await tx.q<{ state: string; revocation_reason: string }>(`select state, revocation_reason from public.certificates where id = $1`, [cert.id]);
      expect(after).toEqual({ state: "revoked", revocation_reason: "أُلغي تسجيل الحضور" }); // the fixed phrase, never the admin's words
    });
  });

  it("with require_all_days = false, removing one of two attended days leaves the certificate standing", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      const w = await workshop(tx, f, false);
      const member = f.a.members[1].memberId;
      const [first] = await attend(tx, f, w.id, w.days[0], member);
      await attend(tx, f, w.id, w.days[2], member);
      await complete(tx, w.id);
      const [cert] = await tx.q<{ id: string }>(`select * from public.issue_certificate($1, $2, 'attendance')`, [w.id, member]);

      await tx.q(`update public.check_ins set removed_at = now(), removed_by = $2, removal_reason = 'خطأ' where id = $1`, [first.id, f.a.admin.memberId]);
      await asOwnerWithClaims(tx, f.a.admin.claims);
      await tx.q(`select public.attendance_certificate_sync($1, $2)`, [w.id, member]);
      await tx.asOwner();
      expect((await tx.q<{ state: string }>(`select state from public.certificates where id = $1`, [cert.id]))[0].state).toBe("issued");
    });
  });

  it("issues_when_completed_late — a member marked present on the missing day AFTER completion gets the job; not while running, not with certificates off, not over an existing row", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      const w = await workshop(tx, f);
      const member = f.a.members[1].memberId;
      for (const d of w.days.slice(0, 2)) await attend(tx, f, w.id, d, member);
      const sync = async () => {
        await asOwnerWithClaims(tx, f.a.admin.claims);
        await tx.q(`select public.attendance_certificate_sync($1, $2)`, [w.id, member]);
        await tx.asOwner();
      };

      await tx.q(`delete from graphile_worker._private_jobs`);
      await attend(tx, f, w.id, w.days[2], member); //           complete — but the session is still running
      await sync();
      expect(await certJobs(tx, w.id)).toEqual([]); //           the fan-out at completion will find them

      await tx.q(`update public.check_ins set removed_at = now(), removed_by = $3, removal_reason = 'خطأ' where session_day_id = $1 and member_id = $2`, [w.days[2], member, f.a.admin.memberId]);
      await complete(tx, w.id); //                                completed with day 3 missing: nothing fanned out
      expect(await certJobs(tx, w.id)).toEqual([]);

      await tx.q(`update public.sessions set certificate_mode = 'off' where id = $1`, [w.id]);
      await attend(tx, f, w.id, w.days[2], member); //           the admin corrects the last day's list the next morning
      await sync();
      expect(await certJobs(tx, w.id)).toEqual([]); //           D50: off means nothing is generated at all

      await tx.q(`update public.sessions set certificate_mode = 'automatic' where id = $1`, [w.id]);
      await sync();
      expect((await certJobs(tx, w.id)).map((j) => j.key)).toEqual([`cert:${w.id}:${member}:attendance`]);

      // an existing row — issue it, clear the queue, sync again: nothing, because issue_certificate() would return it unchanged
      await tx.q(`select public.issue_certificate($1, $2, 'attendance')`, [w.id, member]);
      await tx.q(`delete from graphile_worker._private_jobs`);
      await sync();
      expect(await certJobs(tx, w.id)).toEqual([]);
    });
  });

  it("never_fails_a_check_in — as a plain member with incomplete attendance and a live certificate nearby, it raises nothing and revokes nothing; no client role may call it", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      const w = await workshop(tx, f);
      const member = f.a.members[1];
      await attend(tx, f, w.id, w.days[0], member.memberId);

      await asOwnerWithClaims(tx, member.claims); // the identity a member's own check_in() runs the hook under
      expect(await errorCode(() => tx.q(`select public.attendance_certificate_sync($1, $2)`, [w.id, member.memberId]))).toBeNull();
      expect(await errorCode(() => tx.q(`select public.attendance_certificate_sync($1, $2)`, [f.m2.b.published, member.memberId]))).toBeNull();

      for (const who of [member.claims, f.a.admin.claims]) {
        await tx.as(who);
        expect(await errorCode(() => tx.q(`select public.attendance_certificate_sync($1, $2)`, [w.id, member.memberId]))).toBe(PERMISSION_DENIED);
      }
    });
  });
});

describe("RPC-session_complete_attendees.staff_only", () => {
  it("staff read who is complete — once each; a member is refused; another org's staff read nothing", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      const w = await workshop(tx, f);
      const [full, partial] = [f.a.members[1].memberId, f.a.members[0].memberId];
      for (const d of w.days) await attend(tx, f, w.id, d, full);
      await attend(tx, f, w.id, w.days[0], partial);
      const read = () => tx.q<{ m: string }>(`select public.session_complete_attendees($1) as m`, [w.id]);

      await tx.as(f.a.mod.claims);
      expect((await read()).map((r) => r.m)).toEqual([full]);
      await tx.as(f.a.members[1].claims);
      expect(await errorCode(read)).toBe(PERMISSION_DENIED);
      await tx.as(f.b.admin.claims);
      expect(await read()).toEqual([]);

      // at ONE day it is everyone with an active check-in — what SCR-045 listed before
      await tx.as(f.a.admin.claims);
      const one = await tx.q<{ m: string }>(`select public.session_complete_attendees($1) as m`, [f.m2.a.completed]);
      expect(one.map((r) => r.m)).toEqual([f.a.members[1].memberId]);
    });
  });
});

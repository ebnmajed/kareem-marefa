// Wave 22, PR A — hosting points follow the owner of the place (REQ-PTS-016, STORY-PTS-008, DEC-230 §2, DEC-232 §1).
//
// supabase/proposed/scoring/hosting_follows_the_venue.sql re-creates evaluate_company_points() with rule 1 reading the
// venue's company (0180) for each of the session's days. Every case evaluates as service_role — the worker's role — and
// reads as the owner. ★ A venue owned by no company rewards no company, BY RULE: the case below says so in its title so
// nobody later reads the empty result as a defect.
//
// 03 §8.2 rows proven here: RPC-evaluate_company_points.hosting, .hosting_no_owner, .hosting_inactive_owner,
// .host_company_id_not_read, .hosting_once_per_session.
//
// Both files are applied inside the test's rolled-back transaction (applyProposed, DEC-040); once the lead promotes
// them, applyProposed() is a no-op and the migrations supply the same objects.
import { afterAll, describe, expect, it } from "vitest";
import { applyProposed, pool, withTx } from "./db";
import type { Tx } from "./db";
import { seed, type Org } from "./fixture";

afterAll(() => pool.end());

async function ready(tx: Tx) {
  const f = await seed(tx);
  await applyProposed(tx, "lead/0180_venue_company.sql");
  await applyProposed(tx, "scoring/hosting_follows_the_venue.sql");
  return f;
}

async function company(tx: Tx, org: Org, name: string): Promise<string> {
  const [row] = await tx.q<{ id: string }>(`insert into public.companies (org_id, name) values ($1, $2) returning id`, [org.id, name]);
  return row.id;
}

async function venue(tx: Tx, org: Org, name: string, companyId: string | null): Promise<string> {
  const [row] = await tx.q<{ id: string }>(`insert into public.venues (org_id, name, capacity, company_id) values ($1, $2, 40, $3) returning id`, [
    org.id,
    name,
    companyId,
  ]);
  return row.id;
}

/** A completed one-day session at `venueId` (null: a custom venue), with `hostCompanyId` written to the superseded column. */
async function completedSession(tx: Tx, org: Org, venueId: string | null, hostCompanyId: string | null = null): Promise<string> {
  const [session] = await tx.q<{ id: string }>(
    `insert into public.sessions (org_id, title, abstract, category_id, level, starts_at, duration_minutes, ends_at,
                                   venue_id, custom_venue_name, capacity, state, published_at, completed_at, host_company_id)
     values ($1, 'جلسة الاستضافة', 'ملخص', $2, 'introductory',
             now() - interval '2 hours', 60, now() - interval '1 hour',
             $3, case when $3::uuid is null then 'قاعة خارجية' end, 40, 'completed', now() - interval '3 days', now() - interval '1 hour', $4)
     returning id`,
    [org.id, org.categoryId, venueId, hostCompanyId],
  );
  return session.id;
}

async function addDay(tx: Tx, org: Org, sessionId: string, hoursAgo: number, venueId: string) {
  await tx.q(
    `insert into public.session_days (org_id, session_id, position, starts_at, ends_at, venue_id)
     values ($1, $2, 1, now() - ($3 || ' hours')::interval, now() - ($3 || ' hours')::interval + interval '1 hour', $4)`,
    [org.id, sessionId, String(hoursAgo), venueId],
  );
}

async function evaluate(tx: Tx, sessionId: string) {
  await tx.asServiceRole();
  await tx.q(`select public.evaluate_company_points($1)`, [sessionId]);
  await tx.asOwner();
}

const hostingRows = (tx: Tx, sessionId: string) =>
  tx.q<{ company_id: string; amount: number; rule_version: number; reason: string }>(
    `select company_id, amount, rule_version, reason from public.company_points_ledger
      where session_id = $1 and source = 'company_hosting' order by company_id`,
    [sessionId],
  );

async function hostingRule(tx: Tx, org: Org) {
  const [rule] = await tx.q<{ points: number; version: number; reason_ar: string }>(
    `select points, version, reason_ar from public.company_scoring_rules where org_id = $1 and action_key = 'company_hosting'`,
    [org.id],
  );
  return rule;
}

describe("RPC-evaluate_company_points — hosting follows the venue's owner (REQ-PTS-016)", () => {
  it("hosting — a presenter from A in a room owned by B: B earns hosting, A earns presenting and no hosting", async () => {
    await withTx(async (tx) => {
      const f = await ready(tx);
      const b = await company(tx, f.a, "شركة القاعة");
      const sessionId = await completedSession(tx, f.a, await venue(tx, f.a, "قاعة الشركة ب", b));
      await tx.q(`insert into public.session_presenters (org_id, session_id, member_id, accepted) values ($1, $2, $3, true)`, [
        f.a.id,
        sessionId,
        f.a.members[0].memberId,
      ]);
      await evaluate(tx, sessionId);

      const rule = await hostingRule(tx, f.a);
      expect(await hostingRows(tx, sessionId)).toEqual([{ company_id: b, amount: rule.points, rule_version: rule.version, reason: rule.reason_ar }]);
      const presenting = await tx.q<{ company_id: string }>(
        `select company_id from public.company_points_ledger where session_id = $1 and source = 'company_presenting_pct'`,
        [sessionId],
      );
      expect(presenting).toEqual([{ company_id: f.a.companyId }]);
    });
  });

  it("hosting_no_owner — a venue owned by no company rewards no company, BY RULE (not a gap); the other rules still pay", async () => {
    await withTx(async (tx) => {
      const f = await ready(tx);
      const sessionId = await completedSession(tx, f.a, await venue(tx, f.a, "قاعة عامة", null));
      for (const m of [f.a.admin, f.a.mod, f.a.members[0]]) {
        await tx.q(
          `insert into public.check_ins (org_id, session_id, member_id, method, manual_reason, marked_by, session_window)
           values ($1, $2, $3, 'manual', 'اختبار', $4, 'empty'::tstzrange)`,
          [f.a.id, sessionId, m.memberId, f.a.admin.memberId],
        );
      }
      await evaluate(tx, sessionId);

      expect(await hostingRows(tx, sessionId)).toEqual([]);
      const attendance = await tx.q(`select id from public.company_points_ledger where session_id = $1 and source = 'company_attendance_pct'`, [sessionId]);
      expect(attendance).toHaveLength(1);
    });
  });

  it("hosting_no_owner — a custom venue has no venue row, so no owner: no hosting row", async () => {
    await withTx(async (tx) => {
      const f = await ready(tx);
      const sessionId = await completedSession(tx, f.a, null);
      await evaluate(tx, sessionId);
      expect(await hostingRows(tx, sessionId)).toEqual([]);
    });
  });

  it("hosting_inactive_owner — a deactivated company earns nothing while it owns the venue (DEC-232 §1.2)", async () => {
    await withTx(async (tx) => {
      const f = await ready(tx);
      const b = await company(tx, f.a, "شركة متوقفة");
      const sessionId = await completedSession(tx, f.a, await venue(tx, f.a, "قاعة الشركة المتوقفة", b));
      await tx.q(`update public.companies set deactivated_at = now() where id = $1`, [b]);
      await evaluate(tx, sessionId);
      expect(await hostingRows(tx, sessionId)).toEqual([]);
    });
  });

  it("★ host_company_id_not_read — the superseded column credits nobody, with an owned venue and without one", async () => {
    await withTx(async (tx) => {
      const f = await ready(tx);
      const b = await company(tx, f.a, "مالكة القاعة");
      const c = await company(tx, f.a, "المستضيفة القديمة");
      const owned = await completedSession(tx, f.a, await venue(tx, f.a, "قاعة ب", b), c);
      const unowned = await completedSession(tx, f.a, await venue(tx, f.a, "قاعة بلا مالك", null), c);
      await evaluate(tx, owned);
      await evaluate(tx, unowned);

      expect((await hostingRows(tx, owned)).map((r) => r.company_id)).toEqual([b]);
      expect(await hostingRows(tx, unowned)).toEqual([]);
    });
  });

  it("hosting — idempotent: a replay writes no second row", async () => {
    await withTx(async (tx) => {
      const f = await ready(tx);
      const b = await company(tx, f.a, "شركة القاعة");
      const sessionId = await completedSession(tx, f.a, await venue(tx, f.a, "قاعة ب", b));
      await evaluate(tx, sessionId);
      await evaluate(tx, sessionId);
      expect(await hostingRows(tx, sessionId)).toHaveLength(1);
    });
  });

  it("hosting_once_per_session — a session already credited under 0081's rule is not credited again under this one", async () => {
    await withTx(async (tx) => {
      const f = await ready(tx);
      const b = await company(tx, f.a, "مالكة القاعة");
      const c = await company(tx, f.a, "المستضيفة القديمة");
      const sessionId = await completedSession(tx, f.a, await venue(tx, f.a, "قاعة ب", b), c);
      // The row 0081's rule wrote for the session's host company, before this definition existed — inserted as the
      // owner, because no client role and not service_role may insert into the ledger (0081).
      await tx.asOwner();
      await tx.q(
        `insert into public.company_points_ledger (org_id, company_id, amount, source, source_id, session_id, reason, rule_key, rule_version, idempotency_key)
         values ($1, $2, 100, 'company_hosting', $3, $3, 'استضافة', 'company_hosting', 1, $4)`,
        [f.a.id, c, sessionId, `company_hosting:session_delivered:${sessionId}:${c}:v1`],
      );
      await evaluate(tx, sessionId);
      expect((await hostingRows(tx, sessionId)).map((r) => r.company_id)).toEqual([c]);
    });
  });

  it("hosting — a multi-day session credits each distinct owner of its days once (DEC-232 §1.1)", async () => {
    await withTx(async (tx) => {
      const f = await ready(tx);
      const b = await company(tx, f.a, "مالكة القاعة ب");
      const d = await company(tx, f.a, "مالكة القاعة د");
      const roomB = await venue(tx, f.a, "قاعة ب", b);
      const roomB2 = await venue(tx, f.a, "قاعة ب الثانية", b);
      const roomD = await venue(tx, f.a, "قاعة د", d);

      const mixed = await completedSession(tx, f.a, roomB);
      await addDay(tx, f.a, mixed, 50, roomD);
      await addDay(tx, f.a, mixed, 74, roomB2);
      const sameOwner = await completedSession(tx, f.a, roomB);
      await addDay(tx, f.a, sameOwner, 50, roomB2);

      await evaluate(tx, mixed);
      await evaluate(tx, sameOwner);
      expect((await hostingRows(tx, mixed)).map((r) => r.company_id).sort()).toEqual([b, d].sort());
      expect((await hostingRows(tx, sameOwner)).map((r) => r.company_id)).toEqual([b]);
    });
  });

  it("hosting — the rule switched off awards nothing, whoever owns the room", async () => {
    await withTx(async (tx) => {
      const f = await ready(tx);
      const b = await company(tx, f.a, "شركة القاعة");
      const sessionId = await completedSession(tx, f.a, await venue(tx, f.a, "قاعة ب", b));
      await tx.q(`update public.company_scoring_rules set enabled = false where org_id = $1 and action_key = 'company_hosting'`, [f.a.id]);
      await evaluate(tx, sessionId);
      expect(await hostingRows(tx, sessionId)).toEqual([]);
    });
  });
});

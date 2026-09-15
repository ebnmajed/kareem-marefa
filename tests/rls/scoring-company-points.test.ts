// supabase/proposed/scoring/0001_company_points.sql — company-level points
// (post-launch, the owner's decision of 2026-09-15, docs/plan/notes/
// scoring.md "Company points rules"). Three creditable rules on top of the
// derived company leaderboard total: hosting, attendance share, presenting
// share, each evaluated once at session completion via
// public.evaluate_company_points().
//
// 03 §8.2 rows proven here: POL-company_scoring_rules.select, .update.admin,
// .catalogue, .shape, .history; POL-company_points_ledger.insert, .update,
// .select, .idempotency; POL-company_points_balances.select;
// RPC-evaluate_company_points.service_role_only, .hosting, .attendance_pct,
// .presenting_pct; RPC-audit_company_balances.service_role_only,
// .no_self_heal; RPC-rebuild_company_points_balances.reproduces;
// POL-sessions.host_company_same_org;
// RPC-snapshot_leaderboard.company_ledger_included.
//
// Applied inside the test's own rolled-back transaction (applyProposed,
// DEC-040) — nothing here touches the real migrations or the shared
// database. The base fixture (tests/rls/fixture.ts) puts every member of
// an org — admin, mod, members[0], members[1] — in the SAME company, which
// is exactly what the percentage rules' min_active_members=3 default
// needs without building extra fixture rows for most cases.
import { afterAll, describe, expect, it } from "vitest";
import { applyProposed, errorCode, PERMISSION_DENIED, pool, withTx } from "./db";
import { seed, type Org } from "./fixture";
import type { Tx } from "./db";

afterAll(() => pool.end());

async function ready(tx: Tx) {
  const f = await seed(tx);
  await tx.asOwner();
  await applyProposed(tx, "scoring/0001_company_points.sql");
  return f;
}

async function companyRuleId(tx: Tx, orgId: string, actionKey: string): Promise<string> {
  const [row] = await tx.q<{ id: string }>(`select id from public.company_scoring_rules where org_id = $1 and action_key = $2`, [orgId, actionKey]);
  return row.id;
}

/** A fresh completed session, its own venue/category from the org, ready
 * for evaluate_company_points(). host is optional. */
async function completedSession(tx: Tx, org: Org, hostCompanyId: string | null): Promise<string> {
  const [session] = await tx.q<{ id: string }>(
    `insert into public.sessions (org_id, title, abstract, category_id, level, starts_at, duration_minutes, ends_at,
                                   venue_id, capacity, state, published_at, completed_at, host_company_id)
     values ($1, 'جلسة نقاط الشركات', 'ملخص', $2, 'introductory',
             now() - interval '2 hours', 60, now() - interval '1 hour',
             $3, 40, 'completed', now() - interval '1 day', now() - interval '1 hour', $4)
     returning id`,
    [org.id, org.categoryId, org.venueId, hostCompanyId],
  );
  return session.id;
}

async function checkIn(tx: Tx, org: Org, sessionId: string, memberId: string) {
  await tx.q(
    `insert into public.check_ins (org_id, session_id, member_id, method, manual_reason, marked_by, session_window)
     values ($1, $2, $3, 'manual', 'اختبار', $4, 'empty'::tstzrange)`,
    [org.id, sessionId, memberId, org.admin.memberId],
  );
}

async function present(tx: Tx, org: Org, sessionId: string, memberId: string) {
  await tx.q(`insert into public.session_presenters (org_id, session_id, member_id, accepted) values ($1, $2, $3, true)`, [org.id, sessionId, memberId]);
}

describe("POL-company_scoring_rules", () => {
  it("select — any org member reads the catalogue; another org sees nothing of it", async () => {
    await withTx(async (tx) => {
      const f = await ready(tx);
      await tx.as(f.a.members[1].claims);
      const rows = await tx.q(`select action_key from public.company_scoring_rules where org_id = $1`, [f.a.id]);
      expect(rows).toHaveLength(3);

      await tx.as(f.b.admin.claims);
      expect(await tx.q(`select action_key from public.company_scoring_rules where org_id = $1`, [f.a.id])).toEqual([]);
    });
  });

  it("update.admin — an admin edits a value; a moderator is rejected", async () => {
    await withTx(async (tx) => {
      const f = await ready(tx);
      const ruleId = await companyRuleId(tx, f.a.id, "company_hosting");

      await tx.as(f.a.mod.claims);
      // RLS filters the row out of the moderator's UPDATE rather than raising
      // (scoring_rules' own test uses the same shape) — zero rows match, zero change.
      const asMod = await tx.q(`update public.company_scoring_rules set points = 200 where id = $1 returning id`, [ruleId]);
      expect(asMod).toEqual([]);

      await tx.as(f.a.admin.claims);
      await tx.q(`update public.company_scoring_rules set points = 200, enabled = false where id = $1`, [ruleId]);
      const [row] = await tx.q<{ points: number; enabled: boolean; version: number }>(
        `select points, enabled, version from public.company_scoring_rules where id = $1`,
        [ruleId],
      );
      expect(row).toMatchObject({ points: 200, enabled: false, version: 2 }); // REQ-PTS-004-equivalent: version bumps
    });
  });

  it("catalogue — an action_key outside the three is rejected", async () => {
    await withTx(async (tx) => {
      const f = await ready(tx);
      await tx.asOwner();
      expect(
        await errorCode(() =>
          tx.q(
            `insert into public.company_scoring_rules (org_id, action_key, points, reason_ar) values ($1, 'rsvp', 10, 'x')`,
            [f.a.id],
          ),
        ),
      ).toBe("23514");
    });
  });

  it("shape — a hosting row cannot carry a percent config and vice versa", async () => {
    await withTx(async (tx) => {
      const f = await ready(tx);
      await tx.asOwner();
      expect(
        await errorCode(() =>
          tx.q(
            `insert into public.company_scoring_rules (org_id, action_key, points, points_per_percent, cap_points, min_active_members, reason_ar)
             values ($1, 'company_hosting', 100, 1.0, 100, 3, 'x')`,
            [f.a.id],
          ),
        ),
      ).toBe("23514");
      const hostingRuleId = await companyRuleId(tx, f.a.id, "company_hosting");
      expect(await errorCode(() => tx.q(`update public.company_scoring_rules set points_per_percent = 1.0 where id = $1`, [hostingRuleId]))).toBe(
        "23514",
      );
    });
  });

  it("history — an edit appends to scoring_config_history with scope='company_scoring'", async () => {
    await withTx(async (tx) => {
      const f = await ready(tx);
      const ruleId = await companyRuleId(tx, f.a.id, "company_hosting");
      await tx.as(f.a.admin.claims);
      await tx.q(`update public.company_scoring_rules set points = 150 where id = $1`, [ruleId]);

      await tx.asOwner();
      const rows = await tx.q<{ field: string; new_value: number }>(
        `select field, new_value from public.scoring_config_history where org_id = $1 and scope = 'company_scoring' and entity_id = $2`,
        [f.a.id, ruleId],
      );
      expect(rows.some((r) => r.field === "points" && r.new_value === 150)).toBe(true);
    });
  });
});

describe("POL-sessions.host_company_same_org", () => {
  it("a session cannot be assigned a host company from another org", async () => {
    await withTx(async (tx) => {
      const f = await ready(tx);
      await tx.asOwner();
      expect(await errorCode(() => completedSession(tx, f.a, f.b.companyId))).toBe("23514");
    });
  });
});

describe("POL-company_points_ledger", () => {
  it("insert — direct insert is rejected for authenticated AND service_role", async () => {
    await withTx(async (tx) => {
      const f = await ready(tx);
      const insert = () =>
        tx.q(
          `insert into public.company_points_ledger (org_id, company_id, amount, source, reason, idempotency_key)
           values ($1, $2, 10, 'company_hosting', 'x', 'test:direct')`,
          [f.a.id, f.a.companyId],
        );
      await tx.as(f.a.admin.claims);
      expect(await errorCode(insert)).toBe(PERMISSION_DENIED);
      await tx.asServiceRole();
      expect(await errorCode(insert)).toBe(PERMISSION_DENIED);
    });
  });

  it("update/delete — raise for every client role including service_role", async () => {
    await withTx(async (tx) => {
      const f = await ready(tx);
      await tx.asOwner();
      const [row] = await tx.q<{ id: string }>(
        `insert into public.company_points_ledger (org_id, company_id, amount, source, reason, idempotency_key)
         values ($1, $2, 100, 'company_hosting', 'استضافة جلسة', 'test:cledger:1') returning id`,
        [f.a.id, f.a.companyId],
      );
      for (const become of [() => tx.as(f.a.admin.claims), () => tx.asServiceRole()] as const) {
        await become();
        expect(await errorCode(() => tx.q(`update public.company_points_ledger set amount = 1 where id = $1`, [row.id]))).toBe(PERMISSION_DENIED);
        expect(await errorCode(() => tx.q(`delete from public.company_points_ledger where id = $1`, [row.id]))).toBe(PERMISSION_DENIED);
      }
    });
  });

  it("select — org-wide read, no self-only restriction (a company has no session)", async () => {
    await withTx(async (tx) => {
      const f = await ready(tx);
      await tx.asOwner();
      await tx.q(
        `insert into public.company_points_ledger (org_id, company_id, amount, source, reason, idempotency_key)
         values ($1, $2, 100, 'company_hosting', 'x', 'test:cledger:2')`,
        [f.a.id, f.a.companyId],
      );
      await tx.as(f.a.members[1].claims); // an ordinary member, not the company's own concept of "self"
      expect(await tx.q(`select id from public.company_points_ledger where org_id = $1`, [f.a.id])).toHaveLength(1);
      await tx.as(f.b.admin.claims);
      expect(await tx.q(`select id from public.company_points_ledger where org_id = $1`, [f.a.id])).toEqual([]);
    });
  });
});

describe("RPC-evaluate_company_points", () => {
  it("service_role_only — no client role may call it", async () => {
    await withTx(async (tx) => {
      const f = await ready(tx);
      await tx.asOwner();
      const sessionId = await completedSession(tx, f.a, f.a.companyId);
      await tx.as(f.a.admin.claims);
      expect(await errorCode(() => tx.q(`select public.evaluate_company_points($1)`, [sessionId]))).toBe(PERMISSION_DENIED);
    });
  });

  it("hosting — awards exactly one company_hosting row, idempotent on replay", async () => {
    await withTx(async (tx) => {
      const f = await ready(tx);
      await tx.asOwner();
      const sessionId = await completedSession(tx, f.a, f.a.companyId);

      await tx.asServiceRole();
      await tx.q(`select public.evaluate_company_points($1)`, [sessionId]);
      await tx.q(`select public.evaluate_company_points($1)`, [sessionId]); // replay

      await tx.asOwner();
      const rows = await tx.q<{ amount: number; company_id: string }>(
        `select amount, company_id from public.company_points_ledger where org_id = $1 and source = 'company_hosting' and session_id = $2`,
        [f.a.id, sessionId],
      );
      expect(rows).toHaveLength(1); // no duplicate from the replay
      expect(rows[0]).toMatchObject({ amount: 100, company_id: f.a.companyId }); // the seeded default
    });
  });

  it("no host assigned — no company_hosting row", async () => {
    await withTx(async (tx) => {
      const f = await ready(tx);
      await tx.asOwner();
      const sessionId = await completedSession(tx, f.a, null);
      await tx.asServiceRole();
      await tx.q(`select public.evaluate_company_points($1)`, [sessionId]);
      await tx.asOwner();
      expect(await tx.q(`select id from public.company_points_ledger where session_id = $1 and source = 'company_hosting'`, [sessionId])).toEqual([]);
    });
  });

  it("attendance_pct — the company's own share of its active roster who checked in, capped, with meta", async () => {
    await withTx(async (tx) => {
      const f = await ready(tx);
      await tx.asOwner();
      const sessionId = await completedSession(tx, f.a, null);
      // Every base-fixture member of org A is in the same company (fixture.ts):
      // admin, mod, members[0], members[1] — 4 active members. All 4 check in: 100%.
      for (const memberId of [f.a.admin.memberId, f.a.mod.memberId, f.a.members[0].memberId, f.a.members[1].memberId]) {
        await checkIn(tx, f.a, sessionId, memberId);
      }

      await tx.asServiceRole();
      await tx.q(`select public.evaluate_company_points($1)`, [sessionId]);

      await tx.asOwner();
      const [row] = await tx.q<{ amount: number; meta: { attended: number; active_members: number; percent: number } }>(
        `select amount, meta from public.company_points_ledger where org_id = $1 and source = 'company_attendance_pct' and session_id = $2`,
        [f.a.id, sessionId],
      );
      // seeded default: 1.00 point per 1%, cap 100 — 100% attendance -> 100, capped at 100
      expect(row.amount).toBe(100);
      expect(row.meta).toMatchObject({ attended: 4, active_members: 4 });
      expect(Number(row.meta.percent)).toBe(100);
    });
  });

  it("presenting_pct — same shape, over accepted session_presenters only", async () => {
    await withTx(async (tx) => {
      const f = await ready(tx);
      await tx.asOwner();
      const sessionId = await completedSession(tx, f.a, null);
      await present(tx, f.a, sessionId, f.a.members[0].memberId); // 1 of 4 active members presents

      await tx.asServiceRole();
      await tx.q(`select public.evaluate_company_points($1)`, [sessionId]);

      await tx.asOwner();
      const [row] = await tx.q<{ amount: number; meta: { presenting: number; active_members: number } }>(
        `select amount, meta from public.company_points_ledger where org_id = $1 and source = 'company_presenting_pct' and session_id = $2`,
        [f.a.id, sessionId],
      );
      // seeded default: 2.00 points per 1% — 1/4 = 25% -> 50 points
      expect(row.amount).toBe(50);
      expect(row.meta).toMatchObject({ presenting: 1, active_members: 4 });
    });
  });

  it("min_active_members gates the two percent rules — a small company earns nothing from a 100% turnout", async () => {
    await withTx(async (tx) => {
      const f = await ready(tx);
      await tx.asOwner();
      const [smallCompany] = await tx.q<{ id: string }>(`insert into public.companies (org_id, name) values ($1, 'شركة صغيرة') returning id`, [f.a.id]);
      const [soloAuthUser] = await tx.q<{ id: string }>(
        `insert into auth.users (id, email, raw_user_meta_data) values (gen_random_uuid(), 'solo@kareem.example', '{}'::jsonb) returning id`,
      );
      const [soloMember] = await tx.q<{ id: string }>(
        `insert into public.members (org_id, auth_user_id, email, display_name, org_role, company_id)
         values ($1, $2, 'solo@kareem.example', 'منفرد', 'member', $3) returning id`,
        [f.a.id, soloAuthUser.id, smallCompany.id],
      );
      const sessionId = await completedSession(tx, f.a, null);
      await checkIn(tx, f.a, sessionId, soloMember.id); // 1 of 1 active member — 100%, but below min_active_members=3

      await tx.asServiceRole();
      await tx.q(`select public.evaluate_company_points($1)`, [sessionId]);

      await tx.asOwner();
      expect(
        await tx.q(`select id from public.company_points_ledger where session_id = $1 and company_id = $2`, [sessionId, smallCompany.id]),
      ).toEqual([]);
    });
  });
});

describe("ENT-company_points_balances rollup", () => {
  it("is a left fold over the ledger, and rebuild reproduces it exactly", async () => {
    await withTx(async (tx) => {
      const f = await ready(tx);
      await tx.asOwner();
      await tx.q(
        `insert into public.company_points_ledger (org_id, company_id, amount, source, reason, idempotency_key) values
           ($1, $2, 100, 'company_hosting', 'x', 'test:croll:1'),
           ($1, $2, 40,  'company_attendance_pct', 'x', 'test:croll:2')`,
        [f.a.id, f.a.companyId],
      );
      const [balance] = await tx.q<{ total_points: number }>(`select total_points from public.company_points_balances where company_id = $1`, [
        f.a.companyId,
      ]);
      expect(balance.total_points).toBe(140);

      await tx.q(`update public.company_points_balances set total_points = 1 where company_id = $1`, [f.a.companyId]);
      await tx.asServiceRole();
      await tx.q(`select public.rebuild_company_points_balances()`);
      await tx.asOwner();
      const [rebuilt] = await tx.q<{ total_points: number }>(`select total_points from public.company_points_balances where company_id = $1`, [
        f.a.companyId,
      ]);
      expect(rebuilt.total_points).toBe(140);

      await tx.asServiceRole();
      expect(await tx.q(`select company_id from public.audit_company_balances()`)).toEqual([]);
    });
  });

  it("audit_company_balances() reports a divergence and never self-heals", async () => {
    await withTx(async (tx) => {
      const f = await ready(tx);
      await tx.asOwner();
      await tx.q(
        `insert into public.company_points_ledger (org_id, company_id, amount, source, reason, idempotency_key)
         values ($1, $2, 100, 'company_hosting', 'x', 'test:croll:3')`,
        [f.a.id, f.a.companyId],
      );
      await tx.q(`update public.company_points_balances set total_points = 999 where company_id = $1`, [f.a.companyId]);

      await tx.asServiceRole();
      const rows = await tx.q<{ company_id: string; expected_total: number; actual_total: number }>(`select * from public.audit_company_balances()`);
      const mine = rows.find((r) => r.company_id === f.a.companyId);
      expect(mine).toMatchObject({ expected_total: 100, actual_total: 999 });

      await tx.asOwner();
      const [balance] = await tx.q<{ total_points: number }>(`select total_points from public.company_points_balances where company_id = $1`, [
        f.a.companyId,
      ]);
      expect(balance.total_points).toBe(999); // unchanged — never self-heals
    });
  });
});

describe("RPC-snapshot_leaderboard.company_ledger_included", () => {
  it("the company board's total is the member-derived sum plus the company ledger's sum, denominator unchanged", async () => {
    await withTx(async (tx) => {
      const f = await ready(tx);
      await tx.asOwner();
      // Member-derived points, same as before this migration. The M4 fixture
      // baseline (fixture-m4.ts) already carries a 10-point check_in row for
      // members[0] — and every base-fixture member of org A shares ONE
      // company (fixture.ts), so that 10 is already part of this company's
      // total before this test adds anything, regardless of which member
      // this insert targets. Accounted for in the expected total below,
      // not avoided — there is no member to pick that dodges a COMPANY
      // aggregate the way members[1] dodges a per-member one.
      await tx.q(
        `insert into public.points_ledger (org_id, member_id, amount, source, reason, idempotency_key)
         values ($1, $2, 30, 'check_in', 'x', 'test:snap:member')`,
        [f.a.id, f.a.members[1].memberId],
      );
      // Company ledger points, new in this migration.
      await tx.q(
        `insert into public.company_points_ledger (org_id, company_id, amount, source, reason, idempotency_key)
         values ($1, $2, 100, 'company_hosting', 'x', 'test:snap:company')`,
        [f.a.id, f.a.companyId],
      );

      await tx.asServiceRole();
      const [snapRow] = await tx.q<{ snapshot_leaderboard: string }>(
        `select public.snapshot_leaderboard($1, 'company', null, null, null, true)`,
        [f.a.id],
      );

      await tx.asOwner();
      const [entry] = await tx.q<{ points: number; points_per_active_member: number }>(
        `select points, points_per_active_member from public.leaderboard_entries
          where snapshot_id = $1 and company_id = $2`,
        [snapRow.snapshot_leaderboard, f.a.companyId],
      );
      // 10 (the M4 fixture baseline, members[0]) + 30 (this test's insert) +
      // 100 (company ledger) = 140, over 4 active members (05 §6.2's frozen
      // denominator — unchanged by this migration).
      expect(entry.points).toBe(140);
      expect(Number(entry.points_per_active_member)).toBeCloseTo(140 / 4, 5);
    });
  });
});

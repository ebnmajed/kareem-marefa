// platform — retention and anonymisation (migration `0073`, proposed as 0004).
// Applied with applyProposed() inside this test's transaction, rolled back.
//
// The case that matters is `RPC-anonymise_members.total`: `REQ-PRF-007`'s
// promise is not "no ledger row is deleted", it is that EVERY ORG-LEVEL TOTAL
// IS UNCHANGED. So the test sums the ledger per org before and after and
// asserts equality — a weaker check would pass a migration that renumbered.
//
// REQ-NFR-012 · REQ-PRF-007 · 11 §2.7 · 12 §5.3 · 12 §5.4

import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { applyProposed, errorCode, errorMessage, PERMISSION_DENIED, withTx, type Claims, type Tx } from "./db";
import { seed } from "./fixture";

const FILES = ["platform/0003_platform_library.sql", "platform/0004_retention_and_privacy.sql"];

async function apply(tx: Tx) {
  for (const file of FILES) {
    if (existsSync(join(process.cwd(), "supabase", "proposed", file))) await applyProposed(tx, file);
  }
}

function platformClaims(authUserId: string, email: string): Claims {
  return { sub: authUserId, email, platform_admin: true };
}

/** Every org's ledger total, as one map. The number REQ-PRF-007 protects. */
async function totalsByOrg(tx: Tx): Promise<Record<string, number>> {
  await tx.asOwner();
  const rows = await tx.q<{ org_id: string; total: string }>(
    `select org_id, coalesce(sum(amount), 0)::text as total from public.points_ledger group by org_id order by org_id`,
  );
  return Object.fromEntries(rows.map((r) => [r.org_id, Number(r.total)]));
}

describe("platform — enforce_retention (REQ-NFR-012, 12 §5.3)", () => {
  it("RPC-enforce_retention.periods — worker-only, and driven by the table", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await apply(tx);

      await tx.as(f.a.admin.claims);
      expect(await errorCode(() => tx.q(`select public.enforce_retention()`))).toBe(PERMISSION_DENIED);
      await tx.as(platformClaims(f.platformAdmin.authUserId, f.platformAdmin.email));
      expect(await errorCode(() => tx.q(`select public.enforce_retention()`))).toBe(PERMISSION_DENIED);

      await tx.asServiceRole();
      const [{ s }] = await tx.q<{ s: Record<string, number | string> }>(`select public.enforce_retention() as s`);
      // Every `delete` class in the table appears in the summary, and the
      // ledger's exemption is stated rather than silently absent.
      expect(Object.keys(s).sort()).toEqual(
        ["audit_log", "check_in_attempts", "data_export_archives", "email_deliveries", "points_ledger"].sort(),
      );
      expect(s.points_ledger).toBe("retained");
    });
  });

  it("RPC-enforce_retention — deletes by age, leaves the young alone, and never touches the ledger", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await apply(tx);
      await tx.asOwner();

      // One old check-in attempt and one from today.
      const oldRow = await tx.q<{ id: string }>(
        `insert into public.check_in_attempts (org_id, session_id, member_id, submitted_code, succeeded, attempted_at)
         select $1, s.id, $2, 'AAAAAA', false, now() - interval '200 days'
           from public.sessions s where s.org_id = $1 limit 1
         returning id`,
        [f.a.id, f.a.members[0].memberId],
      );
      await tx.q(
        `insert into public.check_in_attempts (org_id, session_id, member_id, submitted_code, succeeded, attempted_at)
         select $1, s.id, $2, 'BBBBBB', false, now()
           from public.sessions s where s.org_id = $1 limit 1`,
        [f.a.id, f.a.members[0].memberId],
      );
      const before = await totalsByOrg(tx);

      await tx.asServiceRole();
      await tx.q(`select public.enforce_retention()`);

      await tx.asOwner();
      expect(await tx.q(`select id from public.check_in_attempts where id = $1`, [oldRow[0].id])).toHaveLength(0);
      expect((await tx.q(`select id from public.check_in_attempts where org_id = $1`, [f.a.id])).length).toBeGreaterThan(0);
      // The ledger is never trimmed (12 §5.3, REQ-PTS-011).
      expect(await totalsByOrg(tx)).toEqual(before);
    });
  });

  it("RPC-enforce_retention.idempotent — a second run in the same window deletes nothing further", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await apply(tx);
      await tx.asOwner();
      await tx.q(
        `insert into public.check_in_attempts (org_id, session_id, member_id, submitted_code, succeeded, attempted_at)
         select $1, s.id, $2, 'AAAAAA', false, now() - interval '200 days'
           from public.sessions s where s.org_id = $1 limit 1`,
        [f.a.id, f.a.members[0].memberId],
      );
      await tx.asServiceRole();
      const first = (await tx.q<{ s: Record<string, number> }>(`select public.enforce_retention() as s`))[0].s;
      const second = (await tx.q<{ s: Record<string, number> }>(`select public.enforce_retention() as s`))[0].s;
      expect(first.check_in_attempts).toBe(1);
      expect(second.check_in_attempts).toBe(0);
    });
  });
});

describe("platform — anonymise_members (REQ-PRF-007, 12 §5.4)", () => {
  async function deactivate(tx: Tx, memberId: string, daysAgo: number) {
    await tx.asOwner();
    await tx.q(
      `update public.members
          set status = 'deactivated', deactivated_at = now() - make_interval(days => $2),
              deactivated_reason = 'غادر المؤسسة'
        where id = $1`,
      [memberId, daysAgo],
    );
  }

  it("★ RPC-anonymise_members.total — every org total is UNCHANGED and no ledger row is gone", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await apply(tx);
      const member = f.a.members[0];
      await deactivate(tx, member.memberId, 400);

      await tx.asOwner();
      const beforeTotals = await totalsByOrg(tx);
      const beforeRows = (await tx.q<{ n: string }>(`select count(*)::text as n from public.points_ledger`))[0].n;

      await tx.asServiceRole();
      const [{ s }] = await tx.q<{ s: { anonymised: number } }>(`select public.anonymise_members() as s`);
      expect(s.anonymised).toBe(1);

      await tx.asOwner();
      // ★ The promise REQ-PRF-007 actually makes.
      expect(await totalsByOrg(tx)).toEqual(beforeTotals);
      expect((await tx.q<{ n: string }>(`select count(*)::text as n from public.points_ledger`))[0].n).toBe(beforeRows);
      // The ledger still points at the same member row: the id IS the
      // pseudonymous key, so nothing had to be remapped.
      expect(
        (await tx.q(`select id from public.points_ledger where member_id = $1`, [member.memberId])).length,
      ).toBeGreaterThan(0);

      const [m] = await tx.q<{
        display_name: string | null;
        email: string;
        job_title: string | null;
        bio: string | null;
        anonymised_at: string | null;
      }>(`select display_name, email, job_title, bio, anonymised_at from public.members where id = $1`, [member.memberId]);
      expect(m.display_name).toBeNull();
      expect(m.job_title).toBeNull();
      expect(m.bio).toBeNull();
      expect(m.anonymised_at).not.toBeNull();
      expect(m.email).not.toBe(member.email);
      expect(m.email).toContain(member.memberId);

      // Content the member authored is still there — it is other people's
      // page, attributed «عضو سابق» at the DAL from `anonymised_at`.
      expect((await tx.q(`select id from public.comments where author_id = $1`, [member.memberId])).length).toBeGreaterThan(0);

      // The org's admin can read what happened, in their own log.
      await tx.as(f.a.admin.claims);
      expect(
        await tx.q(`select id from public.audit_log where org_id = $1 and action = 'member.anonymised'`, [f.a.id]),
      ).toHaveLength(1);
    });
  });

  it("RPC-anonymise_members.window — a member deactivated yesterday is left alone, and a replay is a no-op", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await apply(tx);
      await deactivate(tx, f.a.members[0].memberId, 1);

      await tx.asServiceRole();
      expect((await tx.q<{ s: { anonymised: number } }>(`select public.anonymise_members() as s`))[0].s.anonymised).toBe(0);

      await deactivate(tx, f.a.members[0].memberId, 400);
      await tx.asServiceRole();
      expect((await tx.q<{ s: { anonymised: number } }>(`select public.anonymise_members() as s`))[0].s.anonymised).toBe(1);
      expect((await tx.q<{ s: { anonymised: number } }>(`select public.anonymise_members() as s`))[0].s.anonymised).toBe(0);
    });
  });

  it("RPC-anonymise_members — worker-only", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await apply(tx);
      await tx.as(f.a.admin.claims);
      expect(await errorCode(() => tx.q(`select public.anonymise_members()`))).toBe(PERMISSION_DENIED);
      await tx.as(platformClaims(f.platformAdmin.authUserId, f.platformAdmin.email));
      expect(await errorCode(() => tx.q(`select public.anonymise_members()`))).toBe(PERMISSION_DENIED);
      await tx.asAnon();
      expect(await errorMessage(() => tx.q(`select public.anonymise_members()`))).toBeTruthy();
    });
  });
});

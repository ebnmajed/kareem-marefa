// Achievement certificates — REQ-CRT-012, REQ-CRT-008, REQ-LDR-006, D49,
// OQ-020. The two sources, and the one difference between them.
//
//   · a BADGE certificate is opt-in per badge (`badges.issues_certificate`,
//     off by default) and issues outright — awarding the badge was the
//     decision;
//   · a LEADERBOARD certificate goes to the top 3 of a FINAL member-ranked
//     snapshot, is issued from the frozen snapshot, and is HELD until an
//     admin releases it.
//
// Both hooks are `security definer set search_path = ''` and both are
// driven here by something other than the owner, which is 0063's lesson.
import { existsSync } from "node:fs";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { applyProposed, errorCode, PERMISSION_DENIED, pool, withTx, type Tx } from "./db";
import { seed } from "./fixture";

afterAll(() => pool.end());

const PROPOSED = ["designer/0008_achievement_certificates.sql"];

async function setup(tx: Tx) {
  const f = await seed(tx);
  for (const file of PROPOSED) {
    if (existsSync(join(process.cwd(), "supabase", "proposed", file))) await applyProposed(tx, file);
  }
  await tx.asOwner();
  for (const t of ["certificates", "certificate_serial_counters", "export_artifacts", "design_documents"]) {
    await tx.q(`delete from public.${t}`);
  }
  await tx.q(`delete from graphile_worker._private_jobs`);
  // An achievement template for both orgs to fall back on. The fixture's
  // certificate templates are `attendance` and `presenter`.
  const [tpl] = await tx.q<{ id: string }>(
    `insert into public.design_templates (org_id, scope, purpose, family, name)
     values (null, 'platform', 'certificate', 'achievement', 'قالب الإنجاز') returning id`,
  );
  await tx.q(
    `insert into public.design_template_versions (template_id, version, document, published_at)
     values ($1, 1, (select document from public.design_template_versions order by created_at limit 1), now())`,
    [tpl.id],
  );
  return f;
}

const certJobs = (tx: Tx) => tx.q<{ key: string }>(`select key from graphile_worker.jobs where task_identifier = 'issue_certificates' order by key`);

describe("POL-achievement.badge", () => {
  it("★ D49 / OQ-020: a badge issues NOTHING until it is opted in", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      const [badge] = await tx.q<{ id: string }>(`select id from public.badges where org_id = $1 and issues_certificate = false limit 1`, [f.a.id]);
      await tx.q(`delete from graphile_worker._private_jobs`);

      // Awarded through the admin's own RPC, so the hook fires as
      // `authenticated` and not as the owner.
      await tx.as(f.a.admin.claims);
      await tx.q(`select public.award_badge_manually($1, $2, $3)`, [f.a.members[0].memberId, badge.id, "أداء متميز"]);

      await tx.asOwner();
      expect(await certJobs(tx)).toEqual([]);
    });
  });

  it("★ opted in, the award enqueues one job keyed by the BADGE, and a re-award moves it", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      const [badge] = await tx.q<{ id: string }>(`select id from public.badges where org_id = $1 limit 1`, [f.a.id]);
      await tx.q(`update public.badges set issues_certificate = true where id = $1`, [badge.id]);
      await tx.q(`delete from public.member_badges where badge_id = $1`, [badge.id]);
      await tx.q(`delete from graphile_worker._private_jobs`);

      await tx.as(f.a.admin.claims);
      await tx.q(`select public.award_badge_manually($1, $2, $3)`, [f.a.members[0].memberId, badge.id, "أداء متميز"]);

      await tx.asOwner();
      // An achievement certificate has no session, so 11 §2.5's key takes
      // the SOURCE id in the session's slot.
      expect((await certJobs(tx)).map((j) => j.key)).toEqual([`cert:${badge.id}:${f.a.members[0].memberId}:achievement`]);
    });
  });

  it("issues outright — the award WAS the decision, so there is nothing to release", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      const [badge] = await tx.q<{ id: string }>(`select id from public.badges where org_id = $1 limit 1`, [f.a.id]);
      await tx.q(`update public.badges set issues_certificate = true where id = $1`, [badge.id]);

      await tx.asServiceRole();
      const [cert] = await tx.q<{ state: string; issued_at: string | null; serial: string; badge_id: string }>(
        `select state, issued_at, serial, badge_id from public.issue_achievement_certificate($1, $2)`,
        [f.a.members[0].memberId, badge.id],
      );
      expect(cert.state).toBe("issued");
      expect(cert.issued_at).not.toBeNull();
      expect(cert.badge_id).toBe(badge.id);

      // REQ-CRT-003's idempotence for this shape: a second call returns the
      // same row and burns no serial.
      const [again] = await tx.q<{ serial: string }>(`select serial from public.issue_achievement_certificate($1, $2)`, [
        f.a.members[0].memberId,
        badge.id,
      ]);
      expect(again.serial).toBe(cert.serial);
    });
  });

  it("a badge that does not opt in is refused even when the job asks directly", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      const [badge] = await tx.q<{ id: string }>(`select id from public.badges where org_id = $1 and issues_certificate = false limit 1`, [f.a.id]);
      await tx.asServiceRole();
      // The payload of a job is not an authority: the function re-derives
      // the opt-in rather than trusting that the hook checked it.
      expect(await errorCode(() => tx.q(`select public.issue_achievement_certificate($1, $2)`, [f.a.members[0].memberId, badge.id]))).toBe(
        PERMISSION_DENIED,
      );
    });
  });

  it("★ a badge from ANOTHER org cannot produce a certificate", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      const [badge] = await tx.q<{ id: string }>(`select id from public.badges where org_id = $1 limit 1`, [f.b.id]);
      await tx.q(`update public.badges set issues_certificate = true where id = $1`, [badge.id]);
      await tx.asServiceRole();
      expect(await errorCode(() => tx.q(`select public.issue_achievement_certificate($1, $2)`, [f.a.members[0].memberId, badge.id]))).toBe(
        PERMISSION_DENIED,
      );
    });
  });
});

describe("POL-achievement.snapshot", () => {
  /** A final member-ranked snapshot with four ranked members. */
  async function snapshot(tx: Tx, orgId: string, memberIds: string[], isFinal = true, kind = "monthly") {
    const [s] = await tx.q<{ id: string }>(
      `insert into public.leaderboard_snapshots (org_id, kind, period_start, period_end, active_member_count, is_final)
       values ($1, $2::public.leaderboard_kind, date '2026-08-01', date '2026-09-01', 10, $3) returning id`,
      [orgId, kind, isFinal],
    );
    // One statement, so the statement-level trigger sees the whole insert.
    await tx.q(
      `insert into public.leaderboard_entries (org_id, snapshot_id, member_id, rank, points)
       select $1, $2, m.id, m.ord, 100 - m.ord from unnest($3::uuid[]) with ordinality as m(id, ord)`,
      [orgId, s.id, memberIds],
    );
    return s.id;
  }

  it("★ REQ-CRT-012: the TOP 3 of a final snapshot, and nobody below", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      const ranked = [f.a.members[0].memberId, f.a.members[1].memberId, f.a.admin.memberId, f.a.mod.memberId];
      await tx.q(`delete from graphile_worker._private_jobs`);
      const snapshotId = await snapshot(tx, f.a.id, ranked);

      const keys = (await certJobs(tx)).map((j) => j.key);
      expect(keys).toHaveLength(3);
      expect(keys.sort()).toEqual(ranked.slice(0, 3).map((m) => `cert:${snapshotId}:${m}:achievement`).sort());
      expect(keys).not.toContain(`cert:${snapshotId}:${f.a.mod.memberId}:achievement`);
    });
  });

  it("★ a PROVISIONAL snapshot issues nothing — the freeze is the point (REQ-LDR-006)", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      await tx.q(`delete from graphile_worker._private_jobs`);
      await snapshot(tx, f.a.id, [f.a.members[0].memberId, f.a.members[1].memberId], false);
      expect(await certJobs(tx)).toEqual([]);
    });
  });

  it("a `topic` board issues nothing — it is neither of the two boards the requirement names", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      await tx.q(`delete from graphile_worker._private_jobs`);
      const [cat] = await tx.q<{ id: string }>(`select id from public.categories where org_id = $1 limit 1`, [f.a.id]);
      const [s] = await tx.q<{ id: string }>(
        `insert into public.leaderboard_snapshots (org_id, kind, period_start, period_end, category_id, active_member_count, is_final)
         values ($1, 'topic', date '2026-08-01', date '2026-09-01', $2, 10, true) returning id`,
        [f.a.id, cat.id],
      );
      await tx.q(`insert into public.leaderboard_entries (org_id, snapshot_id, member_id, rank, points) values ($1, $2, $3, 1, 50)`, [
        f.a.id,
        s.id,
        f.a.members[0].memberId,
      ]);
      expect(await certJobs(tx)).toEqual([]);
    });
  });

  it("★ a leaderboard certificate is HELD until an admin releases it", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      const snapshotId = await snapshot(tx, f.a.id, [f.a.members[0].memberId]);

      await tx.asServiceRole();
      const [cert] = await tx.q<{ id: string; state: string; issued_at: string | null; snapshot_id: string }>(
        `select id, state, issued_at, snapshot_id from public.issue_achievement_certificate($1, null, $2)`,
        [f.a.members[0].memberId, snapshotId],
      );
      expect(cert.state).toBe("held");
      expect(cert.issued_at).toBeNull();
      expect(cert.snapshot_id).toBe(snapshotId);

      // Invisible to its own recipient while held (REQ-CRT-004).
      await tx.as(f.a.members[0].claims);
      expect(await tx.q(`select id from public.certificates where id = $1`, [cert.id])).toEqual([]);

      await tx.as(f.a.admin.claims);
      const released = await tx.q<{ state: string }>(`select state from public.release_certificates($1::uuid[])`, [[cert.id]]);
      expect(released).toHaveLength(1);
      expect(released[0].state).toBe("issued");

      await tx.as(f.a.members[0].claims);
      expect(await tx.q(`select id from public.certificates where id = $1`, [cert.id])).toHaveLength(1);
    });
  });

  it("exactly one source: neither and both are refused", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      const [badge] = await tx.q<{ id: string }>(`select id from public.badges where org_id = $1 limit 1`, [f.a.id]);
      const snapshotId = await snapshot(tx, f.a.id, [f.a.members[0].memberId]);
      // `badges` is revoked from service_role too, so the fixture read above
      // stays as the owner and only the calls under test change identity.
      await tx.asServiceRole();
      expect(await errorCode(() => tx.q(`select public.issue_achievement_certificate($1)`, [f.a.members[0].memberId]))).toBe("22023");
      expect(
        await errorCode(() => tx.q(`select public.issue_achievement_certificate($1, $2, $3)`, [f.a.members[0].memberId, badge.id, snapshotId])),
      ).toBe("22023");
    });
  });

  it("issuing an achievement certificate is service_role only", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      const [badge] = await tx.q<{ id: string }>(`select id from public.badges where org_id = $1 limit 1`, [f.a.id]);
      for (const claims of [f.a.admin.claims, f.a.mod.claims, f.a.members[0].claims]) {
        await tx.as(claims);
        expect(await errorCode(() => tx.q(`select public.issue_achievement_certificate($1, $2)`, [f.a.members[0].memberId, badge.id]))).toBe(
          PERMISSION_DENIED,
        );
      }
    });
  });
});

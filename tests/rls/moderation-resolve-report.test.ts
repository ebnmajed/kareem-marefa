// REQ-UIX-103, REQ-UIX-104, REQ-ADM-010, REQ-ADM-023, REQ-EVT-014 — `resolve_report()`
// (supabase/proposed/content/0001_resolve_report.sql, DEC-231 §4.2, DEC-232 §4.5): one decision on reported content,
// in one transaction, closing every open report on that content. Every call is made AS A MEMBER, never as the owner.
// The function writes no audit row of its own — `report.resolved` is the lead's trigger — so these cases assert the
// rows 0059's triggers write and that nothing is written twice.
import { afterAll, describe, expect, it } from "vitest";
import { applyProposed, errorCode, pool, withTx, type Tx } from "./db";
import { seed } from "./fixture";

afterAll(() => pool.end());

const FILE = "content/0001_resolve_report.sql";

type Envelope = { outcome: string; target?: string; resolved?: number; resolution?: string };

async function setup(tx: Tx) {
  const f = await seed(tx);
  await applyProposed(tx, FILE);
  await tx.asOwner();
  return f;
}

async function report(tx: Tx, org: string, target: "comment" | "photo", id: string, reporter: string, reason = "محتوى غير لائق") {
  const column = target === "comment" ? "comment_id" : "photo_id";
  const [row] = await tx.q<{ id: string }>(
    `insert into public.reports (org_id, target, ${column}, reporter_id, reason) values ($1, $2, $3, $4, $5) returning id`,
    [org, target, id, reporter, reason],
  );
  return row.id;
}

async function resolve(tx: Tx, reportId: string, outcome: string, reason: string | null = null): Promise<Envelope> {
  const [row] = await tx.q<{ r: Envelope }>(`select public.resolve_report($1, $2, $3) as r`, [reportId, outcome, reason]);
  return row.r;
}

async function reportsOf(tx: Tx, ids: string[]) {
  await tx.asOwner();
  return tx.q<{ status: string; resolution: string | null; resolved_by: string | null }>(
    `select status, resolution, resolved_by from public.reports where id = any($1::uuid[]) order by id`,
    [ids],
  );
}

describe("resolve_report() — a comment", () => {
  it("an admin removes a visible comment: soft-deleted with the reason, EVERY open report on it closed, one comment.removed, the award reversed", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      const comment = f.m2.a.commentId;
      const r1 = await report(tx, f.a.id, "comment", comment, f.a.members[0].memberId);
      const r2 = await report(tx, f.a.id, "comment", comment, f.a.mod.memberId, "إساءة");
      const author = f.a.members[1]?.memberId ?? f.a.members[0].memberId;
      await tx.q(
        `insert into public.points_ledger (org_id, member_id, amount, source, source_id, session_id, reason, rule_key, idempotency_key)
         values ($1, $2, 2, 'comment', $3, $4, 'تعليق', 'comment', $5)`,
        [f.a.id, author, comment, f.m2.a.published, `test-comment-award-${comment}`],
      );

      await tx.as(f.a.admin.claims);
      expect(await resolve(tx, r1, "removed", "لغة غير لائقة")).toEqual({ outcome: "removed", target: "comment", resolved: 2 });

      await tx.asOwner();
      const [c] = await tx.q<{ deleted_at: string | null; deleted_by: string; removal_reason: string }>(
        `select deleted_at, deleted_by, removal_reason from public.comments where id = $1`,
        [comment],
      );
      expect(c.deleted_at).toBeTruthy();
      expect(c.deleted_by).toBe(f.a.admin.memberId);
      expect(c.removal_reason).toBe("لغة غير لائقة");

      const closed = await reportsOf(tx, [r1, r2]);
      expect(closed).toEqual([
        { status: "resolved", resolution: "removed", resolved_by: f.a.admin.memberId },
        { status: "resolved", resolution: "removed", resolved_by: f.a.admin.memberId },
      ]);

      const audit = await tx.q<{ reason: string; actor_id: string }>(
        `select reason, actor_id from public.audit_log where action = 'comment.removed' and subject_id = $1`,
        [comment],
      );
      expect(audit).toEqual([{ reason: "لغة غير لائقة", actor_id: f.a.admin.memberId }]);

      const reversal = await tx.q<{ amount: number }>(
        `select amount from public.points_ledger where source = 'reversal'
          and source_id in (select id from public.points_ledger where source = 'comment' and source_id = $1)`,
        [comment],
      );
      expect(reversal).toEqual([{ amount: -2 }]);
    });
  });

  it("a moderator may decide too (REQ-ADM-020)", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      const r = await report(tx, f.a.id, "comment", f.m2.a.commentId, f.a.members[0].memberId);
      await tx.as(f.a.mod.claims);
      expect((await resolve(tx, r, "removed", "سبب الإزالة")).outcome).toBe("removed");
      expect(await reportsOf(tx, [r])).toEqual([{ status: "resolved", resolution: "removed", resolved_by: f.a.mod.memberId }]);
    });
  });

  it("a member is refused, and nothing is written", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      const r = await report(tx, f.a.id, "comment", f.m2.a.commentId, f.a.members[0].memberId);
      await tx.as(f.a.members[0].claims);
      expect(await resolve(tx, r, "removed", "سبب الإزالة")).toEqual({ outcome: "not_authorized" });

      await tx.asOwner();
      expect((await tx.q(`select deleted_at from public.comments where id = $1`, [f.m2.a.commentId]))[0]).toEqual({ deleted_at: null });
      expect(await reportsOf(tx, [r])).toEqual([{ status: "open", resolution: null, resolved_by: null }]);
      expect(await tx.q(`select 1 from public.audit_log where subject_id = $1`, [f.m2.a.commentId])).toHaveLength(0);
    });
  });

  it("a visible comment is never removed without a reason of three characters or more", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      const r = await report(tx, f.a.id, "comment", f.m2.a.commentId, f.a.members[0].memberId);
      await tx.as(f.a.admin.claims);
      expect(await resolve(tx, r, "removed", null)).toEqual({ outcome: "reason_required" });
      expect(await resolve(tx, r, "removed", "  ab  ")).toEqual({ outcome: "reason_required" });

      await tx.asOwner();
      expect((await tx.q(`select deleted_at from public.comments where id = $1`, [f.m2.a.commentId]))[0]).toEqual({ deleted_at: null });
      expect(await reportsOf(tx, [r])).toEqual([{ status: "open", resolution: null, resolved_by: null }]);
    });
  });

  it("a comment its author already deleted: no reason owed, the author stays the deleter, no second comment.removed", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      const author = f.a.members[1] ?? f.a.members[0];
      const r = await report(tx, f.a.id, "comment", f.m2.a.commentId, f.a.mod.memberId);
      await tx.as(author.claims);
      await tx.q(`update public.comments set deleted_at = now() where id = $1`, [f.m2.a.commentId]);
      await tx.asOwner();
      const [before] = await tx.q<{ deleted_at: string }>(`select deleted_at::text from public.comments where id = $1`, [f.m2.a.commentId]);
      const auditBefore = (await tx.q(`select 1 from public.audit_log where action = 'comment.removed' and subject_id = $1`, [f.m2.a.commentId])).length;

      await tx.as(f.a.admin.claims);
      expect((await resolve(tx, r, "removed", null)).outcome).toBe("removed");

      await tx.asOwner();
      const [after] = await tx.q<{ deleted_at: string; deleted_by: string }>(
        `select deleted_at::text, deleted_by from public.comments where id = $1`,
        [f.m2.a.commentId],
      );
      expect(after).toEqual({ deleted_at: before.deleted_at, deleted_by: author.memberId });
      expect((await tx.q(`select 1 from public.audit_log where action = 'comment.removed' and subject_id = $1`, [f.m2.a.commentId])).length).toBe(auditBefore);
      expect(await reportsOf(tx, [r])).toEqual([{ status: "resolved", resolution: "removed", resolved_by: f.a.admin.memberId }]);
    });
  });

  it("a dismissal closes every open report on the comment and leaves the comment alone", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      const r1 = await report(tx, f.a.id, "comment", f.m2.a.commentId, f.a.members[0].memberId);
      const r2 = await report(tx, f.a.id, "comment", f.m2.a.commentId, f.a.mod.memberId);
      await tx.as(f.a.mod.claims);
      expect(await resolve(tx, r2, "dismissed")).toEqual({ outcome: "dismissed", target: "comment", resolved: 2 });

      await tx.asOwner();
      expect((await tx.q(`select deleted_at from public.comments where id = $1`, [f.m2.a.commentId]))[0]).toEqual({ deleted_at: null });
      expect((await reportsOf(tx, [r1, r2])).map((x) => x.resolution)).toEqual(["dismissed", "dismissed"]);
      expect(await tx.q(`select 1 from public.audit_log where action = 'comment.removed' and subject_id = $1`, [f.m2.a.commentId])).toHaveLength(0);
    });
  });

  it("an already-resolved report is a no-op that says so", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      const r = await report(tx, f.a.id, "comment", f.m2.a.commentId, f.a.members[0].memberId);
      await tx.as(f.a.admin.claims);
      await resolve(tx, r, "dismissed");
      expect(await resolve(tx, r, "removed", "سبب الإزالة")).toEqual({ outcome: "already_resolved", resolution: "dismissed" });
      await tx.asOwner();
      expect((await tx.q(`select deleted_at from public.comments where id = $1`, [f.m2.a.commentId]))[0]).toEqual({ deleted_at: null });
    });
  });

  it("another org's report is not found, and an outcome other than removed or dismissed is invalid", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      const theirs = await report(tx, f.b.id, "comment", f.m2.b.commentId, f.b.members[0].memberId);
      const ours = await report(tx, f.a.id, "comment", f.m2.a.commentId, f.a.members[0].memberId);
      await tx.as(f.a.admin.claims);
      expect(await resolve(tx, theirs, "removed", "سبب الإزالة")).toEqual({ outcome: "not_found" });
      expect(await resolve(tx, ours, "restored")).toEqual({ outcome: "invalid" });
      expect(await reportsOf(tx, [theirs])).toEqual([{ status: "open", resolution: null, resolved_by: null }]);
    });
  });

  it("★ one transaction: when resolving the report fails, the comment is NOT left removed", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      const r = await report(tx, f.a.id, "comment", f.m2.a.commentId, f.a.members[0].memberId);
      // A forced failure on the SECOND write — exactly where the old two DAL writes could part.
      await tx.q(`create function public._test_fail_report_update() returns trigger language plpgsql as $$
                  begin raise exception 'forced_failure'; end $$`);
      await tx.q(`create trigger _test_fail_report_update before update on public.reports
                  for each row execute function public._test_fail_report_update()`);

      await tx.as(f.a.admin.claims);
      expect(await errorCode(() => resolve(tx, r, "removed", "سبب الإزالة"))).not.toBeNull();

      await tx.asOwner();
      expect((await tx.q(`select deleted_at from public.comments where id = $1`, [f.m2.a.commentId]))[0]).toEqual({ deleted_at: null });
      expect(await tx.q(`select 1 from public.audit_log where action = 'comment.removed' and subject_id = $1`, [f.m2.a.commentId])).toHaveLength(0);
      expect(await reportsOf(tx, [r])).toEqual([{ status: "open", resolution: null, resolved_by: null }]);
    });
  });
});

describe("resolve_report() — a photo", () => {
  it("removing a reported photo removes and hides it, closes its open takedown and every open report, one photo.removed", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      const photo = f.m5.a.photoId;
      const r1 = await report(tx, f.a.id, "photo", photo, f.a.members[0].memberId);
      const r2 = await report(tx, f.a.id, "photo", photo, f.a.mod.memberId);
      const [{ id: takedown }] = await tx.q<{ id: string }>(
        `insert into public.photo_takedowns (org_id, photo_id, requester_id) values ($1, $2, $3) returning id`,
        [f.a.id, photo, f.a.members[0].memberId],
      );

      await tx.as(f.a.admin.claims);
      expect(await resolve(tx, r1, "removed", "تخالف السياسة")).toEqual({ outcome: "removed", target: "photo", resolved: 2 });

      await tx.asOwner();
      const [p] = await tx.q<{ removed_at: string | null; hidden_at: string | null; removal_reason: string }>(
        `select removed_at, hidden_at, removal_reason from public.photos where id = $1`,
        [photo],
      );
      expect(p.removed_at).toBeTruthy();
      expect(p.hidden_at).toBeTruthy();
      expect(p.removal_reason).toBe("تخالف السياسة");
      expect((await tx.q<{ resolution: string }>(`select resolution from public.photo_takedowns where id = $1`, [takedown]))[0].resolution).toBe("removed");
      expect((await reportsOf(tx, [r1, r2])).every((x) => x.status === "resolved" && x.resolution === "removed")).toBe(true);
      expect(
        await tx.q<{ actor_id: string }>(`select actor_id from public.audit_log where action = 'photo.removed' and subject_id = $1`, [photo]),
      ).toEqual([{ actor_id: f.a.admin.memberId }]);
    });
  });

  it("removing a photo needs a reason; dismissing a photo report leaves the photo visible", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      const photo = f.m5.a.photoId;
      const r = await report(tx, f.a.id, "photo", photo, f.a.members[0].memberId);
      await tx.as(f.a.mod.claims);
      expect(await resolve(tx, r, "removed", "")).toEqual({ outcome: "reason_required" });
      expect(await resolve(tx, r, "dismissed")).toEqual({ outcome: "dismissed", target: "photo", resolved: 1 });

      await tx.asOwner();
      expect((await tx.q(`select removed_at, hidden_at from public.photos where id = $1`, [photo]))[0]).toEqual({ removed_at: null, hidden_at: null });
      expect(await reportsOf(tx, [r])).toEqual([{ status: "resolved", resolution: "dismissed", resolved_by: f.a.mod.memberId }]);
    });
  });
});

describe("resolve_report() — the grant", () => {
  it("anon cannot execute it", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      const r = await report(tx, f.a.id, "comment", f.m2.a.commentId, f.a.members[0].memberId);
      await tx.asAnon();
      expect(await errorCode(() => resolve(tx, r, "dismissed"))).toBe("42501");
    });
  });
});

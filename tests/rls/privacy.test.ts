// platform — the member's own data (supabase/proposed/platform/0004).
// Applied with applyProposed() inside this test's transaction, rolled back.
//
// `REQ-PRF-006`'s first acceptance criterion is a NEGATIVE — "contains no other
// member's personal data, including in comment threads" — so the cases below
// build a thread between two members and then read the whole archive looking
// for the other one's address and id.
//
// ★ `members[0]` ALREADY HAS a ready export: `tests/rls/fixture-m7.ts` seeds one
// per org so the isolation sweep's P3 self read is non-vacuous. These cases
// therefore use `members[1]` as the caller, which is also what makes the
// rate-limit case honest — a member with no history.
//
// REQ-PRF-006 · REQ-PRF-007 · REQ-NFR-005 · REQ-NFR-013 · 11 §2.7

import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { applyProposed, errorCode, errorMessage, PERMISSION_DENIED, withTx, type Tx } from "./db";
import { seed } from "./fixture";

const FILES = ["platform/0003_platform_library.sql", "platform/0004_retention_and_privacy.sql"];

async function apply(tx: Tx) {
  for (const file of FILES) {
    if (existsSync(join(process.cwd(), "supabase", "proposed", file))) await applyProposed(tx, file);
  }
}

describe("platform — the data export (REQ-PRF-006, REQ-NFR-013)", () => {
  it("★ RPC-build_data_export_payload.self_only — no other member's personal data, thread included", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await apply(tx);
      const me = f.a.members[1];
      const other = f.a.members[0];

      // A thread: the OTHER member writes first, this member replies. That is
      // the one shape where someone else legitimately appears in the archive.
      await tx.asOwner();
      const [parent] = await tx.q<{ id: string }>(
        `insert into public.comments (org_id, session_id, author_id, body)
         select $1, s.id, $2, 'سؤال من عضو آخر' from public.sessions s where s.org_id = $1 limit 1
         returning id`,
        [f.a.id, other.memberId],
      );
      await tx.q(
        `insert into public.comments (org_id, session_id, author_id, parent_id, body)
         select $1, s.id, $2, $3, 'ردّي على السؤال' from public.sessions s where s.org_id = $1 limit 1`,
        [f.a.id, me.memberId, parent.id],
      );

      // A ledger row of their own, so "the archive is not vacuous" is a real
      // assertion: the fixture gives its ledger rows to members[0].
      await tx.q(
        `insert into public.points_ledger (org_id, member_id, amount, source, source_id, session_id, reason,
                                           rule_key, rule_version, idempotency_key, occurred_at)
         select $1::uuid, $2::uuid, 10, 'check_in', s.id, s.id, 'حضور الجلسة', 'check_in', 1, 'privacy-test:' || $2::text, now()
           from public.sessions s where s.org_id = $1 limit 1`,
        [f.a.id, me.memberId],
      );

      await tx.asServiceRole();
      const [{ payload }] = await tx.q<{ payload: Record<string, unknown> }>(
        `select public.build_data_export_payload($1) as payload`,
        [me.memberId],
      );

      // Everything REQ-PRF-006 names is present.
      expect(Object.keys(payload).sort()).toEqual(
        [
          "certificates",
          "check_ins",
          "comments",
          "generated_at",
          "interests",
          "member",
          "org",
          "photos",
          "points_ledger",
          "ratings_given",
          "rsvps",
        ].sort(),
      );
      expect((payload.member as { email: string }).email).toBe(me.email);

      // ★ The negative, checked against the WHOLE serialised archive rather
      // than one field: the other member's address and id appear nowhere.
      const serialised = JSON.stringify(payload);
      expect(serialised, "no other member's address").not.toContain(other.email);
      expect(serialised, "no other member's id").not.toContain(other.memberId);
      expect(serialised, "no other member's auth user").not.toContain(other.authUserId);
      // And the one thing that IS allowed: their display name on the parent.
      // (The member already has comments from the M2 fixture, so this finds
      // the reply rather than assuming it is the only one.)
      const comments = payload.comments as { body: string; in_reply_to: string | null }[];
      const reply = comments.find((c) => c.body === "ردّي على السؤال");
      expect(reply).toBeTruthy();
      // Their DISPLAY NAME, and nothing else about them.
      expect(reply!.in_reply_to).toBe("سارة العتيبي");
      // The member's own ledger is in it — the archive is not vacuous.
      expect((payload.points_ledger as unknown[]).length).toBeGreaterThan(0);
    });
  });

  it("RPC-build_data_export_payload — worker-only, and unknown members are refused", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await apply(tx);
      await tx.as(f.a.members[1].claims);
      expect(await errorCode(() => tx.q(`select public.build_data_export_payload($1)`, [f.a.members[1].memberId]))).toBe(
        PERMISSION_DENIED,
      );
      await tx.asServiceRole();
      expect(
        await errorMessage(() =>
          tx.q(`select public.build_data_export_payload('00000000-0000-0000-0000-000000000000'::uuid)`),
        ),
      ).toMatch(/member_not_found/);
    });
  });

  it("RPC-request_data_export.rate_limited — one per day, and an open request comes back unchanged", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await apply(tx);
      const me = f.a.members[1];

      await tx.as(me.claims);
      const [first] = await tx.q<{ id: string }>(`select * from public.request_data_export()`);
      // Still open: idempotent, not an error.
      const [again] = await tx.q<{ id: string }>(`select * from public.request_data_export()`);
      expect(again.id).toBe(first.id);

      // Completed, then asked again inside the window: REQ-NFR-005.
      await tx.asServiceRole();
      await tx.q(`select public.record_data_export($1, '{"member":{}}'::jsonb)`, [first.id]);
      await tx.as(me.claims);
      expect(await errorMessage(() => tx.q(`select * from public.request_data_export()`))).toMatch(/export_rate_limited/);

      // A day later it is allowed again.
      await tx.asOwner();
      await tx.q(`update public.data_export_requests set requested_at = now() - interval '25 hours' where id = $1`, [first.id]);
      await tx.as(me.claims);
      const [third] = await tx.q<{ id: string }>(`select * from public.request_data_export()`);
      expect(third.id).not.toBe(first.id);
    });
  });

  it("RPC-my_data_export.self — another member's request id returns NOTHING, never their archive", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await apply(tx);
      const me = f.a.members[1];
      // members[0]'s request is the fixture's, already ready — no need to make
      // a second one, and asking would be rate-limited anyway.
      const theirs = { id: f.a.dataExportRequestId };

      await tx.as(me.claims);
      const [mine] = await tx.q<{ id: string }>(`select * from public.request_data_export()`);

      // ★ Handed someone else's id it answers with NOTHING — not with their
      // archive, and not by silently substituting the caller's own, which
      // would hand back a different file than the one that was asked for.
      // Ownership is re-derived from the session and the id only narrows
      // within it (CLAUDE.md § Validation).
      const [probe] = await tx.q<{ id: string | null }>(`select * from public.my_data_export($1)`, [theirs.id]);
      expect(probe.id).toBeNull();
      // With no argument the caller gets their own latest, which is what the
      // Route Handler asks for.
      const [own] = await tx.q<{ id: string | null }>(`select * from public.my_data_export()`);
      expect(own.id).toBe(mine.id);

      // And the row itself is invisible across the RLS boundary.
      expect(await tx.q(`select id from public.data_export_requests where id = $1`, [theirs.id])).toHaveLength(0);
    });
  });

  it("RPC-record_data_export.worker — only the worker marks a request ready or failed", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await apply(tx);
      const me = f.a.members[1];
      await tx.as(me.claims);
      const [req] = await tx.q<{ id: string }>(`select * from public.request_data_export()`);

      expect(await errorCode(() => tx.q(`select public.record_data_export($1, '{}'::jsonb)`, [req.id]))).toBe(
        PERMISSION_DENIED,
      );
      expect(await errorCode(() => tx.q(`select public.fail_data_export($1, 'x')`, [req.id]))).toBe(PERMISSION_DENIED);

      await tx.asServiceRole();
      await tx.q(`select public.record_data_export($1, $2::jsonb)`, [req.id, JSON.stringify({ member: { id: me.memberId } })]);

      await tx.as(me.claims);
      const [ready] = await tx.q<{ status: string; byte_size: string; payload: unknown }>(
        `select status, byte_size::text, payload from public.data_export_requests where id = $1`,
        [req.id],
      );
      expect(ready.status).toBe("ready");
      expect(Number(ready.byte_size)).toBeGreaterThan(0);
      expect(ready.payload).not.toBeNull();
    });
  });

  it("the archive expires with the retention sweep — the row stays, the payload goes", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await apply(tx);
      const me = f.a.members[1];
      await tx.as(me.claims);
      const [req] = await tx.q<{ id: string }>(`select * from public.request_data_export()`);
      await tx.asServiceRole();
      await tx.q(`select public.record_data_export($1, '{"member":{}}'::jsonb)`, [req.id]);
      await tx.asOwner();
      await tx.q(`update public.data_export_requests set completed_at = now() - interval '10 days' where id = $1`, [req.id]);

      await tx.asServiceRole();
      await tx.q(`select public.enforce_retention()`);

      await tx.as(me.claims);
      const [after] = await tx.q<{ status: string; payload: unknown }>(
        `select status, payload from public.data_export_requests where id = $1`,
        [req.id],
      );
      // The record that a member asked survives; only the personal payload
      // goes (12 §5.3).
      expect(after.status).toBe("expired");
      expect(after.payload).toBeNull();
    });
  });
});

describe("platform — the deactivation request (REQ-PRF-007)", () => {
  it("a member asks, an admin reads it in the org's log, and nobody is deactivated by asking", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await apply(tx);
      const me = f.a.members[1];

      await tx.as(me.claims);
      expect(await errorCode(() => tx.q(`select public.request_deactivation('ok')`))).toBe("22023");
      await tx.q(`select public.request_deactivation($1)`, ["أغادر المؤسسة"]);

      await tx.asOwner();
      expect((await tx.q<{ status: string }>(`select status from public.members where id = $1`, [me.memberId]))[0].status).toBe(
        "active",
      );

      await tx.as(f.a.admin.claims);
      const rows = await tx.q<{ reason: string }>(
        `select reason from public.audit_log where org_id = $1 and action = 'member.deactivation_requested'`,
        [f.a.id],
      );
      expect(rows).toHaveLength(1);
      expect(rows[0].reason).toBe("أغادر المؤسسة");

      // Org B's admin sees nothing of it.
      await tx.as(f.b.admin.claims);
      expect(await tx.q(`select id from public.audit_log where action = 'member.deactivation_requested'`)).toHaveLength(0);
    });
  });
});

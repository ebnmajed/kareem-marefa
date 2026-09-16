// The reversal — REQ-CHK-017, DEC-141 — supabase/proposed/checkin/{01,04}.
// applyProposed() inside this test's rolled-back transaction (DEC-040).
// Needs 01 first: file 04's re-created check_in() references
// sessions.check_in_open, which 01 adds.
//
// `03` §8.2 rows: RPC-remove_check_in.{admin_only,reason_required,reversal,
// certificate_revoked,no_show_symmetry,not_found,readd},
// POL-check_ins.removed_excluded_from_overlap, POL-has_checked_in.excludes_removed,
// POL-ratings.write_self_excludes_removed.

import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { applyProposed, errorCode, errorMessage, PERMISSION_DENIED, pool, withTx, type Claims, type Tx } from "./db";
import { seed, type Org } from "./fixture";

afterAll(() => pool.end());

const PROPOSED = ["checkin/01_check_in_window.sql", "checkin/04_attendance_removal.sql"];

/** Org A's fixture only carries two plain members (sara, yaman) — a third,
 *  uninvolved bystander for the role-refusal case. */
async function addMember(tx: Tx, org: Org, local: string, name: string): Promise<{ memberId: string; claims: Claims }> {
  const email = `${local}@${org.domain}`;
  const authUserId = randomUUID();
  await tx.q(`insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, $3::jsonb)`, [authUserId, email, JSON.stringify({ full_name: name })]);
  const [row] = await tx.q<{ id: string; claims_version: number }>(
    `insert into public.members (org_id, auth_user_id, email, display_name, org_role, company_id) values ($1, $2, $3, $4, 'member', $5) returning id, claims_version`,
    [org.id, authUserId, email, name, org.companyId],
  );
  return {
    memberId: row.id,
    claims: { sub: authUserId, email, org_id: org.id, member_id: row.id, org_role: "member", status: "active", claims_version: row.claims_version, org_status: "active" },
  };
}

async function setup(tx: Tx) {
  const f = await seed(tx);
  await tx.asOwner();
  for (const file of PROPOSED) {
    if (existsSync(join(process.cwd(), "supabase", "proposed", file))) await applyProposed(tx, file);
  }
  return f;
}

async function makeSession(tx: Tx, org: Org, opts: { state: string; startsInMinutes: number; endsInMinutes: number }): Promise<string> {
  const [row] = await tx.q<{ id: string }>(
    `insert into public.sessions (org_id, title, abstract, category_id, level, starts_at, duration_minutes, ends_at,
                                   venue_id, capacity, state, published_at, completed_at, allow_walk_ins)
     values ($1, 'جلسة إلغاء تسجيل', 'ملخص', $2, 'introductory',
             now() + ($3 || ' minutes')::interval, 60, now() + ($4 || ' minutes')::interval,
             $5, 40, $6::public.session_state,
             case when $6 in ('published','in_progress','completed','archived') then now() - interval '1 day' end,
             case when $6 = 'completed' then now() - interval '1 hour' end,
             true)
     returning id`,
    [org.id, org.categoryId, String(opts.startsInMinutes), String(opts.endsInMinutes), org.venueId, opts.state],
  );
  return row.id;
}

type CheckInEnvelope = { status: string; check_in?: { id: string } };
async function checkIn(tx: Tx, sessionId: string, code: string): Promise<CheckInEnvelope> {
  const [row] = await tx.q<{ r: CheckInEnvelope }>(`select public.check_in($1, $2) as r`, [sessionId, code]);
  return row.r;
}

describe("RPC-remove_check_in.admin_only / .reason_required / .not_found", () => {
  it("a member, the presenter and a moderator are all refused; only an admin succeeds", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      await tx.asOwner();
      const sessionId = await makeSession(tx, f.a, { state: "in_progress", startsInMinutes: -10, endsInMinutes: 50 });
      await tx.q(`insert into public.session_presenters (org_id, session_id, member_id, accepted) values ($1, $2, $3, true)`, [f.a.id, sessionId, f.a.members[0].memberId]);
      const bystander = await addMember(tx, f.a, "bystander", "متفرج");
      const [code] = await tx.q<{ code: string }>(`select * from public.ensure_check_in_code($1)`, [sessionId]);
      await tx.as(f.a.members[1].claims);
      expect((await checkIn(tx, sessionId, code.code)).status).toBe("ok");

      await tx.as(bystander.claims);
      expect(await errorMessage(() => tx.q(`select * from public.remove_check_in($1, $2, $3)`, [sessionId, f.a.members[1].memberId, "سبب"]))).toMatch(/not_an_admin/);
      await tx.as(f.a.members[0].claims); // the presenter
      expect(await errorMessage(() => tx.q(`select * from public.remove_check_in($1, $2, $3)`, [sessionId, f.a.members[1].memberId, "سبب"]))).toMatch(/not_an_admin/);
      await tx.as(f.a.mod.claims);
      expect(await errorMessage(() => tx.q(`select * from public.remove_check_in($1, $2, $3)`, [sessionId, f.a.members[1].memberId, "سبب"]))).toMatch(/not_an_admin/);

      await tx.as(f.a.admin.claims);
      const [removed] = await tx.q<{ removed_at: string | null }>(`select * from public.remove_check_in($1, $2, $3)`, [sessionId, f.a.members[1].memberId, "لم يحضر فعليًا"]);
      expect(removed.removed_at).not.toBeNull();
    });
  });

  it("an empty reason is refused before anything is written", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      await tx.asOwner();
      const sessionId = await makeSession(tx, f.a, { state: "in_progress", startsInMinutes: -10, endsInMinutes: 50 });
      const [code] = await tx.q<{ code: string }>(`select * from public.ensure_check_in_code($1)`, [sessionId]);
      await tx.as(f.a.members[0].claims);
      await checkIn(tx, sessionId, code.code);

      await tx.as(f.a.admin.claims);
      expect(await errorMessage(() => tx.q(`select * from public.remove_check_in($1, $2, '')`, [sessionId, f.a.members[0].memberId]))).toMatch(/reason_required/);
    });
  });

  it("removing a member with no active check-in — never checked in, or already removed — is refused not_found", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      await tx.asOwner();
      const sessionId = await makeSession(tx, f.a, { state: "in_progress", startsInMinutes: -10, endsInMinutes: 50 });

      await tx.as(f.a.admin.claims);
      expect(await errorMessage(() => tx.q(`select * from public.remove_check_in($1, $2, $3)`, [sessionId, f.a.members[0].memberId, "سبب"]))).toMatch(/not_found/);

      await tx.asOwner();
      const [code] = await tx.q<{ code: string }>(`select * from public.ensure_check_in_code($1)`, [sessionId]);
      await tx.as(f.a.members[0].claims);
      await checkIn(tx, sessionId, code.code);
      await tx.as(f.a.admin.claims);
      await tx.q(`select * from public.remove_check_in($1, $2, $3)`, [sessionId, f.a.members[0].memberId, "سبب أول"]);
      // A second removal of the same, now-already-removed check-in.
      expect(await errorMessage(() => tx.q(`select * from public.remove_check_in($1, $2, $3)`, [sessionId, f.a.members[0].memberId, "سبب ثانٍ"]))).toMatch(/not_found/);
    });
  });
});

describe("RPC-remove_check_in.reversal", () => {
  it("reverses the points award with ONE compensating entry, reason «أُلغي تسجيل الحضور»; a second removal cannot double-reverse", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      await tx.asOwner();
      const sessionId = await makeSession(tx, f.a, { state: "in_progress", startsInMinutes: -10, endsInMinutes: 50 });
      const [code] = await tx.q<{ code: string }>(`select * from public.ensure_check_in_code($1)`, [sessionId]);
      await tx.as(f.a.members[0].claims);
      const outcome = await checkIn(tx, sessionId, code.code);
      const ciId = outcome.check_in!.id;

      // The award_points job is enqueued, not run inline (11 §2.3) — run it
      // directly, the same call the worker would make.
      await tx.asOwner();
      await tx.q(`select public.award_points('check_in', $1, 'check_in', $2, $3)`, [f.a.members[0].memberId, ciId, sessionId]);
      const [award] = await tx.q<{ id: string; amount: number }>(`select id, amount from public.points_ledger where source = 'check_in' and source_id = $1`, [ciId]);
      expect(award.amount).toBeGreaterThan(0);

      await tx.as(f.a.admin.claims);
      await tx.q(`select * from public.remove_check_in($1, $2, $3)`, [sessionId, f.a.members[0].memberId, "خطأ في تسجيل الحضور"]);

      await tx.asOwner();
      const reversal = await tx.q<{ amount: number; reason: string }>(`select amount, reason from public.points_ledger where source = 'reversal' and source_id = $1`, [award.id]);
      expect(reversal).toHaveLength(1);
      expect(reversal[0].amount).toBe(-award.amount);
      expect(reversal[0].reason).toBe("أُلغي تسجيل الحضور");

      // A late award_points job for this now-removed check-in skips silently.
      await tx.q(`select public.award_points('check_in', $1, 'check_in', $2, $3)`, [f.a.members[0].memberId, ciId, sessionId]);
      const stillOneAward = await tx.q(`select id from public.points_ledger where source = 'check_in' and source_id = $1`, [ciId]);
      expect(stillOneAward).toHaveLength(1); // the ORIGINAL award, never a second one
      const stillOneReversal = await tx.q(`select id from public.points_ledger where source = 'reversal' and source_id = $1`, [award.id]);
      expect(stillOneReversal).toHaveLength(1);
    });
  });
});

describe("RPC-remove_check_in.certificate_revoked", () => {
  it("revokes an issued attendance certificate through the existing audited path — the member never sees the admin's own words", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      await tx.asOwner();
      const sessionId = await makeSession(tx, f.a, { state: "in_progress", startsInMinutes: -10, endsInMinutes: 50 });
      await tx.q(`update public.sessions set certificate_mode = 'automatic' where id = $1`, [sessionId]);
      const [code] = await tx.q<{ code: string }>(`select * from public.ensure_check_in_code($1)`, [sessionId]);
      await tx.as(f.a.members[0].claims);
      const outcome = await checkIn(tx, sessionId, code.code);

      await tx.asServiceRole();
      const [cert] = await tx.q<{ id: string; state: string }>(
        `select * from public.issue_certificate($1, $2, 'attendance')`,
        [sessionId, f.a.members[0].memberId],
      );
      expect(cert.state).toBe("issued");

      await tx.as(f.a.admin.claims);
      await tx.q(`select * from public.remove_check_in($1, $2, $3)`, [sessionId, f.a.members[0].memberId, "لم يكن حاضرًا فعليًا — خطأ إداري محرج"]);

      await tx.asOwner();
      const [revoked] = await tx.q<{ state: string; revocation_reason: string }>(`select state, revocation_reason from public.certificates where id = $1`, [cert.id]);
      expect(revoked.state).toBe("revoked");
      expect(revoked.revocation_reason).toBe("أُلغي تسجيل الحضور"); // NOT the admin's own free text
      void outcome;
    });
  });
});

describe("RPC-remove_check_in.no_show_symmetry", () => {
  it("removing a confirmed-RSVP member's check-in awards no_show with evaluate_no_shows' own key shape", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      await tx.asOwner();
      const sessionId = await makeSession(tx, f.a, { state: "in_progress", startsInMinutes: -10, endsInMinutes: 50 });
      const [rsvp] = await tx.q<{ id: string }>(`insert into public.rsvps (org_id, session_id, member_id, status) values ($1, $2, $3, 'confirmed') returning id`, [f.a.id, sessionId, f.a.members[0].memberId]);
      const [code] = await tx.q<{ code: string }>(`select * from public.ensure_check_in_code($1)`, [sessionId]);
      await tx.as(f.a.members[0].claims);
      await checkIn(tx, sessionId, code.code);

      await tx.as(f.a.admin.claims);
      await tx.q(`select * from public.remove_check_in($1, $2, $3)`, [sessionId, f.a.members[0].memberId, "سبب"]);

      await tx.asOwner();
      const noShow = await tx.q(`select id from public.points_ledger where source = 'no_show' and source_id = $1`, [rsvp.id]);
      expect(noShow).toHaveLength(1);
    });
  });
});

describe("RPC-remove_check_in.readd — a fresh check-in after a removal needs no special path", () => {
  it("the same member can check in again with a fresh code, a brand new row, independent of the removed one", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      await tx.asOwner();
      const sessionId = await makeSession(tx, f.a, { state: "in_progress", startsInMinutes: -10, endsInMinutes: 50 });
      const [code] = await tx.q<{ code: string }>(`select * from public.ensure_check_in_code($1)`, [sessionId]);
      await tx.as(f.a.members[0].claims);
      const first = await checkIn(tx, sessionId, code.code);

      await tx.as(f.a.admin.claims);
      await tx.q(`select * from public.remove_check_in($1, $2, $3)`, [sessionId, f.a.members[0].memberId, "سبب"]);

      await tx.as(f.a.members[0].claims);
      const second = await checkIn(tx, sessionId, code.code);
      expect(second.status).toBe("ok");
      expect(second.check_in!.id).not.toBe(first.check_in!.id);

      await tx.asOwner();
      const rows = await tx.q(`select id, removed_at from public.check_ins where session_id = $1 and member_id = $2 order by created_at`, [sessionId, f.a.members[0].memberId]);
      expect(rows).toHaveLength(2); // the removed original, plus the fresh one
    });
  });

  it("a manual mark works the same way after a removal", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      await tx.asOwner();
      const sessionId = await makeSession(tx, f.a, { state: "in_progress", startsInMinutes: -10, endsInMinutes: 50 });
      const [code] = await tx.q<{ code: string }>(`select * from public.ensure_check_in_code($1)`, [sessionId]);
      await tx.as(f.a.members[0].claims);
      await checkIn(tx, sessionId, code.code);

      await tx.as(f.a.admin.claims);
      await tx.q(`select * from public.remove_check_in($1, $2, $3)`, [sessionId, f.a.members[0].memberId, "سبب"]);
      const [manual] = await tx.q<{ method: string; removed_at: string | null }>(`select * from public.mark_checked_in_manually($1, $2, $3)`, [sessionId, f.a.members[0].memberId, "أُعيد يدويًا"]);
      expect(manual.method).toBe("manual");
      expect(manual.removed_at).toBeNull();
    });
  });
});

describe("POL-check_ins.removed_excluded_from_overlap — REQ-CHK-013", () => {
  it("a removed check-in no longer blocks an overlapping session", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      await tx.asOwner();
      const sessionA = await makeSession(tx, f.a, { state: "in_progress", startsInMinutes: -30, endsInMinutes: 30 });
      const sessionB = await makeSession(tx, f.a, { state: "in_progress", startsInMinutes: -10, endsInMinutes: 50 }); // overlaps A
      const [codeA] = await tx.q<{ code: string }>(`select * from public.ensure_check_in_code($1)`, [sessionA]);
      const [codeB] = await tx.q<{ code: string }>(`select * from public.ensure_check_in_code($1)`, [sessionB]);

      await tx.as(f.a.members[0].claims);
      expect((await checkIn(tx, sessionA, codeA.code)).status).toBe("ok");
      expect((await checkIn(tx, sessionB, codeB.code)).status).toBe("overlap");

      await tx.as(f.a.admin.claims);
      await tx.q(`select * from public.remove_check_in($1, $2, $3)`, [sessionA, f.a.members[0].memberId, "سبب"]);

      await tx.as(f.a.members[0].claims);
      expect((await checkIn(tx, sessionB, codeB.code)).status).toBe("ok"); // no longer blocked
    });
  });
});

describe("POL-has_checked_in.excludes_removed", () => {
  it("has_checked_in() returns false once the check-in is removed", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      await tx.asOwner();
      const sessionId = await makeSession(tx, f.a, { state: "in_progress", startsInMinutes: -10, endsInMinutes: 50 });
      const [code] = await tx.q<{ code: string }>(`select * from public.ensure_check_in_code($1)`, [sessionId]);
      await tx.as(f.a.members[0].claims);
      await checkIn(tx, sessionId, code.code);
      const [before] = await tx.q<{ has_checked_in: boolean }>(`select public.has_checked_in($1) as has_checked_in`, [sessionId]);
      expect(before.has_checked_in).toBe(true);

      await tx.as(f.a.admin.claims);
      await tx.q(`select * from public.remove_check_in($1, $2, $3)`, [sessionId, f.a.members[0].memberId, "سبب"]);

      await tx.as(f.a.members[0].claims);
      const [after] = await tx.q<{ has_checked_in: boolean }>(`select public.has_checked_in($1) as has_checked_in`, [sessionId]);
      expect(after.has_checked_in).toBe(false);
    });
  });
});

describe("POL-ratings.write_self_excludes_removed", () => {
  it("a rating insert whose check_in_id points at a removed check-in is refused, same as no check-in at all", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      await tx.asOwner();
      const sessionId = await makeSession(tx, f.a, { state: "in_progress", startsInMinutes: -70, endsInMinutes: -10 });
      const [code] = await tx.q<{ code: string }>(`select * from public.ensure_check_in_code($1)`, [sessionId]);
      await tx.as(f.a.members[0].claims);
      const outcome = await checkIn(tx, sessionId, code.code);

      await tx.asOwner();
      await tx.q(`update public.sessions set state = 'completed', completed_at = now() where id = $1`, [sessionId]);

      await tx.as(f.a.admin.claims);
      await tx.q(`select * from public.remove_check_in($1, $2, $3)`, [sessionId, f.a.members[0].memberId, "سبب"]);

      await tx.as(f.a.members[0].claims);
      expect(
        await errorCode(() =>
          tx.q(
            `insert into public.ratings (org_id, session_id, member_id, check_in_id, session_stars, presenter_stars) values ($1, $2, $3, $4, 5, 5)`,
            [f.a.id, sessionId, f.a.members[0].memberId, outcome.check_in!.id],
          ),
        ),
      ).toBe(PERMISSION_DENIED);
    });
  });
});

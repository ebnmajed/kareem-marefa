// Check-in: check-in codes and check_in() (03 §5.4, STORY-CHK-001..006,
// supabase/proposed/checkin/02_check_in.sql, DEC-015).
//
// `03` §8.2 rows: POL-check_in_codes.select.member, POL-check_in_codes.select.presenter,
// POL-check_ins.insert.rpc, POL-check_ins.rate_limit, POL-check_ins.window,
// POL-check_ins.revoked, POL-check_ins.single_use, POL-check_ins.overlap,
// POL-check_ins.presenter, POL-check_ins.select.member, POL-check_in_attempts.select.staff.

import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { errorCode, errorMessage, PERMISSION_DENIED, pool, type Claims, type Tx, withTx } from "./db";
import { seed, type Org } from "./fixture";

afterAll(() => pool.end());

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

/** A session in a chosen state, with explicit start/end, for check-in-window tests. */
// `allowWalkIns` defaults to TRUE here: the cases below check in without a
// reservation on purpose (they drill the code, the window, the rate limit).
// The door policy (DEC-065, 0079) has its own describe block further down.
async function makeSession(tx: Tx, org: Org, opts: { state: string; startsInMinutes: number; endsInMinutes: number; allowWalkIns?: boolean }): Promise<string> {
  const [row] = await tx.q<{ id: string }>(
    `insert into public.sessions (org_id, title, abstract, category_id, level, starts_at, duration_minutes, ends_at,
                                   venue_id, capacity, state, published_at, completed_at, allow_walk_ins)
     values ($1, 'جلسة حضور', 'ملخص', $2, 'introductory',
             now() + ($3 || ' minutes')::interval, 60, now() + ($4 || ' minutes')::interval,
             $5, 40, $6::public.session_state,
             case when $6 in ('published','in_progress','completed','archived') then now() - interval '1 day' end,
             case when $6 = 'completed' then now() - interval '1 hour' end,
             $7)
     returning id`,
    [org.id, org.categoryId, String(opts.startsInMinutes), String(opts.endsInMinutes), org.venueId, opts.state, opts.allowWalkIns ?? true],
  );
  return row.id;
}

async function addPresenter(tx: Tx, org: Org, sessionId: string, memberId: string) {
  await tx.q(`insert into public.session_presenters (org_id, session_id, member_id, accepted) values ($1, $2, $3, true)`, [org.id, sessionId, memberId]);
}

// check_in() returns a JSON envelope, not a raised exception, for every
// outcome downstream of the attempt-log insert (see 02_check_in.sql's
// header) — a single call helper keeps every test site consistent.
type CheckInEnvelope = {
  status: string;
  check_in?: { id: string; method: string; manual_reason: string | null; marked_by: string | null; arrived_at: string };
  conflict_session_id?: string;
};
async function checkIn(tx: Tx, sessionId: string, code: string): Promise<CheckInEnvelope> {
  const [row] = await tx.q<{ r: CheckInEnvelope }>(`select public.check_in($1, $2) as r`, [sessionId, code]);
  return row.r;
}

describe("DEC-065 — walk-ins are a per-session switch staff turn on (0079)", () => {
  it("★ RPC-check_in.reservation_required — off: a member with no confirmed reservation is refused without learning about the code; on: the same member checks in", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await tx.asOwner();
      const sessionId = await makeSession(tx, f.a, { state: "in_progress", startsInMinutes: -10, endsInMinutes: 50, allowWalkIns: false });
      await addPresenter(tx, f.a, sessionId, f.a.members[0].memberId);
      await tx.as(f.a.members[0].claims);
      const [code] = await tx.q<{ code: string }>(`select * from public.ensure_check_in_code($1)`, [sessionId]);

      // No reservation, a WRONG code: reservation_required, not invalid_code — the policy answers first.
      await tx.as(f.a.members[1].claims);
      expect((await checkIn(tx, sessionId, "AAAAAA")).status).toBe("reservation_required");
      // No reservation, the RIGHT code: still refused, and the attempts were recorded (DEC-015).
      expect((await checkIn(tx, sessionId, code.code)).status).toBe("reservation_required");
      await tx.asOwner();
      const [attempts] = await tx.q<{ n: string }>(`select count(*) as n from public.check_in_attempts where session_id = $1 and member_id = $2`, [sessionId, f.a.members[1].memberId]);
      expect(Number(attempts.n)).toBe(2);

      // A confirmed reservation opens the door with the policy still off.
      await tx.q(`insert into public.rsvps (org_id, session_id, member_id, status) values ($1, $2, $3, 'confirmed')`, [f.a.id, sessionId, f.a.members[1].memberId]);
      await tx.as(f.a.members[1].claims);
      expect((await checkIn(tx, sessionId, code.code)).status).toBe("ok");

      // A second member with no reservation: refused while off, admitted once the session allows walk-ins.
      // Since 0085 (DEC-118) the only door is schedule_session(), covered by
      // checkin-walk-ins-publishing.test.ts — here the flag is arranged directly, because
      // this case is check_in()'s gate, not who may set it.
      await tx.asOwner();
      const walkIn = await addMember(tx, f.a, "walk-in", "زائر بلا حجز");
      await tx.as(walkIn.claims);
      expect((await checkIn(tx, sessionId, code.code)).status).toBe("reservation_required");
      await tx.asOwner();
      await tx.q(`update public.sessions set allow_walk_ins = true where id = $1`, [sessionId]);
      await tx.as(walkIn.claims);
      expect((await checkIn(tx, sessionId, code.code)).status).toBe("ok");
    });
  });
  // RPC-set_session_walk_ins.staff retired with the function (0085, DEC-118) —
  // see RPC-set_session_walk_ins.retired in checkin-walk-ins-publishing.test.ts.
});

// RPC-ensure_check_in_code.only_live (0078) is superseded by .floor_ceiling (0084, DEC-141):
// the code follows the clock window, not the state — checkin-window.test.ts.

describe("POL-check_in_codes.select.member and .select.presenter — ensure_check_in_code authorization", () => {
  it("a member cannot read the current code, including a checked-in member; the presenter and staff can", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await tx.asOwner();
      const sessionId = await makeSession(tx, f.a, { state: "in_progress", startsInMinutes: -10, endsInMinutes: 50 });
      await addPresenter(tx, f.a, sessionId, f.a.members[0].memberId);

      // A plain member cannot mint/read the code.
      await tx.as(f.a.members[1].claims);
      expect(await errorMessage(() => tx.q(`select * from public.ensure_check_in_code($1)`, [sessionId]))).toMatch(/not_authorized/);

      // The presenter can.
      await tx.as(f.a.members[0].claims);
      const [code] = await tx.q<{ code: string }>(`select * from public.ensure_check_in_code($1)`, [sessionId]);
      expect(code.code).toMatch(/^[ACDEFGHJKMNPQRTUVWXY34679]{6}$/);

      // Staff can too.
      await tx.as(f.a.mod.claims);
      const [asStaff] = await tx.q<{ code: string }>(`select * from public.ensure_check_in_code($1)`, [sessionId]);
      expect(asStaff.code).toBe(code.code); // still the current window — idempotent

      // Now the member checks in with that code, then still cannot read it (OQ-013).
      await tx.as(f.a.members[1].claims);
      const checkedIn = await checkIn(tx, sessionId, code.code);
      expect(checkedIn.status).toBe("ok");
      expect(await errorMessage(() => tx.q(`select * from public.ensure_check_in_code($1)`, [sessionId]))).toMatch(/not_authorized/);

      // A presenter of a DIFFERENT session cannot read this one's code.
      await tx.asOwner();
      const otherSession = await makeSession(tx, f.a, { state: "in_progress", startsInMinutes: -10, endsInMinutes: 50 });
      const otherPresenter = await addMember(tx, f.a, "other-presenter", "مقدّم آخر");
      await addPresenter(tx, f.a, otherSession, otherPresenter.memberId);
      await tx.as(otherPresenter.claims);
      expect(await errorMessage(() => tx.q(`select * from public.ensure_check_in_code($1)`, [sessionId]))).toMatch(/not_authorized/);
    });
  });

  it("rotate_check_in_code (service_role) needs no identity and reuses the current window", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await tx.asOwner();
      const sessionId = await makeSession(tx, f.a, { state: "in_progress", startsInMinutes: -10, endsInMinutes: 50 });

      // authenticated cannot call the worker-only path at all.
      await tx.as(f.a.admin.claims);
      expect(await errorCode(() => tx.q(`select * from public.rotate_check_in_code($1)`, [sessionId]))).toBe(PERMISSION_DENIED);

      await tx.asServiceRole();
      const [first] = await tx.q<{ code: string }>(`select * from public.rotate_check_in_code($1)`, [sessionId]);
      const [second] = await tx.q<{ code: string }>(`select * from public.rotate_check_in_code($1)`, [sessionId]);
      expect(second.code).toBe(first.code); // same rotation window — idempotent
    });
  });
});

describe("POL-check_ins.insert.rpc", () => {
  it("direct insert into check_ins is rejected for every role", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await tx.asOwner();
      const sessionId = await makeSession(tx, f.a, { state: "in_progress", startsInMinutes: -10, endsInMinutes: 50 });

      await tx.as(f.a.members[0].claims);
      expect(
        await errorCode(() =>
          tx.q(`insert into public.check_ins (org_id, session_id, member_id, method, session_window) values ($1, $2, $3, 'code', 'empty'::tstzrange)`, [f.a.id, sessionId, f.a.members[0].memberId]),
        ),
      ).toBe(PERMISSION_DENIED);

      await tx.as(f.a.admin.claims);
      expect(
        await errorCode(() =>
          tx.q(`insert into public.check_ins (org_id, session_id, member_id, method, session_window) values ($1, $2, $3, 'manual', 'empty'::tstzrange)`, [f.a.id, sessionId, f.a.admin.memberId]),
        ),
      ).toBe(PERMISSION_DENIED);
    });
  });
});

describe("POL-check_ins.rate_limit", () => {
  it("the 11th attempt in 10 minutes raises rate_limited, and every attempt is recorded — the row is written before the limit check", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await tx.asOwner();
      const sessionId = await makeSession(tx, f.a, { state: "in_progress", startsInMinutes: -10, endsInMinutes: 50 });
      const member = f.a.members[0];

      await tx.as(member.claims);
      for (let i = 0; i < 10; i++) {
        const r = await checkIn(tx, sessionId, "ZZZZZZ");
        expect(r.status).toBe("invalid_code");
      }
      const limited = await checkIn(tx, sessionId, "ZZZZZZ");
      expect(limited.status).toBe("rate_limited");

      await tx.asOwner();
      const attempts = await tx.q(`select succeeded from public.check_in_attempts where session_id = $1 and member_id = $2`, [sessionId, member.memberId]);
      expect(attempts.length).toBe(11); // the rate-limited attempt is STILL recorded
      expect(attempts.every((a) => a.succeeded === false)).toBe(true);
    });
  });
});

describe("POL-check_ins.window", () => {
  it("a code entered before the session starts is rejected as not_started, without revealing whether the code was right", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await tx.asOwner();
      const sessionId = await makeSession(tx, f.a, { state: "published", startsInMinutes: 30, endsInMinutes: 90 });

      await tx.as(f.a.members[0].claims);
      const r = await checkIn(tx, sessionId, "WHATEVER");
      expect(r.status).toBe("not_started");
    });
  });

  it("a code entered after the two-hour ceiling is rejected as session_ended (DEC-141)", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await tx.asOwner();
      // ends_at + 2 h is the ceiling (0084); inside it a completed session still takes a code.
      const sessionId = await makeSession(tx, f.a, { state: "completed", startsInMinutes: -240, endsInMinutes: -180 });

      await tx.as(f.a.members[0].claims);
      const r = await checkIn(tx, sessionId, "WHATEVER");
      expect(r.status).toBe("session_ended");
    });
  });
});

describe("POL-check_ins.revoked", () => {
  it("a revoked code is rejected; check-ins already recorded with it stand", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await tx.asOwner();
      const sessionId = await makeSession(tx, f.a, { state: "in_progress", startsInMinutes: -10, endsInMinutes: 50 });
      await addPresenter(tx, f.a, sessionId, f.a.members[0].memberId);

      await tx.as(f.a.members[0].claims);
      const [code] = await tx.q<{ code: string }>(`select * from public.ensure_check_in_code($1)`, [sessionId]);

      await tx.asOwner();
      const early = await addMember(tx, f.a, "early-bird", "حاضر مبكر");
      await tx.as(early.claims);
      const first = await checkIn(tx, sessionId, code.code);
      expect(first.status).toBe("ok");
      const ciId = first.check_in!.id;

      await tx.as(f.a.members[0].claims);
      const [reissued] = await tx.q<{ code: string; revoked_at: string | null }>(`select * from public.revoke_check_in_code($1)`, [sessionId]);
      // revoke_check_in_code returns the FRESH code — a different, non-revoked one.
      expect(reissued.code).not.toBe(code.code);
      expect(reissued.revoked_at).toBeNull();

      await tx.asOwner();
      const [oldCode] = await tx.q<{ revoked_at: string | null }>(`select revoked_at from public.check_in_codes where code = $1 and session_id = $2`, [code.code, sessionId]);
      expect(oldCode.revoked_at).not.toBeNull();

      const late = await addMember(tx, f.a, "late-bird", "حاضر متأخر");
      await tx.as(late.claims);
      const rejected = await checkIn(tx, sessionId, code.code);
      expect(rejected.status).toBe("invalid_code");

      await tx.asOwner();
      const stillThere = await tx.q(`select id from public.check_ins where id = $1`, [ciId]);
      expect(stillThere.length).toBe(1);
    });
  });
});

describe("POL-check_ins.single_use", () => {
  it("a second check-in attempt is a no-op that returns the existing check-in", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await tx.asOwner();
      const sessionId = await makeSession(tx, f.a, { state: "in_progress", startsInMinutes: -10, endsInMinutes: 50 });
      await addPresenter(tx, f.a, sessionId, f.a.members[0].memberId);
      await tx.as(f.a.members[0].claims);
      const [code] = await tx.q<{ code: string }>(`select * from public.ensure_check_in_code($1)`, [sessionId]);

      await tx.as(f.a.members[1].claims);
      const first = await checkIn(tx, sessionId, code.code);
      const second = await checkIn(tx, sessionId, code.code);
      expect(first.status).toBe("ok");
      expect(second.status).toBe("already_checked_in"); // 09 SCR-014 — a distinct state, not a duplicate "success"
      expect(second.check_in!.id).toBe(first.check_in!.id);

      await tx.asOwner();
      const rows = await tx.q(`select id from public.check_ins where session_id = $1 and member_id = $2`, [sessionId, f.a.members[1].memberId]);
      expect(rows.length).toBe(1);
    });
  });
});

describe("POL-check_ins.overlap", () => {
  it("checking in to an overlapping session raises on the exclusion constraint, naming the conflicting session", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await tx.asOwner();
      const sessionA = await makeSession(tx, f.a, { state: "in_progress", startsInMinutes: -30, endsInMinutes: 30 });
      const sessionB = await makeSession(tx, f.a, { state: "in_progress", startsInMinutes: -10, endsInMinutes: 50 }); // overlaps A
      await addPresenter(tx, f.a, sessionA, f.a.members[0].memberId);
      await addPresenter(tx, f.a, sessionB, f.a.members[0].memberId);

      await tx.as(f.a.members[0].claims);
      const [codeA] = await tx.q<{ code: string }>(`select * from public.ensure_check_in_code($1)`, [sessionA]);
      const [codeB] = await tx.q<{ code: string }>(`select * from public.ensure_check_in_code($1)`, [sessionB]);

      await tx.as(f.a.members[1].claims);
      const okA = await checkIn(tx, sessionA, codeA.code);
      expect(okA.status).toBe("ok");
      const conflict = await checkIn(tx, sessionB, codeB.code);
      expect(conflict.status).toBe("overlap");
      expect(conflict.conflict_session_id).toBe(sessionA);
    });
  });
});

describe("POL-check_ins.presenter", () => {
  it("a presenter cannot check in to their own session (OQ-025)", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await tx.asOwner();
      const sessionId = await makeSession(tx, f.a, { state: "in_progress", startsInMinutes: -10, endsInMinutes: 50 });
      await addPresenter(tx, f.a, sessionId, f.a.members[0].memberId);

      await tx.as(f.a.members[0].claims);
      const [code] = await tx.q<{ code: string }>(`select * from public.ensure_check_in_code($1)`, [sessionId]);
      const r = await checkIn(tx, sessionId, code.code);
      expect(r.status).toBe("presenter_cannot_check_in");
    });
  });
});

describe("POL-check_ins.select.member", () => {
  it("a member cannot list who else attended a session (A33 rule 3); staff and the presenter can see their own visibility scope", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await tx.asOwner();
      const sessionId = await makeSession(tx, f.a, { state: "in_progress", startsInMinutes: -10, endsInMinutes: 50 });
      await addPresenter(tx, f.a, sessionId, f.a.members[0].memberId);
      await tx.as(f.a.members[0].claims);
      const [code] = await tx.q<{ code: string }>(`select * from public.ensure_check_in_code($1)`, [sessionId]);
      await tx.as(f.a.members[1].claims);
      const r = await checkIn(tx, sessionId, code.code);
      expect(r.status).toBe("ok");

      await tx.asOwner();
      const bystander = await addMember(tx, f.a, "bystander", "متفرج");
      await tx.as(bystander.claims);
      const asBystander = await tx.q(`select id from public.check_ins where session_id = $1`, [sessionId]);
      expect(asBystander).toEqual([]);

      await tx.as(f.a.mod.claims);
      const asStaff = await tx.q(`select id from public.check_ins where session_id = $1`, [sessionId]);
      expect(asStaff.length).toBe(1);
    });
  });
});

describe("POL-check_in_attempts.select.staff", () => {
  it("a member — including the attempter — reads none; staff read the org's; no role inserts directly", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await tx.asOwner();
      const sessionId = await makeSession(tx, f.a, { state: "in_progress", startsInMinutes: -10, endsInMinutes: 50 });
      const member = f.a.members[0];

      await tx.as(member.claims);
      const r = await checkIn(tx, sessionId, "BADCODE"); // leaves an attempt row even though it fails
      expect(r.status).toBe("invalid_code");

      const asAttempter = await tx.q(`select id from public.check_in_attempts where session_id = $1`, [sessionId]);
      expect(asAttempter).toEqual([]);

      expect(
        await errorCode(() => tx.q(`insert into public.check_in_attempts (org_id, session_id, member_id, submitted_code) values ($1, $2, $3, 'XXXXXX')`, [f.a.id, sessionId, member.memberId])),
      ).toBe(PERMISSION_DENIED);

      await tx.as(f.a.admin.claims);
      const asStaff = await tx.q(`select id from public.check_in_attempts where session_id = $1`, [sessionId]);
      expect(asStaff.length).toBeGreaterThan(0);
    });
  });
});

describe("STORY-CHK-004 — manual attendance backup", () => {
  it("requires a reason, staff-only, and produces the same check-in row shape with method = 'manual'", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await tx.asOwner();
      const sessionId = await makeSession(tx, f.a, { state: "in_progress", startsInMinutes: -10, endsInMinutes: 50 });
      const member = f.a.members[0];

      // A plain member cannot mark anyone.
      await tx.as(f.a.members[1].claims);
      expect(await errorMessage(() => tx.q(`select * from public.mark_checked_in_manually($1, $2, 'نسي الهاتف')`, [sessionId, member.memberId]))).toMatch(/not_authorized/);

      await tx.as(f.a.mod.claims);
      expect(await errorMessage(() => tx.q(`select * from public.mark_checked_in_manually($1, $2, '')`, [sessionId, member.memberId]))).toMatch(/reason_required/);

      const [ci] = await tx.q<{ id: string; method: string; manual_reason: string; marked_by: string }>(`select * from public.mark_checked_in_manually($1, $2, $3)`, [
        sessionId,
        member.memberId,
        "نسي الهاتف",
      ]);
      expect(ci.method).toBe("manual");
      expect(ci.manual_reason).toBe("نسي الهاتف");
      expect(ci.marked_by).toBe(f.a.mod.memberId);

      // A second manual mark is the same no-op as a code check-in's single-use rule.
      const [again] = await tx.q<{ id: string }>(`select * from public.mark_checked_in_manually($1, $2, $3)`, [sessionId, member.memberId, "سبب آخر"]);
      expect(again.id).toBe(ci.id);
    });
  });
});

describe("STORY-CHK-005 — the single trigger, and who it is not for", () => {
  it("a walk-in with no RSVP checks in and is granted has_checked_in() — capacity is a planning limit, not a door policy (REQ-CHK-010)", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await tx.asOwner();
      const sessionId = await makeSession(tx, f.a, { state: "in_progress", startsInMinutes: -10, endsInMinutes: 50 });
      await addPresenter(tx, f.a, sessionId, f.a.members[0].memberId);
      const walkIn = await addMember(tx, f.a, "walk-in", "زائر بلا حجز");

      // Confirm there is NO rsvp row for this member on this session — this is the whole point.
      const priorRsvps = await tx.q(`select id from public.rsvps where session_id = $1 and member_id = $2`, [sessionId, walkIn.memberId]);
      expect(priorRsvps).toEqual([]);

      await tx.as(f.a.members[0].claims);
      const [code] = await tx.q<{ code: string }>(`select * from public.ensure_check_in_code($1)`, [sessionId]);

      await tx.as(walkIn.claims);
      const r = await checkIn(tx, sessionId, code.code);
      expect(r.status).toBe("ok");

      const [hasChecked] = await tx.q<{ has_checked_in: boolean }>(`select public.has_checked_in($1) as has_checked_in`, [sessionId]);
      expect(hasChecked.has_checked_in).toBe(true); // REQ-CHK-009: the four attendance rights key off exactly this
    });
  });
});

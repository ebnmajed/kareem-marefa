// Wave 0 of M2 (DEC-040): the SCHEMA-level cases from 03 §8.2 — the rows a
// policy, a grant or a constraint decides on its own. The RPC cases
// (reserve_seat capacity, check_in rate limiting, promotion, transitions)
// are the wave-1 teammates' and are listed as todo so the handoff is visible.
import { afterAll, describe, expect, it } from "vitest";
import { errorCode, errorMessage, PERMISSION_DENIED, pool, withTx } from "./db";
import { seed } from "./fixture";

afterAll(() => pool.end());

describe("POL-proposals", () => {
  it("select.member — B cannot read A's proposal; the co-presenter and staff can", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await tx.as(f.a.members[1].claims); // co-presenter on the fixture proposal
      expect((await tx.q(`select id from public.proposals where id = $1`, [f.m2.a.proposal])).length).toBe(1);
      await tx.as(f.b.members[0].claims);
      expect(await tx.q(`select id from public.proposals where id = $1`, [f.m2.a.proposal])).toEqual([]);
      await tx.as(f.a.mod.claims);
      expect((await tx.q(`select id from public.proposals where id = $1`, [f.m2.a.proposal])).length).toBe(1);
      // A third member of A, neither proposer nor named: nothing.
      await tx.as({ ...f.a.mod.claims, org_role: "member", member_id: f.a.admin.memberId });
      expect(await tx.q(`select id from public.proposals where id = $1`, [f.m2.a.proposal])).toEqual([]);
    });
  });

  it("update.own — a proposer cannot write decision_reason, cannot edit an approved proposal, and can only move draft → submitted", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      const me = f.a.members[0];
      await tx.as(me.claims);
      expect(await errorCode(() => tx.q(`update public.proposals set decision_reason = 'x' where id = $1`, [f.m2.a.proposal]))).toBe(PERMISSION_DENIED);
      const submitted = await tx.q<{ state: string }>(`update public.proposals set state = 'submitted' where id = $1 returning state`, [f.m2.a.proposal]);
      expect(submitted[0].state).toBe("submitted");
      // submitted is no longer editable by the proposer
      expect(await tx.q(`update public.proposals set title = 'عنوان آخر' where id = $1 returning id`, [f.m2.a.proposal])).toEqual([]);
      await tx.asOwner();
      // 0011's guard enforces 02 §6.1: an admin reviews before approving
      await tx.q(`update public.proposals set state = 'in_review' where id = $1`, [f.m2.a.proposal]);
      await tx.q(`update public.proposals set state = 'approved' where id = $1`, [f.m2.a.proposal]);
      await tx.as(me.claims);
      expect(await tx.q(`update public.proposals set title = 'x' where id = $1 returning id`, [f.m2.a.proposal])).toEqual([]);
      // and a member cannot approve — even along a legal edge. draft → approved
      // is now refused by 0011's guard (23514) before the policy is consulted,
      // so the policy is exercised on in_review → approved, which the state
      // machine allows and the proposer's policy does not.
      const [{ id }] = await tx.q<{ id: string }>(`insert into public.proposals (org_id, proposer_id, title, abstract, category_id, level) values ($1, $2, 'اقتراح جديد', 'ملخص', $3, 'introductory') returning id`, [f.a.id, me.memberId, f.a.categoryId]);
      expect(await errorCode(() => tx.q(`update public.proposals set state = 'approved' where id = $1`, [id]))).toBe("23514");
      await tx.asOwner();
      await tx.q(`update public.proposals set state = 'submitted' where id = $1`, [id]);
      await tx.q(`update public.proposals set state = 'in_review' where id = $1`, [id]);
      await tx.as(me.claims);
      // the proposer's policy only reaches draft rows, so the update matches nothing
      expect(await tx.q(`update public.proposals set state = 'approved' where id = $1 returning id`, [id])).toEqual([]);
      await tx.asOwner();
      expect((await tx.q<{ state: string }>(`select state from public.proposals where id = $1`, [id]))[0].state).toBe("in_review");
    });
  });

  it("no date, time or venue column exists (REQ-PRO-001)", async () => {
    await withTx(async (tx) => {
      const cols = await tx.q<{ column_name: string }>(`select column_name from information_schema.columns where table_schema = 'public' and table_name = 'proposals'`);
      const names = cols.map((c) => c.column_name);
      for (const forbidden of ["starts_at", "ends_at", "venue_id", "scheduled_at", "date"]) expect(names).not.toContain(forbidden);
    });
  });
});

describe("POL-proposal_presenters / POL-session_presenters", () => {
  it("the named member accepts their own row and cannot touch another's; a sixth presenter is refused", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await tx.as(f.a.members[1].claims);
      const mine = await tx.q<{ accepted: boolean }>(`update public.proposal_presenters set accepted = true where proposal_id = $1 and member_id = $2 returning accepted`, [f.m2.a.proposal, f.a.members[1].memberId]);
      expect(mine[0].accepted).toBe(true);
      expect(await tx.q(`update public.session_presenters set accepted = false where session_id = $1 and member_id = $2 returning member_id`, [f.m2.a.published, f.a.members[0].memberId])).toEqual([]);
      await tx.asOwner();
      await tx.q(`update public.org_settings set max_co_presenters = 1 where org_id = $1`, [f.a.id]);
      await tx.as(f.a.admin.claims);
      // presenter + attendee = 2 = max_co_presenters + 1; a third raises
      await tx.q(`insert into public.session_presenters (org_id, session_id, member_id) values ($1, $2, $3)`, [f.a.id, f.m2.a.draft, f.a.members[1].memberId]);
      expect(await errorMessage(() => tx.q(`insert into public.session_presenters (org_id, session_id, member_id) values ($1, $2, $3)`, [f.a.id, f.m2.a.draft, f.a.mod.memberId]))).toMatch(/too_many_presenters/);
    });
  });
});

describe("POL-sessions", () => {
  it("select.member — a draft is invisible to members, visible to its presenter and to staff", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await tx.as(f.a.members[1].claims);
      expect(await tx.q(`select id from public.sessions where id = $1`, [f.m2.a.draft])).toEqual([]);
      expect((await tx.q(`select id from public.sessions where id = $1`, [f.m2.a.published])).length).toBe(1);
      await tx.as(f.a.members[0].claims); // presenter
      expect((await tx.q(`select id from public.sessions where id = $1`, [f.m2.a.draft])).length).toBe(1);
      await tx.as(f.a.mod.claims);
      expect((await tx.q(`select id from public.sessions where id = $1`, [f.m2.a.draft])).length).toBe(1);
    });
  });

  it("update.presenter — starts_at and state are rejected by the grant; title is allowed", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await tx.as(f.a.members[0].claims);
      expect(await errorCode(() => tx.q(`update public.sessions set starts_at = now() where id = $1`, [f.m2.a.published]))).toBe(PERMISSION_DENIED);
      expect(await errorCode(() => tx.q(`update public.sessions set state = 'published' where id = $1`, [f.m2.a.draft]))).toBe(PERMISSION_DENIED);
      expect(await errorCode(() => tx.q(`update public.sessions set capacity = 500 where id = $1`, [f.m2.a.published]))).toBe(PERMISSION_DENIED);
      const t = await tx.q<{ title: string }>(`update public.sessions set title = 'عنوان محدّث' where id = $1 returning title`, [f.m2.a.published]);
      expect(t[0].title).toBe("عنوان محدّث");
      // not a presenter of B's session, and B's session is invisible anyway
      expect(await tx.q(`update public.sessions set title = 'x' where id = $1 returning id`, [f.m2.b.published])).toEqual([]);
    });
  });

  it("the publish gate is a constraint: no time, place or capacity → no published row", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await tx.asOwner();
      const code = await errorCode(() => tx.q(`insert into public.sessions (org_id, title, abstract, category_id, level, state) values ($1, 'بلا موعد', 'x', $2, 'introductory', 'published')`, [f.a.id, f.a.categoryId]));
      expect(code).toBe("23514");
    });
  });
});

describe("POL-rsvps / POL-check_in_codes / POL-check_ins / POL-check_in_attempts", () => {
  it("rsvps.insert.rpc — direct insert is rejected for every role; a member reads only their own", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await tx.as(f.a.members[0].claims);
      expect(await errorCode(() => tx.q(`insert into public.rsvps (org_id, session_id, member_id, status) values ($1, $2, $3, 'confirmed')`, [f.a.id, f.m2.a.published, f.a.members[0].memberId]))).toBe(PERMISSION_DENIED);
      // members[0] is the presenter: sees the session's RSVPs
      expect((await tx.q(`select member_id from public.rsvps where session_id = $1`, [f.m2.a.published])).length).toBe(1);
      await tx.as({ ...f.a.mod.claims, org_role: "member", member_id: f.a.admin.memberId });
      expect(await tx.q(`select member_id from public.rsvps where session_id = $1`, [f.m2.a.published])).toEqual([]);
      await tx.as(f.a.admin.claims);
      expect(await errorCode(() => tx.q(`insert into public.rsvps (org_id, session_id, member_id, status) values ($1, $2, $3, 'confirmed')`, [f.a.id, f.m2.a.published, f.a.admin.memberId]))).toBe(PERMISSION_DENIED);
    });
  });

  it("codes.select.member — a checked-in member reads no code; the presenter and staff do (OQ-013)", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await tx.as(f.a.members[1].claims); // checked in on the fixture session
      expect(await tx.q(`select code from public.check_in_codes where session_id = $1`, [f.m2.a.published])).toEqual([]);
      await tx.as(f.a.members[0].claims); // presenter
      expect((await tx.q(`select code from public.check_in_codes where session_id = $1`, [f.m2.a.published])).length).toBe(1);
      await tx.as(f.b.admin.claims); // staff of the OTHER org
      expect(await tx.q(`select code from public.check_in_codes where session_id = $1`, [f.m2.a.published])).toEqual([]);
    });
  });

  it("check_ins — a member cannot list who else attended; direct insert is rejected; attempts are staff-only", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await tx.as(f.a.members[1].claims);
      const mine = await tx.q<{ member_id: string }>(`select member_id from public.check_ins where session_id = $1`, [f.m2.a.published]);
      expect(mine.map((r) => r.member_id)).toEqual([f.a.members[1].memberId]);
      expect(await errorCode(() => tx.q(`insert into public.check_ins (org_id, session_id, member_id, method, code_id, session_window) values ($1, $2, $3, 'code', $4, 'empty')`, [f.a.id, f.m2.a.published, f.a.members[1].memberId, f.m2.a.codeId]))).toBe(PERMISSION_DENIED);
      expect(await tx.q(`select id from public.check_in_attempts`)).toEqual([]);
      await tx.as(f.a.mod.claims);
      expect((await tx.q(`select id from public.check_in_attempts`)).length).toBe(1);
    });
  });

  it("check_ins.single_use / overlap — the unique and exclusion constraints hold even for the owner", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await tx.asOwner();
      expect(await errorCode(() => tx.q(`insert into public.check_ins (org_id, session_id, member_id, method, code_id, session_window) values ($1, $2, $3, 'code', $4, 'empty')`, [f.a.id, f.m2.a.published, f.a.members[1].memberId, f.m2.a.codeId]))).toBe("23505");
      // an overlapping session in the same window, same member → 23P01 (exclusion)
      const [{ id }] = await tx.q<{ id: string }>(
        `insert into public.sessions (org_id, title, abstract, category_id, level, starts_at, ends_at, venue_id, capacity, state, published_at)
         select org_id, 'متداخلة', 'x', category_id, level, starts_at, ends_at, venue_id, 10, 'published', now() from public.sessions where id = $1 returning id`,
        [f.m2.a.published],
      );
      expect(await errorCode(() => tx.q(`insert into public.check_ins (org_id, session_id, member_id, method, manual_reason, marked_by, session_window) values ($1, $2, $3, 'manual', 'x', $4, 'empty')`, [f.a.id, id, f.a.members[1].memberId, f.a.admin.memberId]))).toBe("23P01");
      // a manual check-in needs a reason and a marker
      expect(await errorCode(() => tx.q(`insert into public.check_ins (org_id, session_id, member_id, method, session_window) values ($1, $2, $3, 'manual', 'empty')`, [f.a.id, f.m2.a.draft, f.a.mod.memberId]))).toBe("23514");
    });
  });

  it.todo("POL-rsvps.reserve.capacity — N concurrent reservations, N−1 seats (wave 1: checkin)");
  it.todo("POL-rsvps.reserve.deadline — reserving after the deadline is rejected; promotion after it succeeds (wave 1: checkin)");
  it.todo("POL-check_ins.rate_limit / window / revoked / presenter — the check_in() RPC (wave 1: checkin)");
  it.todo("POL-sessions transitions — every transition writes a row; the clock never overrides a manual one (wave 1: sessions)");
});

describe("POL-comments / POL-reactions / POL-reports", () => {
  it("comments.insert.member — a member with no RSVP and no check-in CAN comment (D32); not on a draft", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await tx.as({ ...f.a.mod.claims, org_role: "member", member_id: f.a.admin.memberId });
      const [row] = await tx.q<{ id: string }>(`insert into public.comments (org_id, session_id, author_id, body) values ($1, $2, $3, 'تعليق بلا حجز') returning id`, [f.a.id, f.m2.a.published, f.a.admin.memberId]);
      expect(row.id).toBeTruthy();
      expect(await errorCode(() => tx.q(`insert into public.comments (org_id, session_id, author_id, body) values ($1, $2, $3, 'x')`, [f.a.id, f.m2.a.draft, f.a.admin.memberId]))).toBe(PERMISSION_DENIED);
    });
  });

  it("comments.depth — a reply to a reply is refused; comments.update — window, author-only body, moderator remove/restore", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await tx.as(f.a.members[1].claims);
      expect(await errorMessage(() => tx.q(`insert into public.comments (org_id, session_id, author_id, parent_id, body) values ($1, $2, $3, $4, 'رد على رد')`, [f.a.id, f.m2.a.published, f.a.members[1].memberId, f.m2.a.replyId]))).toMatch(/reply_depth/);
      const edited = await tx.q<{ edited_at: string }>(`update public.comments set body = 'سؤال معدّل' where id = $1 returning edited_at`, [f.m2.a.commentId]);
      expect(edited[0].edited_at).not.toBeNull();
      await tx.asOwner();
      await tx.q(`update public.comments set created_at = now() - interval '16 minutes' where id = $1`, [f.m2.a.commentId]);
      await tx.as(f.a.members[1].claims);
      expect(await tx.q(`update public.comments set body = 'متأخر' where id = $1 returning id`, [f.m2.a.commentId])).toEqual([]);
      await tx.as(f.a.mod.claims);
      expect(await errorMessage(() => tx.q(`update public.comments set body = 'كتبه المنظم' where id = $1`, [f.m2.a.commentId]))).toMatch(/not_author/);
      const removed = await tx.q<{ deleted_by: string }>(`update public.comments set deleted_at = now() where id = $1 returning deleted_by`, [f.m2.a.commentId]);
      expect(removed[0].deleted_by).toBe(f.a.mod.memberId);
    });
  });

  it("reactions — only own; duplicates rejected. reports — reporter and staff read; a member cannot resolve", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await tx.as(f.a.members[1].claims);
      await tx.q(`insert into public.reactions (org_id, comment_id, member_id, kind) values ($1, $2, $3, 'like')`, [f.a.id, f.m2.a.replyId, f.a.members[1].memberId]);
      expect(await errorCode(() => tx.q(`insert into public.reactions (org_id, comment_id, member_id, kind) values ($1, $2, $3, 'like')`, [f.a.id, f.m2.a.replyId, f.a.members[1].memberId]))).toBe("23505");
      expect(await errorCode(() => tx.q(`insert into public.reactions (org_id, comment_id, member_id, kind) values ($1, $2, $3, 'like')`, [f.a.id, f.m2.a.replyId, f.a.members[0].memberId]))).toBe(PERMISSION_DENIED);
      expect((await tx.q(`select id from public.reports`)).length).toBe(1); // own report
      expect(await errorCode(() => tx.q(`update public.reports set status = 'resolved', resolved_at = now(), resolution = 'dismissed' where org_id = $1`, [f.a.id]))).toBeNull();
      // the member's update matched no row (policy), so nothing changed
      await tx.as(f.a.mod.claims);
      const open = await tx.q<{ status: string }>(`select status from public.reports where org_id = $1`, [f.a.id]);
      expect(open[0].status).toBe("open");
      await tx.as(f.a.members[0].claims);
      expect(await tx.q(`select id from public.reports`)).toEqual([]);
    });
  });
});

describe("POL-ratings", () => {
  it("insert.check_in — no check-in → rejected; someone else's check_in_id → rejected; own → accepted within the window", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      const noCheckIn = f.a.members[0];
      await tx.as(noCheckIn.claims);
      expect(await errorCode(() => tx.q(`insert into public.ratings (org_id, session_id, member_id, check_in_id, session_stars, presenter_stars) values ($1, $2, $3, $4, 5, 5)`, [f.a.id, f.m2.a.completed, noCheckIn.memberId, f.m2.a.checkInCompleted]))).toBe(PERMISSION_DENIED);
      await tx.asOwner();
      await tx.q(`delete from public.ratings where id = $1`, [f.m2.a.ratingId]);
      await tx.as(f.a.members[1].claims);
      const [r] = await tx.q<{ id: string }>(`insert into public.ratings (org_id, session_id, member_id, check_in_id, session_stars, presenter_stars) values ($1, $2, $3, $4, 4, 4) returning id`, [f.a.id, f.m2.a.completed, f.a.members[1].memberId, f.m2.a.checkInCompleted]);
      expect(r.id).toBeTruthy();
    });
  });

  it("select — an admin sees rows only through the audited RPC; a presenter sees NO rows and reads the aggregate view, which is empty below the minimum", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await tx.as(f.a.admin.claims);
      // DEC-044 (0017): an admin's direct select is empty — the audited RPC is the only path
      expect(await tx.q(`select member_id from public.ratings where session_id = $1`, [f.m2.a.completed])).toEqual([]);
      expect((await tx.q(`select member_id from public.list_session_ratings_admin($1)`, [f.m2.a.completed])).length).toBe(1);
      await tx.as(f.a.members[0].claims); // presenter of the completed session
      expect(await tx.q(`select member_id from public.ratings where session_id = $1`, [f.m2.a.completed])).toEqual([]);
      expect(await tx.q(`select rating_count from public.session_rating_aggregates where session_id = $1`, [f.m2.a.completed])).toEqual([]); // 1 < 3
      await tx.asOwner();
      await tx.q(`update public.org_settings set rating_min_aggregate = 1 where org_id = $1`, [f.a.id]);
      await tx.as(f.a.members[0].claims);
      const agg = await tx.q<Record<string, unknown>>(`select * from public.session_rating_aggregates where session_id = $1`, [f.m2.a.completed]);
      expect(agg.length).toBe(1);
      expect(Object.keys(agg[0])).not.toContain("member_id");
      await tx.as(f.a.mod.claims);
      expect(await tx.q(`select member_id from public.ratings where session_id = $1`, [f.m2.a.completed])).toEqual([]);
    });
  });
});

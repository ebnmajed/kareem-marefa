// notify (wave 2, M3) — supabase/proposed/notify/0007_m2_notices.sql:
// the last of the notices DEC-045 deferred from M2.
//
// 03 §8.2 rows proven here:
//   POL-comments.reply_notice · POL-comments.mention_notice ·
//   POL-comments.removal_notice · POL-proposals.decision_notice ·
//   POL-proposal_presenters.invite_notice ·
//   POL-session_presenters.assigned_notice · POL-reports.filed_notice
//
// `event` stored the mention targets in `comments.mentions` and left delivery
// to M3 rather than faking it (docs/plan/notes/event.md §1). This is that
// delivery.
import { existsSync } from "node:fs";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { applyProposed, pool, withTx } from "./db";
import { seed } from "./fixture";
import type { Tx } from "./db";

afterAll(() => pool.end());

// Dependency order; the filesystem decides which still need applying, because
// a promotion lands mid-session in a shared tree.
const PROPOSED = ["notify/0005_session_notices.sql", "notify/0007_m2_notices.sql"];

async function setup(tx: Tx) {
  const f = await seed(tx);
  for (const file of PROPOSED) {
    if (existsSync(join(process.cwd(), "supabase", "proposed", file))) await applyProposed(tx, file);
  }
  await tx.q(`delete from public.notifications`);
  return f;
}

const inbox = (tx: Tx, key?: string) =>
  tx.q<{ key: string; member_id: string; payload: Record<string, unknown> }>(
    key
      ? `select key, member_id, payload from public.notifications where key = $1 order by created_at`
      : `select key, member_id, payload from public.notifications order by created_at`,
    key ? [key] : [],
  );

const comment = (tx: Tx, org: string, session: string, author: string, opts: { parent?: string; mentions?: string[] } = {}) =>
  tx.q<{ id: string }>(
    `insert into public.comments (org_id, session_id, author_id, parent_id, body, mentions)
     values ($1, $2, $3, $4, 'نص التعليق', coalesce($5::uuid[], '{}')) returning id`,
    [org, session, author, opts.parent ?? null, opts.mentions ?? null],
  );

describe("POL-comments.reply_notice — REQ-EVT-007", () => {
  it("a reply notifies the parent's author, and replying to yourself notifies nobody", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      await tx.asOwner();
      const [parent] = await comment(tx, f.a.id, f.m2.a.published, f.a.members[0].memberId);
      await tx.q(`delete from public.notifications`);

      await comment(tx, f.a.id, f.m2.a.published, f.a.members[1].memberId, { parent: parent.id });
      const rows = await inbox(tx, "MSG-comment_reply");
      expect(rows).toHaveLength(1);
      expect(rows[0].member_id).toBe(f.a.members[0].memberId);

      // The author replying to their own comment is not news.
      await tx.q(`delete from public.notifications`);
      await comment(tx, f.a.id, f.m2.a.published, f.a.members[0].memberId, { parent: parent.id });
      expect(await inbox(tx, "MSG-comment_reply")).toEqual([]);
    });
  });
});

describe("POL-comments.mention_notice — REQ-EVT-006, REQ-EVT-007", () => {
  it("notifies every mentioned member once, and never yourself", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      await tx.asOwner();
      const author = f.a.members[0].memberId;
      await comment(tx, f.a.id, f.m2.a.published, author, {
        mentions: [f.a.members[1].memberId, f.a.admin.memberId, author, f.a.members[1].memberId],
      });

      const rows = await inbox(tx, "MSG-mentioned");
      expect(rows.map((r) => r.member_id).sort()).toEqual([f.a.members[1].memberId, f.a.admin.memberId].sort());
    });
  });

  it("does not notify a mentioned member twice when they also authored the parent", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      await tx.asOwner();
      const [parent] = await comment(tx, f.a.id, f.m2.a.published, f.a.members[0].memberId);
      await tx.q(`delete from public.notifications`);

      await comment(tx, f.a.id, f.m2.a.published, f.a.members[1].memberId, {
        parent: parent.id,
        mentions: [f.a.members[0].memberId],
      });
      // One message, not a reply AND a mention about the same comment.
      const rows = await inbox(tx);
      expect(rows).toHaveLength(1);
      expect(rows[0].key).toBe("MSG-comment_reply");
    });
  });

  it("ignores a mention of a member in another org", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      await tx.asOwner();
      // `mentions` is a plain uuid[]; the picker is org-scoped but a crafted
      // insert is not something the schema should have to trust.
      await comment(tx, f.a.id, f.m2.a.published, f.a.members[0].memberId, { mentions: [f.b.members[0].memberId] });
      expect(await inbox(tx)).toEqual([]);
    });
  });
});

describe("POL-comments.removal_notice — REQ-EVT-008", () => {
  it("tells the author when a moderator removes it, and says nothing on a self-delete", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      await tx.asOwner();
      const [own] = await comment(tx, f.a.id, f.m2.a.published, f.a.members[0].memberId);
      const [other] = await comment(tx, f.a.id, f.m2.a.published, f.a.members[0].memberId);
      await tx.q(`delete from public.notifications`);

      // `comments_guard()` (0010) OVERWRITES `deleted_by` with
      // `auth_member_id()` on any change to `deleted_at`, so who removed a
      // comment is decided by the JWT and never by the UPDATE. These two
      // therefore run as the people they are about, which is also the real
      // path: the author through `comments_update_own`, the moderator through
      // `p6_staff_update`.
      await tx.as(f.a.members[0].claims);
      await tx.q(`update public.comments set deleted_at = now() where id = $1`, [own.id]);
      await tx.asOwner();
      expect(await inbox(tx, "MSG-content_removed")).toEqual([]);

      await tx.as(f.a.mod.claims);
      await tx.q(`update public.comments set deleted_at = now() where id = $1`, [other.id]);
      await tx.asOwner();
      const rows = await inbox(tx, "MSG-content_removed");
      expect(rows).toHaveLength(1);
      expect(rows[0].member_id).toBe(f.a.members[0].memberId);
    });
  });
});

describe("POL-proposals.decision_notice — REQ-PRO-005", () => {
  it("tells the proposer AND the co-presenters, with the reason", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      await tx.asOwner();
      const proposal = f.m2.a.proposal;
      const proposer = f.a.members[0].memberId;
      const co = f.a.members[1].memberId;
      await tx.q(`insert into public.proposal_presenters (org_id, proposal_id, member_id) values ($1, $2, $3) on conflict do nothing`, [f.a.id, proposal, co]);
      await tx.q(`delete from public.notifications`);

      // draft → submitted → in_review → rejected: 0011's guard accepts no jump.
      await tx.q(`update public.proposals set state = 'submitted' where id = $1`, [proposal]);
      await tx.q(`update public.proposals set state = 'in_review' where id = $1`, [proposal]);
      await tx.q(`delete from public.notifications`);
      await tx.q(`update public.proposals set state = 'rejected', decision_reason = 'خارج نطاق التصنيفات' where id = $1`, [proposal]);

      const rows = await inbox(tx, "MSG-proposal_rejected");
      expect(rows.map((r) => r.member_id).sort()).toEqual([proposer, co].sort());
      // A co-presenter who is not told is a presenter who turns up.
      expect(rows[0].payload.reason).toBe("خارج نطاق التصنيفات");
    });
  });

  it("maps each decision to its own message, and a submission to the org's admins", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      await tx.asOwner();
      const proposal = f.m2.a.proposal;

      // `proposals_guard_transition` (0011) accepts only 02 §6.1's edges, so
      // each decision is reached by walking there rather than jumping.
      await tx.q(`update public.proposals set state = 'submitted' where id = $1`, [proposal]);
      const submitted = await inbox(tx, "MSG-proposal_submitted");
      expect(submitted.map((r) => r.member_id)).toEqual([f.a.admin.memberId]);

      await tx.q(`delete from public.notifications`);
      await tx.q(`update public.proposals set state = 'in_review' where id = $1`, [proposal]);
      expect(await inbox(tx)).toEqual([]); // in_review is not a decision
      await tx.q(`update public.proposals set state = 'changes_requested', decision_reason = 'نحتاج ملخصًا أطول' where id = $1`, [proposal]);
      expect((await inbox(tx))[0].key).toBe("MSG-proposal_changes");

      await tx.q(`delete from public.notifications`);
      await tx.q(`update public.proposals set state = 'submitted' where id = $1`, [proposal]);
      await tx.q(`update public.proposals set state = 'in_review' where id = $1`, [proposal]);
      await tx.q(`delete from public.notifications`);
      await tx.q(`update public.proposals set state = 'approved' where id = $1`, [proposal]);
      expect((await inbox(tx))[0].key).toBe("MSG-proposal_approved");
    });
  });
});

describe("POL-proposal_presenters.invite_notice — REQ-PRO-002", () => {
  it("tells the named member, and tells the proposer when they decline", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      await tx.asOwner();
      const proposal = f.m2.a.proposal;
      const invited = f.a.admin.memberId;
      await tx.q(`delete from public.notifications`);

      await tx.q(`insert into public.proposal_presenters (org_id, proposal_id, member_id) values ($1, $2, $3)`, [f.a.id, proposal, invited]);
      let rows = await inbox(tx, "MSG-copresenter_invited");
      expect(rows).toHaveLength(1);
      expect(rows[0].member_id).toBe(invited);

      await tx.q(`delete from public.notifications`);
      await tx.q(`update public.proposal_presenters set declined_at = now() where proposal_id = $1 and member_id = $2`, [proposal, invited]);
      rows = await inbox(tx, "MSG-copresenter_declined");
      expect(rows).toHaveLength(1);
      // The proposer, so they can find someone else in time.
      expect(rows[0].member_id).toBe(f.a.members[0].memberId);
    });
  });

  it("is non-optional — the invitation arrives with `proposals` muted", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      await tx.asOwner();
      for (const channel of ["in_app", "email"]) {
        await tx.q(
          `insert into public.notification_preferences (org_id, member_id, category, channel, enabled)
           values ($1, $2, 'proposals', $3::public.notify_channel, false)`,
          [f.a.id, f.a.admin.memberId, channel],
        );
      }
      await tx.q(`delete from public.notifications`);
      await tx.q(`insert into public.proposal_presenters (org_id, proposal_id, member_id) values ($1, $2, $3)`, [f.a.id, f.m2.a.proposal, f.a.admin.memberId]);
      expect(await inbox(tx, "MSG-copresenter_invited")).toHaveLength(1);
    });
  });
});

describe("POL-session_presenters.assigned_notice — REQ-PRO-007", () => {
  it("tells the presenter an admin assigned them, with the time and place", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      await tx.asOwner();
      await tx.q(`delete from public.notifications`);
      await tx.q(`insert into public.session_presenters (org_id, session_id, member_id, accepted) values ($1, $2, $3, false)`, [
        f.a.id,
        f.m2.a.published,
        f.a.admin.memberId,
      ]);

      const rows = await inbox(tx, "MSG-presenter_assigned");
      expect(rows).toHaveLength(1);
      expect(rows[0].member_id).toBe(f.a.admin.memberId);
      // The first question anyone asks is "when".
      expect(rows[0].payload.startsAt).toBeTruthy();
      expect(rows[0].payload.venue).toBe("قاعة كريم معرفة");
    });
  });
});

describe("POL-reports.filed_notice — REQ-EVT-010", () => {
  it("reaches every moderator and admin of the org, and nobody else", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      await tx.asOwner();
      await tx.q(`delete from public.notifications`);
      await tx.q(
        `insert into public.reports (org_id, target, comment_id, reporter_id, reason)
         values ($1, 'comment', $2, $3, 'محتوى غير لائق')`,
        [f.a.id, f.m2.a.commentId, f.a.members[1].memberId],
      );

      const rows = await inbox(tx, "MSG-report_filed");
      expect(rows.map((r) => r.member_id).sort()).toEqual([f.a.admin.memberId, f.a.mod.memberId].sort());
      // Org B's moderators hear nothing about org A's report.
      expect(
        await tx.q(`select n.id from public.notifications n join public.members m on m.id = n.member_id where m.org_id = $1`, [f.b.id]),
      ).toEqual([]);
    });
  });

  it("does not notify the reporter when they are themselves staff", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      await tx.asOwner();
      await tx.q(`delete from public.notifications`);
      await tx.q(
        `insert into public.reports (org_id, target, comment_id, reporter_id, reason)
         values ($1, 'comment', $2, $3, 'محتوى غير لائق')`,
        [f.a.id, f.m2.a.commentId, f.a.mod.memberId],
      );
      const rows = await inbox(tx, "MSG-report_filed");
      expect(rows.map((r) => r.member_id)).toEqual([f.a.admin.memberId]);
    });
  });
});

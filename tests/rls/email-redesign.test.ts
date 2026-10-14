// 0224 — the approved email design's database half (DEC-289; REQ-NTF-018, REQ-NTF-019, REQ-EVT-017, REQ-LDR-009).
//
// 03 §8.2 rows proven here:
//   TRG-comments_notify.presenters, TRG-check_ins_notify.first, RPC-send_weekly_leaderboard_digests.once,
//   TBL-leaderboard_weekly_digests.rls, TBL-email_unsubscribe_secrets.closed, RPC-apply_email_unsubscribe.token,
//   RPC-email_facts.service_only, RPC-email_preview_facts.staff, POL-storage.exports.public_card.landscape.
// (RPC-org_week.sunday is in scoring-week-live.test.ts, beside the week's other boundary cases.)
import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { applyProposed, errorCode, pool, withTx, type Tx } from "./db";
import { seed as seedFixture } from "./fixture";

// ★ `applyProposed()` is a no-op once `0224` is in the chain (`db.ts`): a reviewer can run this against a local database
// still at `0223` by placing the migration under `supabase/proposed/lead/`, inside the test's own rolled-back transaction.
const seed = async (tx: Tx) => {
  await applyProposed(tx, "lead/0224_email_redesign.sql");
  return seedFixture(tx);
};

afterAll(() => pool.end());

const count = async (tx: Tx, sql: string, params: unknown[]) => Number((await tx.q<{ n: string }>(sql, params))[0]!.n);

describe("TRG-comments_notify.presenters", () => {
  it("★ a comment tells each accepted presenter but its author — once, as MSG-session_comment", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await tx.asOwner();
      const session = f.m2.a.published;
      const presenter = f.a.members[0]!;
      const author = f.a.members[1]!;
      const [{ id }] = await tx.q<{ id: string }>(
        `insert into public.comments (org_id, session_id, author_id, body) values ($1, $2, $3, 'سؤال عن الشرائح') returning id`,
        [f.a.id, session, author.memberId],
      );
      const told = await tx.q<{ member_id: string }>(
        `select member_id from public.notifications where key = 'MSG-session_comment' and payload ->> 'comment_id' = $1`,
        [id],
      );
      expect(told.map((r) => r.member_id)).toEqual([presenter.memberId]);
    });
  });

  it("a presenter's own comment tells nobody — and a reply to the presenter is the reply, not a second message", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await tx.asOwner();
      const session = f.m2.a.published;
      const presenter = f.a.members[0]!;
      const [{ id: own }] = await tx.q<{ id: string }>(
        `insert into public.comments (org_id, session_id, author_id, body) values ($1, $2, $3, 'شكرًا للحضور') returning id`,
        [f.a.id, session, presenter.memberId],
      );
      expect(await count(tx, `select count(*) n from public.notifications where payload ->> 'comment_id' = $1`, [own])).toBe(0);
      const [{ id: reply }] = await tx.q<{ id: string }>(
        `insert into public.comments (org_id, session_id, author_id, parent_id, body) values ($1, $2, $3, $4, 'وأنا أيضًا') returning id`,
        [f.a.id, session, f.a.members[1]!.memberId, own],
      );
      const keys = await tx.q<{ key: string }>(`select key from public.notifications where member_id = $1 and payload ->> 'comment_id' = $2`, [presenter.memberId, reply]);
      expect(keys.map((k) => k.key)).toEqual(["MSG-comment_reply"]);
    });
  });
});

describe("TRG-check_ins_notify.first", () => {
  it("★ the first check-in sends MSG-check_in_confirmed with no points in its payload", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await tx.asOwner();
      // The fixture's check-in on the published session fired the trigger as it was written.
      const rows = await tx.q<{ payload: Record<string, unknown> }>(
        `select n.payload from public.notifications n join public.check_ins c on c.id::text = n.payload ->> 'check_in_id'
          where n.key = 'MSG-check_in_confirmed' and c.id = $1`,
        [f.m2.a.checkInPublished],
      );
      expect(rows).toHaveLength(1);
      expect(Object.keys(rows[0]!.payload).sort()).toEqual(["check_in_id", "session_id", "title"]);
    });
  });
});

describe("RPC-send_weekly_leaderboard_digests.once", () => {
  it("★ a second run in the same week sends nothing, and the guard row counts the first run's recipients", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await tx.asOwner();
      const m = f.a.members[1]!;
      // Points ten days ago — inside the week that closed most recently, whatever today is.
      await tx.q(
        `insert into public.points_ledger (org_id, member_id, amount, source, reason, idempotency_key, occurred_at)
         values ($1, $2, 40, 'manual_adjustment', 'اختبار الأسبوع', $3, now() - interval '8 days')`,
        [f.a.id, m.memberId, `test:digest:${randomUUID()}`],
      );
      await tx.q(`select public.send_weekly_leaderboard_digests()`);
      const [{ again }] = await tx.q<{ again: number }>(`select public.send_weekly_leaderboard_digests() as again`);
      expect(again).toBe(0);
      const guard = await tx.q<{ recipients: number }>(`select recipients from public.leaderboard_weekly_digests where org_id = $1`, [f.a.id]);
      expect(guard.length).toBeLessThanOrEqual(1);
      const sent = await count(tx, `select count(*) n from public.notifications where org_id = $1 and key = 'MSG-leaderboard_weekly'`, [f.a.id]);
      expect(sent).toBe(guard[0]?.recipients ?? 0);
    });
  });
});

describe("TBL-leaderboard_weekly_digests.rls", () => {
  it("staff read their own org's rows; a member and another org read none; nobody writes", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await tx.asOwner();
      await tx.q(`insert into public.leaderboard_weekly_digests (org_id, week_start, recipients) values ($1, '2026-09-27', 3), ($2, '2026-09-27', 1)`, [f.a.id, f.b.id]);
      await tx.as(f.a.admin.claims);
      expect((await tx.q(`select org_id from public.leaderboard_weekly_digests`)).map((r) => r.org_id)).toEqual([f.a.id]);
      expect(await errorCode(() => tx.q(`insert into public.leaderboard_weekly_digests (org_id, week_start) values ($1, '2026-10-04')`, [f.a.id]))).toBe("42501");
      await tx.as(f.a.members[1]!.claims);
      expect(await tx.q(`select * from public.leaderboard_weekly_digests`)).toEqual([]);
    });
  });
});

describe("TBL-email_unsubscribe_secrets.closed", () => {
  it("no client role reads or writes the secret", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await tx.as(f.a.admin.claims);
      expect(await errorCode(() => tx.q(`select * from public.email_unsubscribe_secrets`))).toBe("42501");
      await tx.asAnon();
      expect(await errorCode(() => tx.q(`select * from public.email_unsubscribe_secrets`))).toBe("42501");
    });
  });
});

describe("RPC-apply_email_unsubscribe.token", () => {
  it("★ a valid token, sent by anyone, switches that category's email off — idempotently", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await tx.asOwner();
      const m = f.a.members[1]!;
      const [{ token }] = await tx.q<{ token: string }>(`select public.email_unsubscribe_token($1, $2, 'social') as token`, [f.a.id, m.memberId]);
      await tx.asAnon();
      const [{ category }] = await tx.q<{ category: string }>(`select public.apply_email_unsubscribe($1) as category`, [token]);
      expect(category).toBe("social");
      await tx.q(`select public.apply_email_unsubscribe($1)`, [token]);
      await tx.asOwner();
      const prefs = await tx.q<{ enabled: boolean }>(
        `select enabled from public.notification_preferences where member_id = $1 and category = 'social' and channel = 'email'`,
        [m.memberId],
      );
      expect(prefs).toEqual([{ enabled: false }]);
    });
  });

  it("a forged token, another member's id, or a category nobody may switch off is refused — one answer", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await tx.asOwner();
      const m = f.a.members[1]!;
      const [{ token }] = await tx.q<{ token: string }>(`select public.email_unsubscribe_token($1, $2, 'social') as token`, [f.a.id, m.memberId]);
      const [{ account }] = await tx.q<{ account: string }>(`select public.email_unsubscribe_token($1, $2, 'account') as account`, [f.a.id, m.memberId]);
      const forged = token.slice(0, -1) + (token.endsWith("0") ? "1" : "0");
      const swapped = token.replace(m.memberId, f.a.members[0]!.memberId);
      await tx.asAnon();
      for (const bad of [forged, swapped, account, "", "x.y.z"]) {
        expect(await errorCode(() => tx.q(`select public.apply_email_unsubscribe($1)`, [bad])), bad).toBe("22023");
      }
    });
  });

  it("only the worker mints a token", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await tx.as(f.a.admin.claims);
      expect(await errorCode(() => tx.q(`select public.email_unsubscribe_token($1, $2, 'social')`, [f.a.id, f.a.admin.memberId]))).toBe("42501");
    });
  });
});

describe("RPC-email_facts.service_only / RPC-email_preview_facts.staff", () => {
  it("no client role executes email_facts()", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await tx.as(f.a.admin.claims);
      expect(await errorCode(() => tx.q(`select public.email_facts($1, $2, 'MSG-session_published', '{}'::jsonb)`, [f.a.id, f.a.admin.memberId]))).toBe("42501");
      await tx.asAnon();
      expect(await errorCode(() => tx.q(`select public.email_facts($1, $2, 'MSG-session_published', '{}'::jsonb)`, [f.a.id, f.a.admin.memberId]))).toBe("42501");
    });
  });

  it("the preview's door: staff of the session's org read its facts; a member and another org's staff are refused", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await tx.as(f.a.admin.claims);
      const [{ facts }] = await tx.q<{ facts: Record<string, unknown> }>(`select public.email_preview_facts($1, 'MSG-session_published') as facts`, [f.m2.a.published]);
      expect(facts).toHaveProperty("starts_at");
      expect(facts).toHaveProperty("going_count");
      await tx.as(f.a.members[1]!.claims);
      expect(await errorCode(() => tx.q(`select public.email_preview_facts($1, 'MSG-session_published')`, [f.m2.a.published]))).toBe("42501");
      await tx.as(f.b.admin.claims);
      expect(await errorCode(() => tx.q(`select public.email_preview_facts($1, 'MSG-session_published')`, [f.m2.a.published]))).toBe("42501");
    });
  });
});

describe("POL-storage.exports.public_card.landscape", () => {
  it("★ a published session's ready landscape PNG is named for anyone; a draft's never", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await tx.asOwner();
      const wide = async (session: string) => {
        const [doc] = await tx.q<{ id: string }>(
          `insert into public.design_documents (org_id, purpose, document, bound_session_id, updated_by) values ($1, 'poster', '{"schemaVersion":1,"layers":[]}'::jsonb, $2, null) returning id`,
          [f.a.id, session],
        );
        await tx.q(`insert into public.session_posters (org_id, session_id, document_id) values ($1, $2, $3) on conflict (session_id) do update set document_id = excluded.document_id`, [f.a.id, session, doc!.id]);
        const path = `${f.a.id}/exports/${doc!.id}/landscape.png`;
        await tx.q(
          `insert into public.export_artifacts (org_id, document_id, preset, format, width_px, height_px, storage_path, byte_size, status, source_fingerprint, rendered_at)
           values ($1, $2, 'landscape', 'png', 1920, 1080, $3, 10, 'ready', $4, now())`,
          [f.a.id, doc!.id, path, `fp-${doc!.id}`],
        );
        return path;
      };
      const published = await wide(f.m2.a.published);
      await wide(f.m2.a.draft);
      await tx.asAnon();
      const [{ p }] = await tx.q<{ p: string | null }>(`select public.session_wide_poster_path($1) as p`, [f.m2.a.published]);
      expect(p).toBe(published);
      const [{ d }] = await tx.q<{ d: string | null }>(`select public.session_wide_poster_path($1) as d`, [f.m2.a.draft]);
      expect(d).toBeNull();
      const [{ open }] = await tx.q<{ open: boolean }>(`select public.export_is_public_card($1) as open`, [published]);
      expect(open).toBe(true);
    });
  });
});

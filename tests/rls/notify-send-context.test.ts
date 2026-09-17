// notify (wave 10) — supabase/proposed/notify/0002_send_context_blocks_and_session.sql:
// what one send needs in order to render a DESIGN.
//
// 03 §8.2 rows proven here:
//   RPC-notification_send_context.blocks ·
//   RPC-notification_send_context.session_state ·
//   RPC-notification_send_context.definer_only
//
// New behaviour, so a new file: `tests/rls/notify-send.test.ts` is evidence for
// what the function did before and is not edited to fit what it does now.
import { afterAll, describe, expect, it } from "vitest";
import { applyProposed, errorCode, PERMISSION_DENIED, pool, withTx } from "./db";
import { seed } from "./fixture";
import type { Tx } from "./db";

afterAll(() => pool.end());

const FILE = "notify/0002_send_context_blocks_and_session.sql";

interface Context {
  template: { subject: string | null; body: string | null; locale: string; blocks: unknown | null } | null;
  session: { id: string; state: string } | null;
  member: { email: string };
}

async function setup(tx: Tx) {
  const f = await seed(tx);
  await applyProposed(tx, FILE);
  await tx.asOwner();
  await tx.q(`delete from public.notification_templates`);
  return f;
}

/** A published session of one org. The day set follows by the shim `0100`
 *  installed for exactly this — a legacy writer that inserts a window. */
async function publishedSession(tx: Tx, org: { id: string; categoryId: string; venueId: string }): Promise<string> {
  await tx.asOwner();
  const rows = await tx.q<{ id: string }>(
    `insert into public.sessions (org_id, title, abstract, category_id, level, starts_at, duration_minutes, ends_at,
                                  venue_id, capacity, rsvp_deadline_at, cancellation_cutoff_at, state, published_at)
     values ($1, 'جلسة للسياق', 'ملخص الجلسة', $2, 'introductory',
             now() + interval '48 hours', 60, now() + interval '49 hours',
             $3, 30, now() + interval '24 hours', now() + interval '24 hours',
             'published', now() - interval '1 day')
     returning id`,
    [org.id, org.categoryId, org.venueId],
  );
  return rows[0].id;
}

/** As the worker calls it — the owner stands in for `service_role`. */
const context = (tx: Tx, org: string, member: string, key: string, session?: string) =>
  tx.q<{ ctx: Context }>(
    session === undefined
      ? `select public.notification_send_context($1::uuid, $2::uuid, $3::text) as ctx`
      : `select public.notification_send_context($1::uuid, $2::uuid, $3::text, 'ar', $4::uuid) as ctx`,
    session === undefined ? [org, member, key] : [org, member, key, session],
  );

describe("RPC-notification_send_context.blocks", () => {
  it("null for a string template — every row that existed before wave 10", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      await tx.asOwner();
      await tx.q(
        `insert into public.notification_templates (org_id, key, channel, locale, subject, body, required_fields)
         values ($1, 'MSG-badge_earned', 'email', 'ar', 'شارة {{badge}}', 'مرحبًا {{member.name}}.', '{}')`,
        [f.a.id],
      );
      const [{ ctx }] = await context(tx, f.a.id, f.a.members[0].memberId, "MSG-badge_earned");
      expect(ctx.template?.body).toBe("مرحبًا {{member.name}}.");
      expect(ctx.template?.blocks).toBeNull();
    });
  });

  it("the stored document for a block template, so the worker renders a design in one round trip", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      await tx.asOwner();
      await tx.q(
        `insert into public.notification_templates (org_id, key, channel, locale, subject, body, required_fields, blocks, source_family)
         values ($1, 'MSG-badge_earned', 'email', 'ar', 'شارة {{badge}}', 'حصلت على {{badge}}.', '{}', $2::jsonb, 'recognition')`,
        [f.a.id, JSON.stringify({ schemaVersion: 1, blocks: [{ type: "heading", id: "h1", text: "مبروك", level: 1 }] })],
      );
      const [{ ctx }] = await context(tx, f.a.id, f.a.members[0].memberId, "MSG-badge_earned");
      expect(ctx.template?.blocks).toEqual({ schemaVersion: 1, blocks: [{ type: "heading", id: "h1", text: "مبروك", level: 1 }] });
      // `body` still carries the text alternative, because that is what
      // `main`'s OLD worker renders down the string path in the merge → Railway
      // window (contract 3).
      expect(ctx.template?.body).toBe("حصلت على {{badge}}.");
    });
  });

  it("null template when the org has none at all — the built-in Arabic default applies in the renderer", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      await tx.asOwner();
      const [{ ctx }] = await context(tx, f.a.id, f.a.members[0].memberId, "MSG-badge_earned");
      expect(ctx.template).toBeNull();
    });
  });
});

describe("RPC-notification_send_context.session_state — contract 8's gate", () => {
  it("no session id, no session — the three-argument call `main`'s worker makes still resolves", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      await tx.asOwner();
      const [{ ctx }] = await context(tx, f.a.id, f.a.members[0].memberId, "MSG-badge_earned");
      expect(ctx.session).toBeNull();
      // And the rest of the shape the old worker reads is intact.
      expect(ctx.member.email).toContain("@");
    });
  });

  it("the state of a session of THIS org, which is what decides whether the card's image may be sent", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      await tx.asOwner();
      const sessionId = await publishedSession(tx, f.a);
      const [{ ctx }] = await context(tx, f.a.id, f.a.members[0].memberId, "MSG-session_published", sessionId);
      expect(ctx.session?.id).toBe(sessionId);
      // The fixture's session is published; the point is that a state travels,
      // not which one — `/api/s/{id}/og` 404s for a draft or a cancelled one.
      expect(typeof ctx.session?.state).toBe("string");
      expect(ctx.session?.state.length).toBeGreaterThan(0);
    });
  });

  it("★ another org's session id yields NO session — a payload is not a capability", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      await tx.asOwner();
      // Org B's session, asked for in org A's context. Nothing about it leaks:
      // not its state, not its existence.
      const othersSession = await publishedSession(tx, f.b);
      const [{ ctx }] = await context(tx, f.a.id, f.a.members[0].memberId, "MSG-session_published", othersSession);
      expect(ctx.session).toBeNull();
    });
  });

  it("an id that is no session at all is null rather than an error — a stale payload must not dead-letter a send", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      await tx.asOwner();
      const [{ ctx }] = await context(tx, f.a.id, f.a.members[0].memberId, "MSG-session_published", "11111111-1111-4111-8111-111111111111");
      expect(ctx.session).toBeNull();
    });
  });
});

describe("RPC-notification_send_context.definer_only — the grant survived the re-create", () => {
  it("no client role may call it: it returns another member's email address", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      // DROP FUNCTION clears grants, so a re-created function that forgot to
      // re-apply them would be executable by PUBLIC. That is the failure this
      // case exists for.
      await tx.as(f.a.admin.claims);
      expect(await errorCode(() => context(tx, f.a.id, f.a.members[0].memberId, "MSG-badge_earned"))).toBe(PERMISSION_DENIED);
      await tx.as(f.a.members[0].claims);
      expect(await errorCode(() => context(tx, f.a.id, f.a.members[0].memberId, "MSG-badge_earned"))).toBe(PERMISSION_DENIED);
    });
  });
});

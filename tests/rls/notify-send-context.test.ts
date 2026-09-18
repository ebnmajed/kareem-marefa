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
  session_card_image: boolean;
  member: { email: string };
}

async function setup(tx: Tx) {
  const f = await seed(tx);
  await applyProposed(tx, FILE);
  await tx.asOwner();
  await tx.q(`delete from public.notification_templates`);
  return f;
}

/** A session of one org, in a state the caller names. The day set follows by
 *  the shim `0100` installed for exactly this — a legacy writer that inserts a
 *  window rather than a day. */
async function makeSession(tx: Tx, org: { id: string; categoryId: string; venueId: string }, state = "published"): Promise<string> {
  await tx.asOwner();
  const rows = await tx.q<{ id: string }>(
    `insert into public.sessions (org_id, title, abstract, category_id, level, starts_at, duration_minutes, ends_at,
                                  venue_id, capacity, rsvp_deadline_at, cancellation_cutoff_at, state, published_at,
                                  cancellation_reason)
     values ($1, 'جلسة للسياق', 'ملخص الجلسة', $2, 'introductory',
             now() + interval '48 hours', 60, now() + interval '49 hours',
             $3, 30, now() + interval '24 hours', now() + interval '24 hours',
             $4::public.session_state, now() - interval '1 day',
             -- sessions_check5: a cancelled session must carry its reason.
             case when $4 = 'cancelled' then 'ظرف طارئ للمقدّم' end)
     returning id`,
    [org.id, org.categoryId, org.venueId, state],
  );
  return rows[0].id;
}

/** The poster whose `og` PNG `/api/s/{id}/og` serves — the chain
 *  `session_public_card()` reads: a document, a poster bound to the session,
 *  and a READY `og`/`png` artifact with a path. */
async function readyOgPoster(tx: Tx, org: string, sessionId: string): Promise<void> {
  await tx.asOwner();
  const doc = (
    await tx.q<{ id: string }>(
      `insert into public.design_documents (org_id, purpose, document)
       values ($1, 'poster', $2::jsonb) returning id`,
      [org, JSON.stringify({ schemaVersion: 1, layers: [] })],
    )
  )[0].id;
  await tx.q(`insert into public.session_posters (org_id, session_id, document_id, mode, binding) values ($1, $2, $3, 'auto', 'live')`, [org, sessionId, doc]);
  await tx.q(
    `insert into public.export_artifacts (org_id, document_id, preset, format, status, source_fingerprint, render_context, storage_path, width_px, height_px, rendered_at)
     values ($1, $2, 'og', 'png', 'ready', 'fingerprint', '{}'::jsonb, $3, 1200, 630, now())`,
    [org, doc, `${org}/exports/${doc}/og.png`],
  );
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

describe("RPC-notification_send_context.card_image — contract 8's gate, ASKED and not copied", () => {
  it("no session id: false, and the three-argument call `main`'s worker makes still resolves", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      await tx.asOwner();
      const [{ ctx }] = await context(tx, f.a.id, f.a.members[0].memberId, "MSG-badge_earned");
      expect(ctx.session_card_image).toBe(false);
      // And the rest of the shape the old worker reads is intact.
      expect(ctx.member.email).toContain("@");
    });
  });

  it("★ a published session with a READY og artifact: true — the route will answer with bytes", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      const sessionId = await makeSession(tx, f.a);
      await readyOgPoster(tx, f.a.id, sessionId);
      const [{ ctx }] = await context(tx, f.a.id, f.a.members[0].memberId, "MSG-session_published", sessionId);
      expect(ctx.session_card_image).toBe(true);
    });
  });

  it("★ the same session with NO artifact yet: false — a poster still rendering would be a broken image, and a state check would have missed it", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      const sessionId = await makeSession(tx, f.a);
      const [{ ctx }] = await context(tx, f.a.id, f.a.members[0].memberId, "MSG-session_published", sessionId);
      expect(ctx.session_card_image).toBe(false);
    });
  });

  it("★ a CANCELLED session: false even with a ready artifact — `/api/s/{id}/og` 404s, so the cancellation mail carries no card", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      const sessionId = await makeSession(tx, f.a, "cancelled");
      await readyOgPoster(tx, f.a.id, sessionId);
      const [{ ctx }] = await context(tx, f.a.id, f.a.members[0].memberId, "MSG-session_cancelled", sessionId);
      expect(ctx.session_card_image).toBe(false);
    });
  });

  it("★ another org's session id: false — a payload is not a capability, and `session_public_card()` scopes to no org", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      const othersSession = await makeSession(tx, f.b);
      await readyOgPoster(tx, f.b.id, othersSession);
      // Eligible and rendered, and still refused: the tenancy gate is in front
      // of the public card, so a mail from one org cannot carry another's.
      const [{ ctx }] = await context(tx, f.a.id, f.a.members[0].memberId, "MSG-session_published", othersSession);
      expect(ctx.session_card_image).toBe(false);
    });
  });

  it("an id that is no session at all is false rather than an error — a stale payload must not dead-letter a send", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      await tx.asOwner();
      const [{ ctx }] = await context(tx, f.a.id, f.a.members[0].memberId, "MSG-session_published", "11111111-1111-4111-8111-111111111111");
      expect(ctx.session_card_image).toBe(false);
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

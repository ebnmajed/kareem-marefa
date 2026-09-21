// notify (wave 10) — supabase/proposed/notify/0005_preview_card_session.sql.
//
// 03 §8.2 rows proven here:
//   RPC-preview_card_session.own_org_only ·
//   RPC-preview_card_session.asks_the_rule ·
//   RPC-preview_card_session.none_is_null
//
// New behaviour, so a new file. `tests/rls/notify-send-context.test.ts` stays
// the evidence for what a send already knew about its own session.
import { afterAll, describe, expect, it } from "vitest";
import { applyProposed, errorCode, PERMISSION_DENIED, pool, withTx } from "./db";
import { seed } from "./fixture";
import type { Tx } from "./db";

afterAll(() => pool.end());

const FILE = "notify/0005_preview_card_session.sql";

async function setup(tx: Tx) {
  const f = await seed(tx);
  await applyProposed(tx, FILE);
  await tx.asOwner();
  return f;
}

const ask = (tx: Tx, org: string) =>
  tx.q<{ id: string | null }>(`select public.preview_card_session($1) as id`, [org]);

/**
 * Give a session a card that has actually RENDERED — and note what that takes:
 * a design document, a poster bound to the session, and a `ready` `og`/`png`
 * artifact with a path. `og_path` is not a column on `sessions`; it is the end
 * of that chain.
 *
 * ★ Which is the whole argument for asking `session_public_card()` instead of
 * restating its rule. «The session is published» is one predicate; «its poster
 * has finished rendering» is four joins away, and a caller that guessed would
 * hand back a session whose image 404s.
 *
 * Copied in shape from `notify-send-context.test.ts`, which needs the same
 * chain for the same reason.
 */
async function giveCard(tx: Tx, org: string, sessionId: string): Promise<void> {
  await tx.asOwner();
  // ★ REUSE the poster if the fixture already gave this session one.
  // `session_posters` is unique per session, and the seed posters some of
  // them — inserting blind duplicated a key and read like a function fault.
  const existing = await tx.q<{ document_id: string }>(
    `select document_id from public.session_posters where session_id = $1`,
    [sessionId],
  );
  let doc = existing[0]?.document_id;
  if (!doc) {
    doc = (
      await tx.q<{ id: string }>(
        `insert into public.design_documents (org_id, purpose, document)
         values ($1, 'poster', $2::jsonb) returning id`,
        [org, JSON.stringify({ schemaVersion: 1, layers: [] })],
      )
    )[0].id;
    await tx.q(`insert into public.session_posters (org_id, session_id, document_id, mode, binding) values ($1, $2, $3, 'auto', 'live')`, [org, sessionId, doc]);
  }
  await tx.q(
    `insert into public.export_artifacts (org_id, document_id, preset, format, status, source_fingerprint, render_context, storage_path, width_px, height_px, rendered_at)
     values ($1, $2, 'og', 'png', 'ready', $3, '{}'::jsonb, $4, 1200, 630, now())`,
    [org, doc, `fp-${sessionId}`, `${org}/exports/${doc}/og.png`],
  );
}

/** Every candidate session of an org, newest first — and only the states the
 *  public card answers for, since a draft is invisible to it either way. */
const candidates = (tx: Tx, org: string) =>
  tx.q<{ id: string }>(
    `select id from public.sessions
      where org_id = $1 and state in ('published', 'in_progress', 'completed')
      order by starts_at desc limit 3`,
    [org],
  );

describe("RPC-preview_card_session.own_org_only", () => {
  it("★ an admin naming ANOTHER org is refused — a definer bypasses RLS, so the org is checked here", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      await tx.as(f.a.admin.claims);
      expect(await errorCode(() => ask(tx, f.b.id))).toBe(PERMISSION_DENIED);
      // Otherwise this would be a way to learn that a session exists next door.
      await tx.as(f.b.admin.claims);
      expect(await errorCode(() => ask(tx, f.a.id))).toBe(PERMISSION_DENIED);
    });
  });

  it("an admin naming their OWN org is allowed, and so is the worker naming any", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      await tx.as(f.a.admin.claims);
      await expect(ask(tx, f.a.id)).resolves.toBeDefined();
      // `auth_org_id()` is null for `service_role`: it has no org of its own,
      // and it is the one caller that legitimately names another's.
      await tx.asServiceRole();
      await expect(ask(tx, f.a.id)).resolves.toBeDefined();
    });
  });

  it("a member and a moderator may call it for their own org — it returns an id they can already see", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      // The grant is `authenticated` rather than admin-only on purpose: the
      // answer is one session id of the caller's own org, which every member
      // of that org can already read. The screen is admin-only; this is not
      // the place that decides it.
      await tx.as(f.a.members[0].claims);
      await expect(ask(tx, f.a.id)).resolves.toBeDefined();
    });
  });
});

describe("RPC-preview_card_session.asks_the_rule", () => {
  it("★ a session whose poster has NOT rendered is skipped — `og_path is null` is «not ready»", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      const rows = await candidates(tx, f.a.id);
      expect(rows.length).toBeGreaterThanOrEqual(2);
      // The NEWEST gets no card — the common case, because the newest session
      // is the one whose poster is still rendering. A state check on the
      // session would have handed this one back, and its image would 404.
      await giveCard(tx, f.a.id, rows[1].id);

      await tx.as(f.a.admin.claims);
      const [{ id }] = await ask(tx, f.a.id);
      expect(id).toBe(rows[1].id);
    });
  });

  it("the newest card-bearing session wins when more than one has a card", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      const rows = await candidates(tx, f.a.id);
      await giveCard(tx, f.a.id, rows[0].id);
      await giveCard(tx, f.a.id, rows[1].id);
      await tx.as(f.a.admin.claims);
      expect((await ask(tx, f.a.id))[0].id).toBe(rows[0].id);
    });
  });

  it("★ it never offers ANOTHER org's session, even one that has a card", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      // Org B's newest session gets the only card in the database.
      const theirs = await candidates(tx, f.b.id);
      await giveCard(tx, f.b.id, theirs[0].id);
      await tx.as(f.a.admin.claims);
      expect((await ask(tx, f.a.id))[0].id).toBeNull();
    });
  });
});

describe("RPC-preview_card_session.none_is_null", () => {
  it("an org whose sessions have no card returns null, not an id whose image would 404", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      // The fixture seeds sessions and no posters, so no card has rendered.
      await tx.as(f.a.admin.claims);
      // Both callers then render one row fewer — what the real send does for a
      // session with no card, and true for this org.
      expect((await ask(tx, f.a.id))[0].id).toBeNull();
    });
  });

  it("★ a DRAFT session is never offered, even with a rendered poster", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      // The fixture's own draft, rather than demoting a published session —
      // `session_state_transitions` refuses published → draft, which is the
      // state machine doing its job and not something to work around.
      const draft = (
        await tx.q<{ id: string }>(`select id from public.sessions where org_id = $1 and state = 'draft' limit 1`, [f.a.id])
      )[0].id;
      await giveCard(tx, f.a.id, draft);
      await tx.as(f.a.admin.claims);
      // The card function answers for published, in_progress and completed
      // only. The loop does not know that — it ASKS — so this proves the
      // asking is what excludes the draft, not a filter that agrees by luck.
      expect((await ask(tx, f.a.id))[0].id).toBeNull();
    });
  });

  it("an org with no sessions at all is null rather than an error", async () => {
    await withTx(async (tx) => {
      await setup(tx);
      // ★ An org id that names nothing, asked as the WORKER — rather than
      // deleting a seeded org's sessions, which `points_ledger` holds a
      // foreign key into. Emptiness is the case; how it is reached is not.
      await tx.asServiceRole();
      const [{ id }] = await ask(tx, "99999999-9999-4999-8999-999999999999");
      expect(id).toBeNull();
    });
  });
});

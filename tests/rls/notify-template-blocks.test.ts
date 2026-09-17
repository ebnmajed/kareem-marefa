// notify (wave 10) — migration 0125's two columns, proven.
//
// 03 §8.2 rows proven here (reserved for this file by the lead at sync 1):
//   POL-notification_templates.blocks.shape ·
//   POL-notification_templates.blocks.admin_only
//
// The columns are the lead's (`0125`, DEC-161); what a row MEANS is this
// track's, and these are the cases that keep the two in step:
//
//   `blocks is null`      a STRING template — every row that exists today. The
//                         renderer's string path, and the pinned bytes.
//   `blocks is not null`  a BLOCK template: an object carrying `schemaVersion`
//                         and an array `blocks`.
//
// ★ WHY EVERY TEMPLATE BELOW USES ONLY OFFERED BINDINGS. This file does not
// apply `notify/0001_notification_bindings.sql` — it is about the lead's
// constraints, not about rule 4. But the moment that file is promoted, rule 4
// is in the chain for every writer, so a fixture here that typed a binding
// `MSG-badge_earned` does not offer would pass today and fail at promotion.
// The shape cases deliberately carry NO placeholder at all: a BEFORE trigger
// runs ahead of a CHECK constraint, so a malformed document with an illegal
// binding would raise 22023 and prove the wrong thing.
import { afterAll, describe, expect, it } from "vitest";
import { errorCode, PERMISSION_DENIED, pool, withTx } from "./db";
import { seed } from "./fixture";
import type { Tx } from "./db";

afterAll(() => pool.end());

async function setup(tx: Tx) {
  const f = await seed(tx);
  await tx.asOwner();
  await tx.q(`delete from public.notification_templates`);
  return f;
}

/** A legal string template for `MSG-badge_earned` — `{{badge}}` and
 *  `{{member.name}}` are both offered by that key. */
const STRING_TEMPLATE = { subject: "حصلت على شارة {{badge}}", body: "مرحبًا {{member.name}}، شارة جديدة." };

const insert = (tx: Tx, org: string, blocks: unknown, family: string | null = null) =>
  tx.q(
    `insert into public.notification_templates (org_id, key, channel, locale, subject, body, required_fields, blocks, source_family)
     values ($1, 'MSG-badge_earned', 'email', 'ar', $2, $3, '{}', $4::jsonb, $5::public.email_design_family)`,
    [org, STRING_TEMPLATE.subject, STRING_TEMPLATE.body, blocks === undefined ? null : JSON.stringify(blocks), family],
  );

describe("POL-notification_templates.blocks.shape — what a row may hold", () => {
  it("null is a string template, and every row that exists today is one", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      await tx.as(f.a.admin.claims);
      await insert(tx, f.a.id, undefined);
      const rows = await tx.q<{ blocks: unknown; source_family: string | null }>(
        `select blocks, source_family from public.notification_templates`,
      );
      expect(rows).toHaveLength(1);
      expect(rows[0].blocks).toBeNull();
      expect(rows[0].source_family).toBeNull();
    });
  });

  it("an object carrying schemaVersion and an array `blocks` is accepted", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      await tx.as(f.a.admin.claims);
      await insert(tx, f.a.id, { schemaVersion: 1, blocks: [{ type: "divider", id: "r1" }] }, "recognition");
      const rows = await tx.q<{ n: number; family: string }>(
        `select jsonb_array_length(blocks -> 'blocks')::int as n, source_family::text as family from public.notification_templates`,
      );
      expect(rows[0]).toEqual({ n: 1, family: "recognition" });
    });
  });

  it("an empty block list is legal — a design being started is not a malformed one", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      await tx.as(f.a.admin.claims);
      await insert(tx, f.a.id, { schemaVersion: 1, blocks: [] });
      expect(await tx.q(`select id from public.notification_templates`)).toHaveLength(1);
    });
  });

  it("anything that is not that shape is refused 23514 — no bare array, no scalar, no missing version, no non-array blocks", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      await tx.as(f.a.admin.claims);
      // A bare array: the document is an OBJECT, so a client that sent the list
      // alone would otherwise store something the renderer cannot read.
      expect(await errorCode(() => insert(tx, f.a.id, [{ type: "divider", id: "r1" }]))).toBe("23514");
      expect(await errorCode(() => insert(tx, f.a.id, "blocks"))).toBe("23514");
      expect(await errorCode(() => insert(tx, f.a.id, 7))).toBe("23514");
      // No `schemaVersion`: a document with no version is a document nothing
      // can migrate later.
      expect(await errorCode(() => insert(tx, f.a.id, { blocks: [] }))).toBe("23514");
      // `blocks` present but not an array.
      expect(await errorCode(() => insert(tx, f.a.id, { schemaVersion: 1, blocks: { type: "divider" } }))).toBe("23514");
    });
  });

  // ★ FOUND BY THIS FILE, and not asserted here because asserting today's
  // behaviour would PIN a defect. `{"schemaVersion":1}` — no `blocks` key at
  // all — is ACCEPTED by `0125`'s constraint: `blocks -> 'blocks'` is SQL NULL,
  // so `jsonb_typeof(NULL)` is NULL, the conjunction is NULL, the disjunction
  // is NULL, and **a CHECK constraint fails only on FALSE**. Measured against
  // the live predicate, not reasoned about. The constraint is the lead's
  // (`supabase/migrations/**`); the one-line fix — `blocks ? 'blocks' and …` —
  // is in `docs/plan/notes/notify.md` §X0.3, and this becomes an `it` in the
  // commit that lands it.
  it.todo("refuses an object with no `blocks` key at all (0125's check evaluates to NULL — see §X0.3)");

  it("a document beyond 200,000 characters is refused 23514", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      await tx.as(f.a.admin.claims);
      // No placeholder anywhere in it, so the size check is what fires.
      const fat = { schemaVersion: 1, blocks: [{ type: "heading", id: "h1", level: 1, text: "ا".repeat(200_000) }] };
      expect(await errorCode(() => insert(tx, f.a.id, fat))).toBe("23514");
    });
  });

  it("source_family without blocks is refused — provenance of nothing is not a state", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      await tx.as(f.a.admin.claims);
      expect(await errorCode(() => insert(tx, f.a.id, undefined, "reminder"))).toBe("23514");
      // And it is refused on an UPDATE that would leave the pair inconsistent.
      await insert(tx, f.a.id, { schemaVersion: 1, blocks: [] }, "reminder");
      expect(
        await errorCode(() => tx.q(`update public.notification_templates set blocks = null where key = 'MSG-badge_earned'`)),
      ).toBe("23514");
    });
  });

  it("the eight families of DEC-082 are the enum's values, in order, and nothing else is one", async () => {
    await withTx(async (tx) => {
      await setup(tx);
      const rows = await tx.q<{ v: string }>(
        `select e.enumlabel as v from pg_enum e join pg_type t on t.oid = e.enumtypid
          where t.typname = 'email_design_family' order by e.enumsortorder`,
      );
      expect(rows.map((r) => r.v)).toEqual([
        "announcement",
        "reminder",
        "rsvp",
        "rescheduled",
        "cancelled",
        "rating",
        "certificate",
        "recognition",
      ]);
    });
  });
});

describe("POL-notification_templates.blocks.admin_only — who may write a design", () => {
  it("the org's own admin writes blocks and source_family; a moderator, a member and the other org's admin cannot", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);

      await tx.as(f.a.admin.claims);
      await insert(tx, f.a.id, { schemaVersion: 1, blocks: [{ type: "divider", id: "r1" }] }, "recognition");

      // A moderator is not an admin: `p2_admin_*` is `is_org_admin()`, and the
      // studio is an admin surface (03 §5.9).
      await tx.as(f.a.mod.claims);
      expect(await tx.q(`select id from public.notification_templates`)).toEqual([]);
      expect(
        await errorCode(() => tx.q(`update public.notification_templates set blocks = '{"schemaVersion":1,"blocks":[]}'::jsonb`)),
      ).toBeNull(); // no rows visible: the update matches nothing rather than raising
      expect(await errorCode(() => insert(tx, f.a.id, { schemaVersion: 1, blocks: [] }))).toBe(PERMISSION_DENIED);

      await tx.as(f.a.members[0].claims);
      expect(await errorCode(() => insert(tx, f.a.id, { schemaVersion: 1, blocks: [] }))).toBe(PERMISSION_DENIED);

      // Another org's admin cannot reach into this org, and sees nothing.
      await tx.as(f.b.admin.claims);
      expect(await tx.q(`select id from public.notification_templates`)).toEqual([]);
      expect(await errorCode(() => insert(tx, f.b.admin.claims.org_id === f.a.id ? f.b.id : f.a.id, { schemaVersion: 1, blocks: [] }))).toBe(PERMISSION_DENIED);

      // The row is untouched by all of that.
      await tx.as(f.a.admin.claims);
      const rows = await tx.q<{ n: number }>(`select jsonb_array_length(blocks -> 'blocks')::int as n from public.notification_templates`);
      expect(rows[0].n).toBe(1);
    });
  });

  it("the column grant names exactly the eight writable columns — invariant 6, and org_id is not one of them", async () => {
    await withTx(async (tx) => {
      await setup(tx);
      const rows = await tx.q<{ column_name: string }>(
        `select column_name from information_schema.column_privileges
          where table_schema = 'public' and table_name = 'notification_templates'
            and grantee = 'authenticated' and privilege_type = 'UPDATE'
          order by column_name`,
      );
      expect(rows.map((r) => r.column_name)).toEqual([
        "blocks",
        "body",
        "channel",
        "key",
        "locale",
        "required_fields",
        "source_family",
        "subject",
      ]);
    });
  });

  it("an admin cannot move a template to another org through the update path — org_id is outside the grant", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      await tx.as(f.a.admin.claims);
      await insert(tx, f.a.id, { schemaVersion: 1, blocks: [] }, "recognition");
      expect(await errorCode(() => tx.q(`update public.notification_templates set org_id = $1`, [f.b.id]))).toBe(PERMISSION_DENIED);
    });
  });

  // ★ THE CASE THAT SETTLES A LIVE DEFECT IN `saveTemplate()`.
  //
  // Postgres checks an UPDATE privilege on the COLUMN, not on the value, so
  // naming `org_id` in the SET list is `42501` **even when the value written is
  // the row's own**. `src/lib/dal/notifications.ts` built ONE payload object
  // carrying `org_id` and used it for both the insert and the update, so the
  // second save of a template returned «not_permitted» — editing an existing
  // email template has never worked. `wave8-console-emails.spec.ts` could not
  // catch it: its save case saves ONCE into an org with no row, then restores
  // by DELETE.
  //
  // The fix is to keep `org_id` in the insert and out of the update; this is
  // the assertion that says why, and that would fail if anyone put it back.
  it("★ naming org_id in an update is refused even when the value is the row's own — the privilege is on the column", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      await tx.as(f.a.admin.claims);
      // `undefined`, not `null`: the helper stringifies what it is given, and
      // JSON `null` is a jsonb value the shape check rightly refuses. SQL NULL
      // is the string template.
      await insert(tx, f.a.id, undefined);

      // The DAL's old payload, verbatim in shape: org_id beside the writable columns.
      expect(
        await errorCode(() =>
          tx.q(`update public.notification_templates set org_id = $1, subject = $2, body = $3 where key = 'MSG-badge_earned'`, [
            f.a.id,
            "شارة {{badge}}",
            "مرحبًا {{member.name}}، تحديث.",
          ]),
        ),
      ).toBe(PERMISSION_DENIED);

      // The same update WITHOUT org_id is the one the DAL sends now, and it saves.
      await tx.q(`update public.notification_templates set subject = $1, body = $2 where key = 'MSG-badge_earned'`, [
        "شارة {{badge}}",
        "مرحبًا {{member.name}}، تحديث.",
      ]);
      const rows = await tx.q<{ subject: string }>(`select subject from public.notification_templates`);
      expect(rows[0].subject).toBe("شارة {{badge}}");
    });
  });
});

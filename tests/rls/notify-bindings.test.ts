// notify (wave 10, N3) — supabase/proposed/notify/0001_notification_bindings.sql:
// bindings declared per message key, and refused by the DATABASE for every
// writer (REQ-NTF-012, DEC-081, 16 §11.3).
//
// 03 §8.2 rows proven here:
//   RPC-notification_bindings.total · RPC-notification_bindings.defaults_are_legal ·
//   POL-notification_templates.unknown_binding ·
//   POL-notification_templates.blocks_bindings ·
//   POL-notification_templates.in_app_unchecked
//
// ★ WHY `applyProposed` COMES AFTER `seed()` IN EVERY CASE BELOW.
// `tests/rls/fixture-m3.ts` seeds a `MSG-session_published` template whose body
// interpolates `{{session.title}}` — a binding the key does not offer and the
// payload has never carried, so it renders BLANK in a real mail. Under rule 4
// that insert is refused, and since the M3 fixture is seeded by most of the RLS
// suite, promoting this file before that line is corrected would fail far more
// than this test. The fixture is the lead's file; the one-line request is in
// `docs/plan/notes/notify.md`. Applying the rule after the seed keeps this file
// honest in the meantime, and the ordering becomes irrelevant the moment the
// fixture is fixed.
import { afterAll, describe, expect, it } from "vitest";
import { applyProposed, errorCode, withTx } from "./db";
import { seed } from "./fixture";
import type { Tx } from "./db";
import { DEFAULT_TEMPLATES } from "@kareem/mail-runtime";

afterAll(async () => {
  const { pool } = await import("./db");
  await pool.end();
});

const FILE = "notify/0001_notification_bindings.sql";

async function setup(tx: Tx) {
  const f = await seed(tx);
  await applyProposed(tx, FILE);
  await tx.asOwner();
  await tx.q(`delete from public.notification_templates`);
  return f;
}

/** The writer the screen uses: the org's own admin, through RLS. */
const saveAsAdmin = (
  tx: Tx,
  org: string,
  values: { key: string; channel?: string; subject: string | null; body: string; fields?: string[]; blocks?: object | null },
) =>
  tx.q(
    `insert into public.notification_templates (org_id, key, channel, locale, subject, body, required_fields, blocks)
     values ($1, $2, $3::public.notify_channel, 'ar', $4, $5, $6, $7::jsonb)`,
    [org, values.key, values.channel ?? "email", values.subject, values.body, values.fields ?? [], values.blocks ? JSON.stringify(values.blocks) : null],
  );

const blockDoc = (...blocks: object[]) => ({ schemaVersion: 1, blocks });

describe("notification_bindings — REQ-NTF-012's declaration", () => {
  it("total: every message with an email channel offers at least the three the renderer injects, and no key offers one twice", async () => {
    await withTx(async (tx) => {
      await setup(tx);
      const rows = await tx.q<{ key: string; binding: string }>(`select key, binding from public.notification_bindings()`);
      const emailKeys = await tx.q<{ key: string }>(`select key from public.notification_matrix() where email`);
      // 25, plus MSG-announcement_published (0213, DEC-267).
      expect(emailKeys).toHaveLength(26);

      const byKey = new Map<string, string[]>();
      for (const r of rows) byKey.set(r.key, [...(byKey.get(r.key) ?? []), r.binding]);
      for (const { key } of emailKeys) {
        const offered = byKey.get(key) ?? [];
        expect(offered, key).toEqual(expect.arrayContaining(["member.name", "member.email", "org"]));
        // A duplicate would be harmless to the trigger and a mess in the
        // editor's list, which renders one checkbox per row.
        expect(new Set(offered).size, key).toBe(offered.length);
      }
      // Nothing is declared for a key with no email channel: the rule is
      // email-only, so a row there would be a promise nothing keeps.
      const stray = [...byKey.keys()].filter((key) => !emailKeys.some((k) => k.key === key));
      expect(stray).toEqual([]);
    });
  });

  it("★ defaults_are_legal — every binding the built-in Arabic templates interpolate is offered by the key that uses it", async () => {
    await withTx(async (tx) => {
      await setup(tx);
      const rows = await tx.q<{ key: string; binding: string }>(`select key, binding from public.notification_bindings()`);
      // A SPACE is the separator, and it is unambiguous: a key matches
      // `MSG-[a-z0-9_]+` and a binding `[\w.]+`, so neither can contain one.
      const offered = new Set(rows.map((r) => `${r.key} ${r.binding}`));

      // The platform ships both the rule and the text it refuses. If these ever
      // part, an org saving the default template it was shown would be told its
      // own default is invalid.
      const violations: string[] = [];
      for (const [key, template] of Object.entries(DEFAULT_TEMPLATES)) {
        const used = new Set([...`${template.subject} ${template.body}`.matchAll(/\{\{\s*([\w.]+)\s*\}\}/g)].map((m) => m[1]));
        for (const binding of used) if (!offered.has(`${key} ${binding}`)) violations.push(`${key}: {{${binding}}}`);
      }
      expect(violations).toEqual([]);
    });
  });
});

describe("POL-notification_templates.unknown_binding — the refusal is the database's", () => {
  it("as the org admin: a binding the key does not offer is refused 22023, in the body and in the subject alike", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      await tx.as(f.a.admin.claims);

      // `MSG-rating_prompt` offers session_id, title and url — not `venue`.
      expect(
        await errorCode(() => saveAsAdmin(tx, f.a.id, { key: "MSG-rating_prompt", subject: "كيف كانت الجلسة؟", body: "حضرت «{{title}}» في {{venue}}." })),
      ).toBe("22023");

      expect(
        await errorCode(() => saveAsAdmin(tx, f.a.id, { key: "MSG-rating_prompt", subject: "رأيك في {{venue}}", body: "حضرت «{{title}}»." })),
      ).toBe("22023");

      // The same template with an offered binding saves.
      await saveAsAdmin(tx, f.a.id, { key: "MSG-rating_prompt", subject: "كيف كانت جلسة {{title}}؟", body: "مرحبًا {{member.name}}، رأيك يهمنا: {{url}}" });
      expect(await tx.q(`select id from public.notification_templates`)).toHaveLength(1);
    });
  });

  it("it is the OWNER's rule too, not only the admin's — a definer writer meets it", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      await tx.asOwner();
      expect(
        await errorCode(() => saveAsAdmin(tx, f.a.id, { key: "MSG-badge_earned", subject: "شارة", body: "حصلت على {{badge}} في {{venue}}." })),
      ).toBe("22023");
    });
  });

  it("an update is refused as an insert is — the trigger is `before insert or update`", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      await tx.as(f.a.admin.claims);
      await saveAsAdmin(tx, f.a.id, { key: "MSG-badge_earned", subject: "شارة {{badge}}", body: "مرحبًا {{member.name}}." });
      expect(
        await errorCode(() => tx.q(`update public.notification_templates set body = 'مرحبًا {{nope}}' where key = 'MSG-badge_earned'`)),
      ).toBe("22023");
    });
  });
});

describe("POL-notification_templates.blocks_bindings — the scan reaches inside the blocks", () => {
  it("a paragraph's placeholder, a button's urlBinding, a detail row and an image's alt are each checked", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      await tx.as(f.a.admin.claims);
      const base = { key: "MSG-reminder_1d", subject: "غدًا: {{title}}", body: "مرحبًا {{member.name}}." };

      // A paragraph.
      expect(
        await errorCode(() => saveAsAdmin(tx, f.a.id, { ...base, blocks: blockDoc({ type: "paragraph", id: "p1", text: "نراك في {{building}}." }) })),
      ).toBe("22023");

      // A button's URL is a bare binding NAME, not a placeholder.
      expect(
        await errorCode(() => saveAsAdmin(tx, f.a.id, { ...base, blocks: blockDoc({ type: "button", id: "b1", label: "افتح الجلسة", urlBinding: "deep_link", style: "primary" }) })),
      ).toBe("22023");

      // A detail row's value.
      expect(
        await errorCode(() =>
          saveAsAdmin(tx, f.a.id, { ...base, blocks: blockDoc({ type: "detail_list", id: "d1", items: [{ label: "المكان", value: "{{room}}" }] }) }),
        ),
      ).toBe("22023");

      // An image's alt text.
      expect(
        await errorCode(() => saveAsAdmin(tx, f.a.id, { ...base, blocks: blockDoc({ type: "image", id: "i1", src: { kind: "org_logo" }, alt: "شعار {{tenant}}", width: 160 }) })),
      ).toBe("22023");
    });
  });

  it("a block document whose every binding is offered saves, and an empty urlBinding is a checks-panel matter rather than a refusal", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      await tx.as(f.a.admin.claims);
      await saveAsAdmin(tx, f.a.id, {
        key: "MSG-reminder_1d",
        subject: "غدًا: {{title}}",
        body: "مرحبًا {{member.name}}.",
        blocks: blockDoc(
          { type: "heading", id: "h1", text: "جلستك غدًا", level: 1 },
          { type: "paragraph", id: "p1", text: "{{day}} — نراك في {{venue}}." },
          { type: "detail_list", id: "d1", items: [{ label: "الموعد", value: "{{startsAt}}" }] },
          { type: "button", id: "b1", label: "افتح الجلسة", urlBinding: "url", style: "primary" },
          // A draft whose link is not chosen yet still saves.
          { type: "button", id: "b2", label: "زر بلا رابط بعد", urlBinding: "", style: "secondary" },
          { type: "divider", id: "r1" },
        ),
      });
      const rows = await tx.q<{ n: number }>(`select jsonb_array_length(blocks -> 'blocks')::int as n from public.notification_templates`);
      expect(rows[0].n).toBe(6);
    });
  });
});

describe("POL-notification_templates.in_app_unchecked, and 0026's three rules after the re-create", () => {
  it("an in_app template is not subject to the binding rule — nothing reads one, and its key may have no email channel at all", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      await tx.as(f.a.admin.claims);
      // MSG-photo_hidden is in_app ONLY, so it has no declared bindings; under
      // an email-wide rule every in-app template would be refused.
      await saveAsAdmin(tx, f.a.id, { key: "MSG-photo_hidden", channel: "in_app", subject: null, body: "أُخفيت صورتك في {{whatever}}." });
      expect(await tx.q(`select id from public.notification_templates`)).toHaveLength(1);
    });
  });

  it("the three rules 0026 shipped still refuse exactly what they refused", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      await tx.as(f.a.admin.claims);

      // 1 — a key outside 08 §1.
      expect(await errorCode(() => saveAsAdmin(tx, f.a.id, { key: "MSG-not-a-message", subject: "س", body: "ن" }))).toBe("22023");
      // 2 — a channel the matrix does not give this key. MSG-photo_hidden has
      // no email channel.
      expect(await errorCode(() => saveAsAdmin(tx, f.a.id, { key: "MSG-photo_hidden", subject: "س", body: "ن" }))).toBe("22023");
      // 3 — a declared required field the text omits, with the field NAMED:
      // `saveTemplateChecked()` parses that message to put the refusal at the
      // field, so its shape is part of the contract.
      const message = await tx
        .q(`insert into public.notification_templates (org_id, key, channel, locale, subject, body, required_fields)
            values ($1, 'MSG-badge_earned', 'email', 'ar', 'شارة', 'مرحبًا', '{badge}')`, [f.a.id])
        .then(() => null)
        .catch((e: Error) => e.message);
      expect(message).toContain("missing_required_field: badge");
    });
  });
});

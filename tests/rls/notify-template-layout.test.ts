// notify (wave 23, `REQ-NTF-015`, `REQ-NTF-012`) — the row overlay keeps every
// block where the DATABASE can see it.
//
// 03 §8.2 rows proven here, with no function changed:
//   POL-notification_templates.unknown_binding (a block inside a column) ·
//   POL-notification_templates.blocks_bindings (the five new types' fields)
//
// ★ WHY THIS FILE EXISTS. `bindings_in_blocks()` (`0133`) walks only the
// top-level `blocks` array. A document that NESTED blocks inside rows would put
// every block in a column out of its sight, and an undeclared binding there
// would save. The wave-23 document keeps `blocks` flat and makes `rows` an
// overlay that only names ids — so the trigger still sees everything. This is
// the database saying so, as an org admin writes through RLS.
import { afterAll, describe, expect, it } from "vitest";
import { errorCode, pool, withTx } from "./db";
import { seed } from "./fixture";
import type { Tx } from "./db";

afterAll(() => pool.end());

async function setup(tx: Tx) {
  const f = await seed(tx);
  await tx.asOwner();
  await tx.q(`delete from public.notification_templates`);
  return f;
}

/** `MSG-reminder_1d` offers `url`, `title` and `member.name`, never `nope`. */
const insert = (tx: Tx, org: string, blocks: unknown) =>
  tx.q(
    `insert into public.notification_templates (org_id, key, channel, locale, subject, body, required_fields, blocks)
     values ($1, 'MSG-reminder_1d', 'email', 'ar', 'غدًا: {{title}}', 'نص', '{}', $2::jsonb)`,
    [org, JSON.stringify(blocks)],
  );

const columns = (inColumn: object) => ({
  schemaVersion: 1,
  blocks: [{ type: "paragraph", id: "a", text: "مرحبًا {{member.name}}" }, inColumn],
  rows: [{ id: "r", layout: "1/2", columns: [["a"], [(inColumn as { id: string }).id]] }],
  styles: { padding: 32, textColour: "fgMuted" },
});

describe("★ a block in a column is still checked by the database", () => {
  it("a legal two-column document with styles saves", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      await tx.as(f.a.admin.claims);
      await insert(tx, f.a.id, columns({ type: "paragraph", id: "b", text: "{{title}}" }));
      const rows = await tx.q<{ blocks: { rows: unknown[] } }>(`select blocks from public.notification_templates`);
      expect(rows[0].blocks.rows).toHaveLength(1);
    });
  });

  it("an undeclared binding in the END column is refused, naming it", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      await tx.as(f.a.admin.claims);
      expect(await errorCode(() => insert(tx, f.a.id, columns({ type: "paragraph", id: "b", text: "{{nope}}" })))).toBe("22023");
    });
  });

  it.each([
    ["a QR's urlBinding", { type: "qr", id: "b", label: "امسح", urlBinding: "nope", alt: "رمز", size: "md" }],
    ["a QR's label", { type: "qr", id: "b", label: "{{nope}}", urlBinding: "url", alt: "رمز", size: "md" }],
    ["a poster's alt", { type: "poster", id: "b", alt: "{{nope}}" }],
    ["a certificate's label", { type: "certificate", id: "b", label: "{{nope}}" }],
    ["a social link's value", { type: "social", id: "b", items: [{ label: "X", value: "{{nope}}" }] }],
  ])("★ %s, in a column, reaches the scanner with no function changed", async (_name, block) => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      await tx.as(f.a.admin.claims);
      expect(await errorCode(() => insert(tx, f.a.id, columns(block)))).toBe("22023");
    });
  });
});

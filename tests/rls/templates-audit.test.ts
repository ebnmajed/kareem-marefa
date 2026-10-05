// Wave 23 — the template library, audited in the database (0191, DEC-238 §1, REQ-ADM-023, REQ-UIX-108, STORY-UIX-098).
//
// Every act is written AS THE ORG ADMIN MEMBER — the screen's own writes, under the table's policies — and the log is
// read as the owner. What is proven: each act writes its row with the admin as actor; ★ «set default» writes exactly
// ONE row although the previous default is cleared in the same statement; a template's first version is said by
// `.created`, never `.published` too; retiring the default writes the retirement alone; `updated_at` alone writes
// nothing; a moderator's write matches no row and writes no row; a platform template writes nothing here.
import { afterAll, describe, expect, it } from "vitest";
import { pool, withTx, type Tx } from "./db";
import { seed } from "./fixture";

afterAll(() => pool.end());

type Row = { action: string; actor_id: string | null; subject_id: string; before: Record<string, unknown> | null; after: Record<string, unknown> | null };

const DOC = JSON.stringify({
  schemaVersion: 1,
  purpose: "certificate",
  master: { width: 3508, height: 2480, unit: "px", dpi: 300 },
  direction: "rtl",
  background: { type: "solid", color: "{{brand.canvas}}" },
  layers: [],
});

async function since(tx: Tx, orgId: string, marker: string): Promise<Row[]> {
  await tx.asOwner();
  return tx.q<Row>(
    `select action, actor_id, subject_id, before, after from public.audit_log
      where org_id = $1 and action like 'design_template.%' and occurred_at > $2::timestamptz
      order by occurred_at, action`,
    [orgId, marker],
  );
}

async function mark(tx: Tx): Promise<string> {
  const [{ now }] = await tx.q<{ now: string }>(`select clock_timestamp()::text as now`);
  return now;
}

/** Create as the screen does: the template, then its first version, published. */
async function create(tx: Tx, orgId: string, memberId: string, name: string, family = "attendance", duplicatedFrom: string | null = null) {
  const [{ id }] = await tx.q<{ id: string }>(
    `insert into public.design_templates (org_id, scope, purpose, family, name, created_by, duplicated_from)
     values ($1, 'org', 'certificate', $2, $3, $4, $5) returning id`,
    [orgId, family, name, memberId, duplicatedFrom],
  );
  await tx.q(`insert into public.design_template_versions (template_id, version, document, published_at, published_by) values ($1, 1, $2::jsonb, now(), $3)`, [
    id,
    DOC,
    memberId,
  ]);
  return id;
}

describe("REQ-ADM-023 — the template library (0191)", () => {
  it("create writes .created with the admin as actor, and its first version writes no .published", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      const m = await mark(tx);
      await tx.as(f.a.admin.claims);
      const id = await create(tx, f.a.id, f.a.admin.memberId, "ورقي");
      const rows = await since(tx, f.a.id, m);
      expect(rows.map((r) => r.action)).toEqual(["design_template.created"]);
      expect(rows[0]).toMatchObject({ actor_id: f.a.admin.memberId, subject_id: id, before: null });
      expect(rows[0].after).toEqual({ purpose: "certificate", family: "attendance", name: "ورقي", duplicated_from: null });
    });
  });

  it("a copy writes .created naming its source; publishing v2 writes .published with the version", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await tx.as(f.a.admin.claims);
      const source = await create(tx, f.a.id, f.a.admin.memberId, "ورقي");
      const m = await mark(tx);
      await tx.as(f.a.admin.claims);
      const copy = await create(tx, f.a.id, f.a.admin.memberId, "ورقي — نسخة", "attendance", source);
      await tx.q(`insert into public.design_template_versions (template_id, version, document, published_at, published_by) values ($1, 2, $2::jsonb, now(), $3)`, [
        copy,
        DOC,
        f.a.admin.memberId,
      ]);
      const rows = await since(tx, f.a.id, m);
      expect(rows.map((r) => r.action)).toEqual(["design_template.created", "design_template.published"]);
      expect(rows[0].after).toMatchObject({ duplicated_from: source });
      expect(rows[1]).toMatchObject({ subject_id: copy, actor_id: f.a.admin.memberId });
      expect(rows[1].after).toMatchObject({ version: 2 });
    });
  });

  it("a version published LATER — `published_at` set from null by an update — writes .published, whatever its number", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await tx.as(f.a.admin.claims);
      const id = await create(tx, f.a.id, f.a.admin.memberId, "ورقي");
      // `authenticated` has no update grant on versions (immutable once published, 0055), so the later publish is a
      // database path — written here as the owner, which is how such a row is ever written.
      await tx.asOwner();
      const [{ id: versionId }] = await tx.q<{ id: string }>(
        `insert into public.design_template_versions (template_id, version, document) values ($1, 2, $2::jsonb) returning id`,
        [id, DOC],
      );
      const m = await mark(tx);
      expect(await since(tx, f.a.id, m)).toEqual([]);
      await tx.asOwner();
      await tx.q(`update public.design_template_versions set published_at = now() where id = $1`, [versionId]);
      const rows = await since(tx, f.a.id, m);
      expect(rows.map((r) => r.action)).toEqual(["design_template.published"]);
      expect(rows[0]).toMatchObject({ subject_id: id });
      expect(rows[0].after).toMatchObject({ version: 2, version_id: versionId });
    });
  });

  it("★ set default writes EXACTLY ONE row, on the new default — the cleared previous default writes nothing", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await tx.as(f.a.admin.claims);
      const first = await create(tx, f.a.id, f.a.admin.memberId, "ورقي");
      const second = await create(tx, f.a.id, f.a.admin.memberId, "كلاسيكي");
      await tx.q(`update public.design_templates set is_default = true where id = $1`, [first]);
      const m = await mark(tx);
      await tx.as(f.a.admin.claims);
      await tx.q(`update public.design_templates set is_default = true where id = $1`, [second]);
      const rows = await since(tx, f.a.id, m);
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ action: "design_template.default_set", subject_id: second, actor_id: f.a.admin.memberId });
      expect(rows[0].after).toEqual({ purpose: "certificate", family: "attendance" });
      // …and the schema still holds one default per kind (0055:102-105).
      const [{ n }] = await tx.q<{ n: string }>(`select count(*)::text as n from public.design_templates where org_id = $1 and purpose = 'certificate' and family = 'attendance' and is_default`, [f.a.id]);
      expect(n).toBe("1");
    });
  });

  it("rename writes .renamed with both names; retiring the default writes .retired alone; restore writes .restored", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await tx.as(f.a.admin.claims);
      const id = await create(tx, f.a.id, f.a.admin.memberId, "ورقي");
      await tx.q(`update public.design_templates set is_default = true where id = $1`, [id]);
      const m = await mark(tx);
      await tx.as(f.a.admin.claims);
      await tx.q(`update public.design_templates set name = 'ورقي A4' where id = $1`, [id]);
      // What `retireTemplate()` writes: the retirement and the cleared flag in one statement.
      await tx.q(`update public.design_templates set retired_at = now(), is_default = false where id = $1`, [id]);
      await tx.q(`update public.design_templates set retired_at = null where id = $1`, [id]);
      const rows = await since(tx, f.a.id, m);
      expect(rows.map((r) => r.action)).toEqual(["design_template.renamed", "design_template.retired", "design_template.restored"]);
      expect(rows[0].before).toEqual({ name: "ورقي" });
      expect(rows[0].after).toEqual({ name: "ورقي A4" });
      expect(new Set(rows.map((r) => r.actor_id))).toEqual(new Set([f.a.admin.memberId]));
    });
  });

  it("updated_at alone writes nothing; a moderator's update matches no row and writes no row", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await tx.as(f.a.admin.claims);
      const id = await create(tx, f.a.id, f.a.admin.memberId, "ورقي");
      const m = await mark(tx);
      await tx.as(f.a.admin.claims);
      await tx.q(`update public.design_templates set updated_at = now() where id = $1`, [id]);
      await tx.as(f.a.mod.claims);
      const touched = await tx.q(`update public.design_templates set name = 'محاولة' where id = $1 returning id`, [id]);
      expect(touched).toHaveLength(0);
      expect(await since(tx, f.a.id, m)).toEqual([]);
    });
  });

  it("a platform template's change writes nothing in an org's log", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      const m = await mark(tx);
      await tx.asOwner();
      // ★ LEDGER C-6 (wave 27, PR D): a platform row exists only retired now, and the chain leaves no platform
      // certificate at all — so the change is made to every platform row there is (the fixture's retired poster), and
      // the case asserts it touched one, which it could not prove before. Selector widened; expectation added.
      const touched = await tx.q(`update public.design_templates set name = name || ' ' where scope = 'platform' returning id`);
      expect(touched.length).toBeGreaterThan(0);
      const [{ n }] = await tx.q<{ n: string }>(
        `select count(*)::text as n from public.audit_log where action like 'design_template.%' and occurred_at > $1::timestamptz`,
        [m],
      );
      expect(n).toBe("0");
      expect(f.a.id).toBeTruthy();
    });
  });
});

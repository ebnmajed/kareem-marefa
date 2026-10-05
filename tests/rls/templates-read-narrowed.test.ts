// Who may still read a platform template once there is no platform library — REQ-DSG-035, REQ-CRT-014, DEC-254 §3.4,
// DEC-255 (D5). The lead's policy half of M2, promoted as `0210_platform_rows_read.sql` after `0209`.
//
// ★ A platform row is readable by an org ONLY while a row of that org names it — a certificate, a design document or a
// session's certificate design — and by no other org. ★★ And the reason it must stay readable is not only the studio
// opening an old document: `design_documents_guard` (0055:517) is an INVOKER trigger, and when it cannot see a
// document's template version it returns early and enforces no locked region. The last case holds that.
import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { errorCode, errorMessage, pool, withTx, type Tx } from "./db";
import { removal, world } from "./templates-world";

afterAll(() => pool.end());

async function removed(tx: Tx) {
  // ★ LEDGER (wave 27, PR D): 0209 and 0210 are promoted — the policies are the chain's; the world 0209 met is rebuilt
  // and 0209's sections 1 – 3 run against it (`templates-world.ts`), which leaves exactly the referenced rows, retired.
  const w = await world(tx);
  await removal(tx);
  return w;
}

const visible = async (tx: Tx, templateId: string) => ({
  template: (await tx.q(`select id from public.design_templates where id = $1`, [templateId])).length,
  versions: (await tx.q(`select id from public.design_template_versions where template_id = $1`, [templateId])).length,
});

describe("POL-design_templates.read.platform_only_if_referenced", () => {
  it("★ a platform row my certificate, my document or my session design names is readable, with its versions — by me alone", async () => {
    await withTx(async (tx) => {
      const w = await removed(tx);
      // The certificate's, the document's and the LOCKED design's (0010 left those three, retired).
      for (const id of [w.attendance.template_id, w.talk.template_id, w.attendancePortrait.template_id]) {
        await tx.as(w.f.a.admin.claims);
        const mine = await visible(tx, id);
        expect(mine.template, id).toBe(1);
        expect(mine.versions, id).toBeGreaterThan(0);
        // Another org's reference never opens it to me — nor mine to them.
        await tx.as(w.f.b.admin.claims);
        expect(await visible(tx, id), id).toEqual({ template: 0, versions: 0 });
      }
    });
  });

  it("an unreferenced platform row is invisible — and an org's own templates are untouched", async () => {
    await withTx(async (tx) => {
      const w = await removed(tx);
      await tx.asOwner();
      // A retired platform row nothing names (the constraint below forbids a live one).
      const [{ id }] = await tx.q<{ id: string }>(
        `insert into public.design_templates (org_id, scope, purpose, family, name, retired_at) values (null, 'platform', 'poster', 'panel', 'يتيم', now()) returning id`,
      );
      await tx.q(`insert into public.design_template_versions (template_id, version, document, published_at) values ($1, 1, '{"schemaVersion":1,"layers":[]}'::jsonb, now())`, [id]);
      await tx.as(w.f.a.admin.claims);
      expect(await visible(tx, id)).toEqual({ template: 0, versions: 0 });
      const [{ n }] = await tx.q<{ n: number }>(`select count(*)::int as n from public.design_templates where org_id = $1`, [w.f.a.id]);
      expect(n).toBeGreaterThanOrEqual(11);
      // The read is the org's, as `templates_read` always was — the screens gate staff, the policy gates the org.
      await tx.as(w.f.a.members[1]!.claims);
      expect((await visible(tx, w.attendance.template_id)).template).toBe(1);
    });
  });
});

describe("FN-template_referenced_by_my_org.own_org_only", () => {
  it("answers for the caller's org alone, and false with no session", async () => {
    await withTx(async (tx) => {
      const w = await removed(tx);
      const ask = async () => (await tx.q<{ r: boolean }>(`select public.template_referenced_by_my_org($1) as r`, [w.attendance.template_id]))[0]!.r;
      await tx.as(w.f.a.admin.claims);
      expect(await ask()).toBe(true);
      await tx.as(w.f.b.admin.claims);
      expect(await ask()).toBe(false);
      await tx.asOwner();
      expect(await ask()).toBe(false);
      await tx.asAnon();
      expect(await errorMessage(() => ask())).toMatch(/permission denied/);
    });
  });
});

describe("CHK-design_templates.platform_retired (D5)", () => {
  it("a live platform row is refused, on insert and on update — not even the owner's hand makes one", async () => {
    await withTx(async (tx) => {
      const w = await removed(tx);
      await tx.asOwner();
      expect(
        await errorCode(() =>
          tx.q(`insert into public.design_templates (org_id, scope, purpose, family, name) values (null, 'platform', 'poster', 'talk', 'حيّ ${randomUUID().slice(0, 4)}')`),
        ),
      ).toBe("23514");
      expect(await errorCode(() => tx.q(`update public.design_templates set retired_at = null where id = $1`, [w.attendance.template_id]))).toBe("23514");
    });
  });
});

describe("★★ design_documents_guard still sees a retired platform version — the locked regions hold", () => {
  it("a document pinned to a retired platform certificate cannot have its QR moved", async () => {
    await withTx(async (tx) => {
      const w = await removed(tx);
      await tx.asOwner();
      // A certificate document as the worker records it: the version's own document, bound to nothing (the guard reads
      // the TEMPLATE VERSION, which is what matters here).
      const [{ id: doc }] = await tx.q<{ id: string }>(
        `insert into public.design_documents (org_id, template_version_id, purpose, document)
         values ($1, $2, 'certificate', (select document from public.design_template_versions where id = $2)) returning id`,
        [w.f.a.id, w.attendance.version_id],
      );
      await tx.as(w.f.a.admin.claims);
      const moved = await errorMessage(() =>
        tx.q(
          `update public.design_documents
              set document = jsonb_set(document, '{layers}', (
                select jsonb_agg(case when l->>'id' = 'l_qr' then jsonb_set(l, '{frame,x}', to_jsonb(((l #>> '{frame,x}')::int) + 40)) else l end)
                  from jsonb_array_elements(document->'layers') l))
            where id = $1`,
          [doc],
        ),
      );
      expect(moved).toMatch(/locked_layer_moved: l_qr/);
    });
  });
});

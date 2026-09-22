// A member reads the poster of a session they can see — 03 §193 («read own
// session's poster»), REQ-UIX-026, DEC-172 (wave 12, found by the lead's D1).
//
// ★ `exports_read` (0055) admits an artifact only when its design document is
// visible to the caller, and `documents_read` shows a session-bound document to
// an admin or that session's presenter alone. So an ordinary member read ZERO
// poster renders: every timeline card and every event page showed the
// typographic placeholder, while an anonymous visitor to `/s/[id]` saw the
// poster through 0080's public-card path. 0145 adds one permissive policy: a
// render of a document that IS a session's poster, where that session is one
// the caller may read under `sessions_read` — so a draft's poster stays hidden.
import { afterAll, describe, expect, it } from "vitest";
import { pool, withTx, type Tx } from "./db";
import { seed } from "./fixture";

afterAll(() => pool.end());

async function posterFor(tx: Tx, orgId: string, sessionId: string | null, preset = "master"): Promise<string> {
  const [doc] = await tx.q<{ id: string }>(
    `insert into public.design_documents (org_id, purpose, document, bound_session_id, updated_by)
     values ($1, 'poster', '{"schemaVersion":1,"layers":[]}'::jsonb, $2, null) returning id`,
    [orgId, sessionId],
  );
  if (sessionId) {
    await tx.q(`delete from public.session_posters where session_id = $1`, [sessionId]);
    await tx.q(`insert into public.session_posters (org_id, session_id, document_id) values ($1, $2, $3)`, [orgId, sessionId, doc.id]);
  }
  await tx.q(
    `insert into public.export_artifacts (org_id, document_id, preset, format, width_px, height_px, storage_path, byte_size, status, source_fingerprint, rendered_at)
     values ($1, $2, $3, 'png', 1080, 1350, $4, 10, 'ready', $5, now())`,
    [orgId, doc.id, preset, `${orgId}/exports/${doc.id}/master.png`, `fp-${doc.id}`],
  );
  return doc.id;
}

const visible = (tx: Tx, documentId: string) =>
  tx.q<{ n: number }>(`select count(*)::int as n from public.export_artifacts where document_id = $1`, [documentId]).then((r) => r[0].n);

async function setup(tx: Tx) {
  const f = await seed(tx);
  await tx.asOwner();
  // fixture-m6 seeds M6 rows on both orgs; these cases count renders, so they
  // start from an empty M6 world, as designer-posters.test.ts does.
  for (const t of ["certificates", "export_artifacts", "session_posters", "design_documents"]) await tx.q(`delete from public.${t}`);
  return f;
}

describe("POL-export_artifacts.select.session_poster", () => {
  it("★ a plain member — not an admin, not a presenter — reads the render of a published session's poster", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      const doc = await posterFor(tx, f.a.id, f.m2.a.published);
      await tx.as(f.a.members[1].claims);
      expect(await visible(tx, doc)).toBe(1);
      // The document itself stays admin/presenter-only: only its render is read.
      const docs = await tx.q<{ n: number }>(`select count(*)::int as n from public.design_documents where id = $1`, [doc]);
      expect(docs[0].n).toBe(0);
    });
  });

  it("a draft session's poster stays hidden from a member (sessions_read hides the draft)", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      const doc = await posterFor(tx, f.a.id, f.m2.a.draft);
      await tx.as(f.a.members[1].claims);
      expect(await visible(tx, doc)).toBe(0);
    });
  });

  it("another org — even its admin — reads nothing", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      const doc = await posterFor(tx, f.a.id, f.m2.a.published);
      await tx.as(f.b.admin.claims);
      expect(await visible(tx, doc)).toBe(0);
    });
  });

  it("a render of a document that is no session's poster (a template) stays admin-only", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      const doc = await posterFor(tx, f.a.id, null);
      await tx.as(f.a.members[1].claims);
      expect(await visible(tx, doc)).toBe(0);
      await tx.as(f.a.admin.claims);
      expect(await visible(tx, doc)).toBe(1);
    });
  });
});

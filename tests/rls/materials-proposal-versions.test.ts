// content, wave 10 (DEC-155, DEC-160 §6) — T1: a proposal's own material. New behaviour, new file
// (rule 3) — materials-schema.test.ts (which already proves `materials_read`'s own proposal branch,
// since 0053) is not touched. Applied with applyProposed() inside each test's rolled-back
// transaction (DEC-040) — nothing here touches the shared local database.
//
// f.m2.a.proposal (fixture-m2.ts) is a draft proposal by members[0] (the proposer) naming members[1]
// as a co-presenter NOT yet accepted — org A has exactly two `members`, so this fixture (matching
// materials-schema.test.ts's own "POL-materials.proposal.visibility" precedent) is reused for both
// the "unrelated" and the "not-yet-accepted" case rather than inventing a third member fixture.
import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { applyProposed, pool, withTx, type Tx } from "./db";
import { seed } from "./fixture";

afterAll(() => pool.end());

async function apply(tx: Tx) {
  await applyProposed(tx, "content/0001_proposal_material_versions.sql");
}

// The storage path's own version-id segment MUST match the real `material_versions.id` —
// `materials_storage_read`/`material_pages_storage_read` join on it (`(storage.foldername(name))
// [5]`) — so the id is minted first, exactly like `tests/e2e/materials.spec.ts`'s own fixture does.
async function seedProposalMaterialWithVersion(tx: Tx, orgId: string, proposalId: string, addedBy: string) {
  await tx.asOwner();
  const [material] = await tx.q<{ id: string }>(
    `insert into public.materials (org_id, proposal_id, kind, title, added_by) values ($1, $2, 'pdf', 'مادة المقترح', $3) returning id`,
    [orgId, proposalId, addedBy],
  );
  const versionId = randomUUID();
  const storagePath = `${orgId}/proposals/${proposalId}/materials/${versionId}/deck.pdf`;
  await tx.q(
    `insert into public.material_versions (id, org_id, material_id, version, storage_path, byte_size, sniffed_mime, sha256, uploaded_by)
     values ($1, $2, $3, 1, $4, 1000, 'application/pdf', $5, $6)`,
    [versionId, orgId, material.id, storagePath, "a".repeat(64), addedBy],
  );
  await tx.q(`update public.materials set current_version_id = $1 where id = $2`, [versionId, material.id]);
  return { materialId: material.id as string, versionId, storagePath };
}

describe("POL-material_versions.proposal", () => {
  it("★ REQ-PRO-004: the proposer, an accepted co-presenter, and staff (admin AND moderator) read a proposal material's version; a not-yet-accepted co-presenter and another org's admin do not", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await tx.asOwner();
      await apply(tx);
      const { versionId } = await seedProposalMaterialWithVersion(tx, f.a.id, f.m2.a.proposal, f.a.members[0].memberId);

      await tx.as(f.a.members[0].claims); // the proposer
      expect((await tx.q(`select id from public.material_versions where id = $1`, [versionId])).length).toBe(1);

      await tx.as(f.a.members[1].claims); // co-presenter, not yet accepted — still "a member" for this purpose
      expect(await tx.q(`select id from public.material_versions where id = $1`, [versionId])).toEqual([]);

      await tx.asOwner();
      await tx.q(`update public.proposal_presenters set accepted = true where proposal_id = $1 and member_id = $2`, [f.m2.a.proposal, f.a.members[1].memberId]);
      await tx.as(f.a.members[1].claims); // now an accepted co-presenter
      expect((await tx.q(`select id from public.material_versions where id = $1`, [versionId])).length).toBe(1);

      await tx.as(f.a.mod.claims); // staff — moderator, unrelated to the proposal
      expect((await tx.q(`select id from public.material_versions where id = $1`, [versionId])).length).toBe(1);

      await tx.as(f.a.admin.claims); // staff — admin, unrelated to the proposal
      expect((await tx.q(`select id from public.material_versions where id = $1`, [versionId])).length).toBe(1);

      await tx.as(f.b.admin.claims); // a different org entirely
      expect(await tx.q(`select id from public.material_versions where id = $1`, [versionId])).toEqual([]);
    });
  });

  it("★ a session's own material's version is unaffected — the LEFT JOIN only widens which rows survive it, never which session-scoped row satisfies the WHERE", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await tx.asOwner();
      await apply(tx);
      // f.m2.a.completed is a completed session — its 'after'-phase material should already be
      // visible to a plain attendee, exactly as materials-schema.test.ts's own suite proves.
      const [material] = await tx.q<{ id: string }>(
        `insert into public.materials (org_id, session_id, kind, title, phase, added_by) values ($1, $2, 'pdf', 'شرائح', 'after', $3) returning id`,
        [f.a.id, f.m2.a.completed, f.a.members[0].memberId],
      );
      const [version] = await tx.q<{ id: string }>(
        `insert into public.material_versions (org_id, material_id, version, storage_path, byte_size, sniffed_mime, sha256, uploaded_by)
         values ($1, $2, 1, 'x/y/z.pdf', 1000, 'application/pdf', $3, $4) returning id`,
        [f.a.id, material.id, "b".repeat(64), f.a.members[0].memberId],
      );

      await tx.as(f.a.members[1].claims); // a plain attendee, no relation to any proposal
      expect((await tx.q(`select id from public.material_versions where id = $1`, [version.id])).length).toBe(1);
    });
  });
});

// ── material_pages / the material-pages bucket — the branch's SHAPE, not its reachability ──────────
// finalize_material_upload() never enqueues rendering while session_id is null, and carry_over_
// proposal_materials() clears proposal_id in the same statement that sets session_id — so no real
// upload path can ever produce a material_pages row while proposal_id is still set. These two cases
// seed one anyway (a synthetic row, bypassing that real path on purpose) to prove the policy TEXT
// itself is consistent with material_versions_read's, not merely that the table is empty today.
describe("POL-material_pages.proposal — the branch is unreachable in practice, proven consistent anyway", () => {
  it("if a page row somehow existed on a proposal's material, it would read exactly like the version does — owner/accepted co-presenter/staff yes, a not-yet-accepted co-presenter no", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await tx.asOwner();
      await apply(tx);
      const { versionId, storagePath } = await seedProposalMaterialWithVersion(tx, f.a.id, f.m2.a.proposal, f.a.members[0].memberId);
      const [page] = await tx.q<{ id: string }>(
        `insert into public.material_pages (org_id, material_version_id, page_number, image_path, thumbnail_path, width, height)
         values ($1, $2, 1, 'p1.webp', 't1.webp', 100, 100) returning id`,
        [f.a.id, versionId],
      );
      const pagesPath = storagePath.replace("/materials/", "/pages/");
      await tx.q(`insert into storage.objects (bucket_id, name) values ('material-pages', $1)`, [pagesPath]);

      await tx.as(f.a.members[1].claims); // not yet accepted
      expect(await tx.q(`select id from public.material_pages where id = $1`, [page.id])).toEqual([]);
      expect(await tx.q(`select id from storage.objects where bucket_id = 'material-pages' and name = $1`, [pagesPath])).toEqual([]);

      await tx.as(f.a.members[0].claims); // the proposer
      expect((await tx.q(`select id from public.material_pages where id = $1`, [page.id])).length).toBe(1);
      expect((await tx.q(`select id from storage.objects where bucket_id = 'material-pages' and name = $1`, [pagesPath])).length).toBe(1);

      await tx.as(f.a.mod.claims); // staff
      expect((await tx.q(`select id from public.material_pages where id = $1`, [page.id])).length).toBe(1);
      expect((await tx.q(`select id from storage.objects where bucket_id = 'material-pages' and name = $1`, [pagesPath])).length).toBe(1);
    });
  });
});

// ── the whole download path, end to end at the RLS layer ───────────────────────────────────────────
// materials_storage_read (0053, unchanged by this file) already admits the proposal's owner and
// staff to the SOURCE FILE; this proves the two policies TOGETHER let getMaterialDownloadUrl()'s own
// two-step read (material_versions, then storage.objects) succeed for exactly that same audience —
// not just that each policy is correct in isolation.
describe("the proposal download path — material_versions_read + materials_storage_read together", () => {
  it("the proposer and staff can read both the version row and the source object; another org's admin can read neither", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await tx.asOwner();
      await apply(tx);
      const { versionId, storagePath } = await seedProposalMaterialWithVersion(tx, f.a.id, f.m2.a.proposal, f.a.members[0].memberId);
      await tx.q(`insert into storage.objects (bucket_id, name) values ('materials', $1)`, [storagePath]);

      for (const claims of [f.a.members[0].claims, f.a.admin.claims, f.a.mod.claims]) {
        await tx.as(claims);
        expect((await tx.q(`select storage_path from public.material_versions where id = $1`, [versionId])).length).toBe(1);
        expect((await tx.q(`select id from storage.objects where bucket_id = 'materials' and name = $1`, [storagePath])).length).toBe(1);
      }

      await tx.as(f.b.admin.claims);
      expect(await tx.q(`select storage_path from public.material_versions where id = $1`, [versionId])).toEqual([]);
      expect(await tx.q(`select id from storage.objects where bucket_id = 'materials' and name = $1`, [storagePath])).toEqual([]);
    });
  });
});

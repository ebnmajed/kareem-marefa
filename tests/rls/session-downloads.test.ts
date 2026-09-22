// Contract 3 of wave 13 — every download of a rendered artifact is audited and
// refused to anyone who may not take it (REQ-DSG-027, REQ-ADM-021, DEC-176,
// DEC-177, DEC-178). 0152's `record_export_download()`.
//
// ★ The refusal is the FUNCTION's, not Storage's: a poster's render is readable
// by every member of the org since DEC-173 (0145), by design. What a plain
// member may not do is take the audited download — the menu never renders for
// them, and a forged request is refused here.
import { afterAll, describe, expect, it } from "vitest";
import { errorCode, pool, withTx, type Tx } from "./db";
import { seed } from "./fixture";

afterAll(() => pool.end());

type F = Awaited<ReturnType<typeof seed>>;
type Claims = F["a"]["admin"]["claims"];

const download = (tx: Tx, artifact: string) =>
  tx.q<{ storage_path: string; file_name: string }>(`select * from public.record_export_download($1)`, [artifact]);

const audits = (tx: Tx, artifact: string) =>
  tx
    .q<{ n: number }>(
      `select count(*)::int as n from public.audit_log
        where action = 'export_artifact.downloaded' and subject_id = $1 and occurred_at >= now()`,
      [artifact],
    )
    .then((r) => r[0].n);

/** Refused with 42501 (`tx.q` rolls a failed statement back to its own savepoint). */
async function refused(tx: Tx, claims: Claims, artifact: string): Promise<void> {
  await tx.as(claims);
  expect(await errorCode(() => download(tx, artifact))).toBe("42501");
}

async function admitted(tx: Tx, claims: Claims, artifact: string): Promise<{ storage_path: string; file_name: string }> {
  await tx.as(claims);
  const rows = await download(tx, artifact);
  expect(rows).toHaveLength(1);
  return rows[0];
}

/** The fixture's session poster (m2.published), with its presenter rows cleared
 *  so each case names exactly who presents. */
async function poster(tx: Tx, f: F) {
  await tx.asOwner();
  const session = f.m2.a.published;
  await tx.q(`delete from public.session_presenters where session_id = $1`, [session]);
  return { session, artifact: f.m6.a.artifactId };
}

async function presenter(tx: Tx, f: F, session: string, memberId: string, accepted: boolean) {
  await tx.asOwner();
  await tx.q(
    `insert into public.session_presenters (org_id, session_id, member_id, accepted) values ($1, $2, $3, $4)`,
    [f.a.id, session, memberId, accepted],
  );
}

/** A render of the fixture's certificate (members[0], issued), in the given state. */
async function certificate(tx: Tx, f: F, state: "held" | "issued" | "revoked" = "issued") {
  await tx.asOwner();
  const cert = f.m6.a.certificateId;
  if (state === "held") await tx.q(`update public.certificates set state = 'held', issued_at = null where id = $1`, [cert]);
  if (state === "revoked")
    await tx.q(`update public.certificates set state = 'revoked', revoked_at = now(), revocation_reason = 'اختبار' where id = $1`, [cert]);
  const [doc] = await tx.q<{ id: string }>(
    `insert into public.design_documents (org_id, purpose, document, bound_certificate_id, updated_by)
     values ($1, 'certificate', '{"schemaVersion":1,"layers":[]}'::jsonb, $2, null) returning id`,
    [f.a.id, cert],
  );
  const [art] = await tx.q<{ id: string }>(
    `insert into public.export_artifacts (org_id, document_id, preset, format, width_px, height_px, storage_path, byte_size, status, source_fingerprint, rendered_at)
     values ($1, $2, 'cert_landscape', 'pdf', 3508, 2480, $3, 10, 'ready', $4, now()) returning id`,
    [f.a.id, doc.id, `${f.a.id}/exports/${doc.id}/cert_landscape.pdf`, `fp-${doc.id}`],
  );
  return { artifact: art.id, owner: f.a.members[0], serial: f.m6.a.serial };
}

describe("RPC-record_export_download.poster", () => {
  it("admin ✓, moderator ✓, an accepted presenter ✓ — each with one audit row naming the session", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      const { session, artifact } = await poster(tx, f);
      await presenter(tx, f, session, f.a.members[1].memberId, true);
      for (const who of [f.a.admin.claims, f.a.mod.claims, f.a.members[1].claims]) {
        const got = await admitted(tx, who, artifact);
        expect(got.storage_path).toBe(`${f.a.id}/exports/${f.m6.a.documentId}/master.png`);
        expect(got.file_name).toBe("poster-master.png");
      }
      await tx.asOwner();
      expect(await audits(tx, artifact)).toBe(3);
      const [row] = await tx.q<{ after: { subject: string; session_id: string; format: string } }>(
        `select after from public.audit_log where action = 'export_artifact.downloaded' and subject_id = $1 limit 1`,
        [artifact],
      );
      expect(row.after).toMatchObject({ subject: "session_poster", session_id: session, format: "png" });
    });
  });

  it("★ a plain member ✗ — though 0145 lets them read the render — a presenter not accepted ✗, another org's admin ✗; no audit row", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      const { session, artifact } = await poster(tx, f);
      await presenter(tx, f, session, f.a.members[0].memberId, false);
      await refused(tx, f.a.members[1].claims, artifact);
      await refused(tx, f.a.members[0].claims, artifact);
      await refused(tx, f.b.admin.claims, artifact);
      await tx.asOwner();
      expect(await audits(tx, artifact)).toBe(0);
    });
  });
});

describe("RPC-record_export_download.certificate", () => {
  it("its own member ✓ (issued), admin ✓, moderator ✓ — the file named by its Western serial", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      const c = await certificate(tx, f);
      for (const who of [c.owner.claims, f.a.admin.claims, f.a.mod.claims]) {
        const got = await admitted(tx, who, c.artifact);
        expect(got.file_name).toBe(`certificate-${c.serial}.pdf`);
      }
      await tx.asOwner();
      expect(await audits(tx, c.artifact)).toBe(3);
    });
  });

  it("another member ✗ — the class DEC-177 closes", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      const c = await certificate(tx, f);
      await refused(tx, f.a.members[1].claims, c.artifact);
      await tx.asOwner();
      expect(await audits(tx, c.artifact)).toBe(0);
    });
  });

  it("its member while HELD ✗ (REQ-CRT-013); staff still ✓", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      const c = await certificate(tx, f, "held");
      await refused(tx, c.owner.claims, c.artifact);
      await admitted(tx, f.a.admin.claims, c.artifact);
    });
  });

  it("its member when REVOKED ✓ (REQ-CRT-011 — the document exists; /verify says what it no longer claims)", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      const c = await certificate(tx, f, "revoked");
      await admitted(tx, c.owner.claims, c.artifact);
    });
  });
});

describe("RPC-record_export_download.document", () => {
  it("a render of no session's poster and no certificate — admin ✓, moderator ✗, member ✗", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await tx.asOwner();
      const [doc] = await tx.q<{ id: string }>(
        `insert into public.design_documents (org_id, purpose, document, updated_by)
         values ($1, 'poster', '{"schemaVersion":1,"layers":[]}'::jsonb, null) returning id`,
        [f.a.id],
      );
      const [art] = await tx.q<{ id: string }>(
        `insert into public.export_artifacts (org_id, document_id, preset, format, storage_path, byte_size, status, source_fingerprint, rendered_at)
         values ($1, $2, 'square', 'webp', $3, 10, 'ready', 'fp-free', now()) returning id`,
        [f.a.id, doc.id, `${f.a.id}/exports/${doc.id}/square.webp`],
      );
      expect((await admitted(tx, f.a.admin.claims, art.id)).file_name).toBe("design-square.webp");
      await refused(tx, f.a.mod.claims, art.id);
      await refused(tx, f.a.members[1].claims, art.id);
    });
  });
});

describe("RPC-record_export_download.refusals", () => {
  it("an unknown id and a not-ready artifact answer the same 42501 — no existence oracle", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      const { artifact } = await poster(tx, f);
      await refused(tx, f.a.admin.claims, "00000000-0000-4000-8000-000000000000");
      await tx.asOwner();
      await tx.q(`update public.export_artifacts set status = 'queued', storage_path = null where id = $1`, [artifact]);
      await refused(tx, f.a.admin.claims, artifact);
    });
  });

  it("anon cannot execute it; authenticated can", async () => {
    await withTx(async (tx) => {
      await tx.asOwner();
      const [row] = await tx.q<{ anon: boolean; auth: boolean }>(
        `select has_function_privilege('anon', 'public.record_export_download(uuid)', 'execute') as anon,
                has_function_privilege('authenticated', 'public.record_export_download(uuid)', 'execute') as auth`,
      );
      expect(row).toEqual({ anon: false, auth: true });
    });
  });
});

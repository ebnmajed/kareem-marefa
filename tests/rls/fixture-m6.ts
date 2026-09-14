// M6 rows on both orgs (migration 0055), so the isolation sweep is never
// vacuous for a designer or certificate table. Built as the owner inside the
// caller's transaction, after the M2–M5 rows. members[0] is the fixture's
// presenter of every session, so the document bound to the published session
// (and its artifact) is visible to it, and the presenter certificate on the
// completed session is its own.
//
// Once (not per org): one platform poster template with a published version,
// and one platform font row — `fonts` carries no org_id by decision (DEC-049,
// 02 §7's fifth exception). Per org: one org certificate template with a
// published version, one design asset, one poster document bound to the
// published session with its session_posters row and one ready export
// artifact, one issued presenter certificate for members[0] on the completed
// session, and the serial counter row that issuance would have left behind.
// Inserted directly as the owner because a fixture arranges history; the
// serial allocator, the guards and the read policies are proven by
// tests/rls/designer-schema.test.ts.

import type { Tx } from "./db";
import type { M5Fixture } from "./fixture-m5";
import type { M2Org } from "./fixture-m2";
import type { Org } from "./fixture";

export interface M6Org {
  certTemplateId: string;
  certTemplateVersionId: string;
  assetId: string;
  documentId: string;
  posterId: string;
  artifactId: string;
  certificateId: string;
  serial: string;
}

export interface M6Fixture extends M5Fixture {
  m6: { a: M6Org; b: M6Org; platformTemplateId: string; platformTemplateVersionId: string; fontId: string };
}

const SHA_ASSET = "a1b2c3d4e5f60718".repeat(4);
const SHA_FONT = "4ed189e8653e9303ec1e1448a6025f838ecd19fe4a5f4f7889b8394b3c5378fb";
const EMPTY_DOC = JSON.stringify({ schemaVersion: 1, layers: [] });

async function platformRows(tx: Tx) {
  const one = async (sql: string, params: unknown[]) => (await tx.q<{ id: string }>(sql, params))[0].id;
  const platformTemplateId = await one(
    `insert into public.design_templates (org_id, scope, purpose, family, name, is_default)
     values (null, 'platform', 'poster', 'talk', 'ملصق المحاضرة', true) returning id`,
    [],
  );
  const platformTemplateVersionId = await one(
    `insert into public.design_template_versions (org_id, template_id, version, document, published_at)
     values (null, $1, 1, $2::jsonb, now()) returning id`,
    [platformTemplateId, EMPTY_DOC],
  );
  const fontId = await one(
    `insert into public.fonts (family, style, weight, source, storage_path, sha256, subsets, parity_status)
     values ('IBM Plex Sans Arabic', 'normal', 400, 'platform', $1, $2, '{arabic,latin}', 'passed') returning id`,
    [`${SHA_FONT}.woff2`, SHA_FONT],
  );
  return { platformTemplateId, platformTemplateVersionId, fontId };
}

async function orgRows(tx: Tx, o: Org, m2: M2Org, year: number): Promise<M6Org> {
  const presenter = o.members[0];
  const q = <T = Record<string, unknown>>(sql: string, params?: unknown[]) => tx.q<T>(sql, params);
  const one = async (sql: string, params: unknown[]) => (await q<{ id: string }>(sql, params))[0].id;

  const certTemplateId = await one(
    `insert into public.design_templates (org_id, scope, purpose, family, name, is_default, created_by)
     values ($1, 'org', 'certificate', 'presenter', 'شهادة المقدّم', true, $2) returning id`,
    [o.id, o.admin.memberId],
  );
  const certTemplateVersionId = await one(
    `insert into public.design_template_versions (org_id, template_id, version, document, published_at, published_by)
     values ($1, $2, 1, $3::jsonb, now(), $4) returning id`,
    [o.id, certTemplateId, EMPTY_DOC, o.admin.memberId],
  );
  const assetId = await one(
    `insert into public.design_assets (org_id, storage_path, sniffed_mime, width, height, byte_size, sha256, uploaded_by)
     values ($1, $2, 'image/png', 2000, 2000, 4096, $3, $4) returning id`,
    [o.id, `${o.id}/design/assets/${SHA_ASSET.slice(0, 8)}.png`, SHA_ASSET, o.admin.memberId],
  );
  const documentId = await one(
    `insert into public.design_documents (org_id, purpose, document, bound_session_id, updated_by)
     values ($1, 'poster', $2::jsonb, $3, $4) returning id`,
    [o.id, EMPTY_DOC, m2.published, o.admin.memberId],
  );
  const posterId = await one(
    `insert into public.session_posters (org_id, session_id, document_id)
     values ($1, $2, $3) returning id`,
    [o.id, m2.published, documentId],
  );
  const artifactId = await one(
    `insert into public.export_artifacts (org_id, document_id, preset, format, width_px, height_px, storage_path, byte_size, status, source_fingerprint, rendered_at)
     values ($1, $2, 'master', 'png', 1200, 1600, $3, 8192, 'ready', $4, now()) returning id`,
    [o.id, documentId, `${o.id}/exports/${documentId}/master.png`, `fp-${documentId}`],
  );
  const [{ certificate_prefix }] = await q<{ certificate_prefix: string }>(`select certificate_prefix from public.orgs where id = $1`, [o.id]);
  const serial = `${certificate_prefix}-${year}-000001`;
  const certificateId = await one(
    `insert into public.certificates (org_id, member_id, kind, session_id, serial, verification_code, state, template_version_id, recipient_name_snapshot, issued_at)
     values ($1, $2, 'presenter', $3, $4, $5, 'issued', $6, $7, now()) returning id`,
    [o.id, presenter.memberId, m2.completed, serial, `fx${o.id.replace(/-/g, "").slice(0, 22)}`, certTemplateVersionId, "المقدّم"],
  );
  await q(`insert into public.certificate_serial_counters (org_id, year, next_value) values ($1, $2, 2)`, [o.id, year]);

  return { certTemplateId, certTemplateVersionId, assetId, documentId, posterId, artifactId, certificateId, serial };
}

export async function seedM6(tx: Tx, f: M5Fixture): Promise<M6Fixture> {
  const year = new Date().getUTCFullYear();
  const platform = await platformRows(tx);
  const a = await orgRows(tx, f.a, f.m2.a, year);
  const b = await orgRows(tx, f.b, f.m2.b, year);
  return { ...f, m6: { a, b, ...platform } };
}

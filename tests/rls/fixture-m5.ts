// M5 rows on both orgs (migration 0037), so the isolation sweep is never
// vacuous for a content table. Built as the owner inside the caller's
// transaction, after the M2–M4 rows. members[0] is the fixture's presenter
// of every session, so the presenter-scoped tables are visible to it.
//
// Per org, on the published session: one `before`-phase PDF material added
// by members[0] with one version and one rendered page; one read-material
// task with members[0]'s completion and a form task with members[0]'s
// response; one visible photo by members[1] with a takedown requested by
// members[0]; one tag on the session; members[0]'s bookmark. Inserted
// directly as the owner because a fixture arranges history; the upload
// path, the gates and the takedown are proven by the content track's tests.

import type { Tx } from "./db";
import type { M4Fixture } from "./fixture-m4";
import type { M2Org } from "./fixture-m2";
import type { Org } from "./fixture";

export interface M5Org {
  materialId: string;
  versionId: string;
  pageId: string;
  readTaskId: string;
  formTaskId: string;
  completionId: string;
  responseId: string;
  photoId: string;
  takedownId: string;
  tagId: string;
}

export interface M5Fixture extends M4Fixture {
  m5: { a: M5Org; b: M5Org };
}

const SHA = "0123456789abcdef".repeat(4);

async function orgRows(tx: Tx, o: Org, m2: M2Org): Promise<M5Org> {
  const presenter = o.members[0];
  const attendee = o.members[1] ?? o.members[0];
  const q = <T = Record<string, unknown>>(sql: string, params?: unknown[]) => tx.q<T>(sql, params);
  const one = async (sql: string, params: unknown[]) => (await q<{ id: string }>(sql, params))[0].id;

  const materialId = await one(
    `insert into public.materials (org_id, session_id, kind, title, phase, allow_download, render_status, added_by)
     values ($1, $2, 'pdf', 'ملف الجلسة', 'before', true, 'ready', $3) returning id`,
    [o.id, m2.published, presenter.memberId],
  );
  const versionId = await one(
    `insert into public.material_versions (org_id, material_id, version, storage_path, byte_size, sniffed_mime, sha256, uploaded_by)
     values ($1, $2, 1, $3, 1024, 'application/pdf', $4, $5) returning id`,
    [o.id, materialId, `${o.id}/sessions/${m2.published}/materials/${materialId}/v1.pdf`, SHA, presenter.memberId],
  );
  await q(`update public.materials set current_version_id = $2 where id = $1`, [materialId, versionId]);
  const pageId = await one(
    `insert into public.material_pages (org_id, material_version_id, page_number, image_path, thumbnail_path, width, height)
     values ($1, $2, 1, $3, $4, 1600, 900) returning id`,
    [o.id, versionId, `${o.id}/${versionId}/1.webp`, `${o.id}/${versionId}/1.thumb.webp`],
  );

  const readTaskId = await one(
    `insert into public.session_tasks (org_id, session_id, kind, title, material_id, sort_order)
     values ($1, $2, 'read_material', 'اقرأ الملف قبل الجلسة', $3, 1) returning id`,
    [o.id, m2.published, materialId],
  );
  const formTaskId = await one(
    `insert into public.session_tasks (org_id, session_id, kind, title, form_schema, sort_order)
     values ($1, $2, 'form', 'استبيان قصير', '{"fields":[{"name":"q1","type":"text"}]}'::jsonb, 2) returning id`,
    [o.id, m2.published],
  );
  const completionId = await one(
    `insert into public.task_completions (org_id, task_id, member_id) values ($1, $2, $3) returning id`,
    [o.id, readTaskId, presenter.memberId],
  );
  const responseId = await one(
    `insert into public.task_form_responses (org_id, task_id, member_id, response) values ($1, $2, $3, '{"q1":"نعم"}'::jsonb) returning id`,
    [o.id, formTaskId, presenter.memberId],
  );

  const photoId = await one(
    `insert into public.photos (org_id, session_id, uploader_id, storage_path, width, height, byte_size, sha256, exif_stripped)
     values ($1, $2, $3, $4, 1200, 800, 2048, $5, true) returning id`,
    [o.id, m2.published, attendee.memberId, `${o.id}/sessions/${m2.published}/photos/placeholder.jpg`, SHA],
  );
  // A takedown hides the photo (0037's trigger); the sweep's photos case
  // needs a VISIBLE photo for members[0], so the request is resolved as
  // restored right away — the row stays, the photo is visible again.
  const takedownId = await one(
    `insert into public.photo_takedowns (org_id, photo_id, requester_id) values ($1, $2, $3) returning id`,
    [o.id, photoId, presenter.memberId],
  );
  await q(`update public.photo_takedowns set resolved_at = now(), resolution = 'restored', resolved_by = $2 where id = $1`, [takedownId, o.admin.memberId]);
  await q(`update public.photos set hidden_at = null, hidden_reason = null where id = $1`, [photoId]);

  const tagId = await one(
    `insert into public.tags (org_id, label, normalised) values ($1, 'وسم التجهيزة', public.ar_normalize('وسم التجهيزة')) returning id`,
    [o.id],
  );
  // On the COMPLETED session: content's own cases count the published session's tags.
  await q(`insert into public.session_tags (org_id, session_id, tag_id) values ($1, $2, $3)`, [o.id, m2.completed, tagId]);
  await q(`insert into public.bookmarks (org_id, member_id, session_id) values ($1, $2, $3)`, [o.id, presenter.memberId, m2.published]);

  return { materialId, versionId, pageId, readTaskId, formTaskId, completionId, responseId, photoId, takedownId, tagId };
}

/** Adds the M5 rows to an M4 fixture. Call as the owner; returns to the owner. */
export async function seedM5(tx: Tx, f: M4Fixture): Promise<M5Fixture> {
  await tx.asOwner();
  const a = await orgRows(tx, f.a, f.m2.a);
  const b = await orgRows(tx, f.b, f.m2.b);
  return { ...f, m5: { a, b } };
}

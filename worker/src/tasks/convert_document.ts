import type { Task } from "graphile-worker";
import { downloadObject } from "../content/storage.js";
import { fontsInstalled, inspectPdf, isPdf, stagePdf, substitutedFonts, withTempDir } from "../content/pdf.js";

// JOB-convert_document (11 §2.4, 07 §4, REQ-MAT-003, REQ-MAT-011, DEC-058).
// Enqueued by finalize_material_upload() (0046/0053/0077) for `pdf`
// materials — the only document kind since DEC-058 (uploads are PDF-only;
// PowerPoint and Keynote are refused at upload and by a CHECK on
// `materials.kind`). Key `conv:{version_id}` (11 §2.4).
//
// The name is the enqueue contract's, kept: nothing is converted any more.
// This job INSPECTS the PDF — page count, and the fonts it names but does
// not embed (REQ-MAT-011's substitution for a PDF) — with poppler in the
// worker image, and hands the count to record_material_conversion(), which
// enqueues render_pages itself through public.enqueue_job() (DEC-046: every
// enqueue goes through the one SQL door; this file never calls
// `helpers.addJob()`). DEC-032's credential-free converter is gone with the
// LibreOffice it existed to isolate.
interface Payload {
  version_id: string;
  material_id: string;
}

function isPayload(p: unknown): p is Payload {
  const v = p as Partial<Payload> | null;
  return !!v && typeof v.version_id === "string" && typeof v.material_id === "string";
}

export const convert_document: Task = async (payload, helpers) => {
  if (!isPayload(payload)) throw new Error(`convert_document: malformed payload ${JSON.stringify(payload)}`);

  const { rows } = await helpers.query<{ org_id: string; session_id: string; storage_path: string; kind: string }>(
    `select mv.org_id, m.session_id, mv.storage_path, m.kind
       from public.material_versions mv join public.materials m on m.id = mv.material_id
      where mv.id = $1`,
    [payload.version_id],
  );
  const row = rows[0];
  if (!row) {
    helpers.logger.warn(`convert_document: version ${payload.version_id} no longer exists — skipping`);
    return;
  }
  if (row.kind !== "pdf") {
    helpers.logger.warn(`convert_document: material ${payload.material_id} is kind ${row.kind} — this job is never enqueued for it (DEC-058)`);
    return;
  }

  try {
    const bytes = await downloadObject("materials", row.storage_path);
    if (!isPdf(bytes)) {
      // The Route Handler sniffed the upload (REQ-MAT-012); a non-PDF here
      // means the object changed under us. Recorded as failed, not retried.
      await helpers.query(`select public.record_material_conversion($1, '{}', null, true)`, [payload.version_id]);
      helpers.logger.error(`convert_document: ${payload.version_id} — the stored object is not a PDF; marked failed`);
      return;
    }

    const { pages, substituted } = await withTempDir("conv-", async (dir) => {
      const pdf = await stagePdf(dir, bytes);
      const info = await inspectPdf(pdf);
      return { pages: info.pages, substituted: substitutedFonts(info.fonts, await fontsInstalled()) };
    });

    // REQ-MAT-011: the substituted font goes ON THE MATERIAL, not only in
    // this log line — record_material_conversion() writes it and enqueues
    // render_pages in the same statement.
    await helpers.query(`select public.record_material_conversion($1, $2, $3, false)`, [payload.version_id, substituted, pages]);
    helpers.logger.info(`convert_document: ${payload.version_id} → ${pages} page(s), ${substituted.length} non-embedded font(s)`);
  } catch (e) {
    await helpers.query(`select public.record_material_conversion($1, '{}', null, true)`, [payload.version_id]);
    throw e; // graphile-worker retries per 11 §2.4 (3 × 60 s)
  }
};

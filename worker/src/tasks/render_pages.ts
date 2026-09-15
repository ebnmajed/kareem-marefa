import type { Task } from "graphile-worker";
import { downloadObject, uploadObject } from "../content/storage.js";
import { materialPagePath, materialPageThumbnailPath } from "@kareem/storage-paths";
import { inspectPdf, isPdf, PAGE_LONG_EDGE, PAGE_QUALITY, renderPdfPage, stagePdf, THUMB_LONG_EDGE, THUMB_QUALITY, withTempDir } from "../content/pdf.js";

// JOB-render_pages (11 §2.4, 07 §4.5, DEC-058). Enqueued by
// record_material_conversion() (0048) once convert_document reports a page
// count. Key `pages:{version_id}`.
//
// Renders IN the worker image — pdftoppm then cwebp, 07 §4.5's sizes and
// qualities — and writes each page and thumbnail to `material-pages` with the
// service-role key the worker already holds, the way process_photo.ts does.
// The storage path to read is re-derived from the database rather than
// trusted from the job payload, the same reason convert_document re-reads
// `materials.kind` rather than trusting what finalize_material_upload() saw.
interface Payload {
  version_id: string;
  material_id: string;
  page_count: number;
}

function isPayload(p: unknown): p is Payload {
  const v = p as Partial<Payload> | null;
  return !!v && typeof v.version_id === "string" && typeof v.material_id === "string" && typeof v.page_count === "number" && v.page_count > 0;
}

export const render_pages: Task = async (payload, helpers) => {
  if (!isPayload(payload)) throw new Error(`render_pages: malformed payload ${JSON.stringify(payload)}`);

  const { rows } = await helpers.query<{ org_id: string; session_id: string; storage_path: string; kind: string }>(
    `select mv.org_id, m.session_id, mv.storage_path, m.kind
       from public.material_versions mv join public.materials m on m.id = mv.material_id
      where mv.id = $1`,
    [payload.version_id],
  );
  const row = rows[0];
  if (!row) {
    helpers.logger.warn(`render_pages: version ${payload.version_id} no longer exists — skipping`);
    return;
  }

  try {
    const bytes = await downloadObject("materials", row.storage_path);
    if (!isPdf(bytes)) {
      await helpers.query(`select public.record_material_conversion($1, '{}', null, true)`, [payload.version_id]);
      helpers.logger.error(`render_pages: ${payload.version_id} — the stored object is not a PDF; marked failed`);
      return;
    }

    const pageRows = await withTempDir("pages-", async (dir) => {
      const pdf = await stagePdf(dir, bytes);
      const info = await inspectPdf(pdf);
      // The count convert_document recorded is what the viewer will show;
      // a file that shrank between the two jobs is a file that changed.
      const total = Math.min(info.pages, payload.page_count);
      if (total !== payload.page_count) {
        helpers.logger.warn(`render_pages: ${payload.version_id} has ${info.pages} page(s), payload said ${payload.page_count}`);
      }

      const out: { page_number: number; image_path: string; thumbnail_path: string; width: number; height: number }[] = [];
      for (let n = 1; n <= total; n++) {
        const size = info.sizes[n - 1];
        const page = await renderPdfPage(pdf, dir, n, size, PAGE_LONG_EDGE, PAGE_QUALITY);
        const thumb = await renderPdfPage(pdf, dir, n, size, THUMB_LONG_EDGE, THUMB_QUALITY);
        const imagePath = materialPagePath(row.org_id, row.session_id, payload.version_id, n);
        const thumbnailPath = materialPageThumbnailPath(row.org_id, row.session_id, payload.version_id, n);
        await uploadObject("material-pages", imagePath, page.webp, "image/webp");
        await uploadObject("material-pages", thumbnailPath, thumb.webp, "image/webp");
        out.push({ page_number: n, image_path: imagePath, thumbnail_path: thumbnailPath, width: page.width, height: page.height });
      }
      return out;
    });

    await helpers.query(`select public.record_material_pages($1, $2::jsonb)`, [payload.version_id, JSON.stringify(pageRows)]);
    helpers.logger.info(`render_pages: ${payload.version_id} — ${pageRows.length} page(s) rendered`);
  } catch (e) {
    await helpers.query(`select public.record_material_conversion($1, '{}', null, true)`, [payload.version_id]);
    throw e;
  }
};

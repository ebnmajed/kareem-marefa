import type { Task } from "graphile-worker";
import { signReadUrl, signUploadUrl } from "../content/storage.js";
import { convertedPdfPath, materialPagePath, materialPageThumbnailPath } from "@kareem/storage-paths";

// JOB-render_pages (11 §2.4, 07 §4.5). Enqueued by
// record_material_conversion() (supabase/proposed/content/0004) once
// convert_document reports a page count. Key `pages:{version_id}`.
//
// Re-derives the PDF to render from — the source itself for a `pdf`
// material, `convert_document`'s output for a `powerpoint` one — from the
// database rather than trusting a path in the job payload, the same reason
// convert_document re-reads `materials.kind` rather than trusting what
// finalize_material_upload() saw.
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
  const converterUrl = process.env.CONVERTER_URL;
  if (!converterUrl) throw new Error("render_pages: CONVERTER_URL is not set");

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
    const pdfPath = row.kind === "powerpoint" ? convertedPdfPath(row.org_id, row.session_id, payload.version_id) : row.storage_path;
    const pdfReadUrl = await signReadUrl("materials", pdfPath);

    const pageNumbers = Array.from({ length: payload.page_count }, (_, i) => i + 1);
    const pages = await Promise.all(
      pageNumbers.map(async (n) => {
        const imagePath = materialPagePath(row.org_id, row.session_id, payload.version_id, n);
        const thumbnailPath = materialPageThumbnailPath(row.org_id, row.session_id, payload.version_id, n);
        const [url, thumbUrl] = await Promise.all([signUploadUrl("material-pages", imagePath), signUploadUrl("material-pages", thumbnailPath)]);
        return { n, url, thumbUrl, imagePath, thumbnailPath };
      }),
    );

    const res = await fetch(`${converterUrl}/pages`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ input: { url: pdfReadUrl }, output: { pages: pages.map(({ n, url, thumbUrl }) => ({ n, url, thumbUrl })) } }),
    });
    if (!res.ok) throw new Error(`converter /pages failed: ${res.status} ${await res.text()}`);
    const { rendered } = (await res.json()) as { rendered: number; total: number };
    if (rendered !== payload.page_count) {
      helpers.logger.warn(`render_pages: ${payload.version_id} rendered ${rendered}/${payload.page_count} page(s)`);
    }

    const pageRows = pages.map((p) => ({ page_number: p.n, image_path: p.imagePath, thumbnail_path: p.thumbnailPath }));
    await helpers.query(`select public.record_material_pages($1, $2::jsonb)`, [payload.version_id, JSON.stringify(pageRows)]);
    helpers.logger.info(`render_pages: ${payload.version_id} — ${rendered} page(s) rendered`);
  } catch (e) {
    await helpers.query(`select public.record_material_conversion($1, '{}', null, true)`, [payload.version_id]);
    throw e;
  }
};

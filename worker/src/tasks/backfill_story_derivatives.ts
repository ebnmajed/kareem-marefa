import type { Task } from "graphile-worker";
import { photoStoryPath } from "@kareem/storage-paths";
import { downloadObject, isNotFound, uploadObject } from "../content/storage.js";
import { sniffImageKind } from "../content/exif.js";
import { renderStoryDerivative } from "../content/story-derivative.js";

// JOB-backfill_story_derivatives (DEC-278, REQ-STO-012). Cron, hourly.
//
// A photograph uploaded before wave 26 has no `story` derivative, so its story frame and a recap's strip loaded the
// stripped original — production's were PNGs of up to 9 MB, and opening a story on a phone stalled on them. This makes
// the derivative for the photographs still without one, with the SAME `renderStoryDerivative()` `process_photo` uses,
// from the object already stored (it is the stripped original: `process_photo` overwrote the upload with it).
//
// The worker never writes a table directly (CLAUDE.md, data access rule 6): `story_derivatives_wanted()` and
// `mark_story_derivative_ready()` are SECURITY DEFINER and service_role-only. A photograph that fails is logged and left
// for the next run; one run never takes more than 20.
export const backfill_story_derivatives: Task = async (_payload, helpers) => {
  const { rows } = await helpers.query<{ photo_id: string; org_id: string; session_id: string; storage_path: string; width: number | null; height: number | null }>(
    `select * from public.story_derivatives_wanted(20)`,
  );
  let made = 0;
  for (const p of rows) {
    try {
      const bytes = await downloadObject("photos", p.storage_path);
      const kind = sniffImageKind(bytes);
      if (kind !== "jpeg" && kind !== "png" && kind !== "webp") continue;
      const story = await renderStoryDerivative(bytes, kind, p.width, p.height);
      if (!story) continue;
      await uploadObject("photos", photoStoryPath(p.org_id, p.session_id, p.photo_id), story, "image/webp");
      await helpers.query(`select public.mark_story_derivative_ready($1)`, [p.photo_id]);
      made++;
    } catch (e) {
      if (isNotFound(e)) continue;
      helpers.logger.warn(`backfill_story_derivatives: ${p.photo_id} — ${(e as Error).message}`);
    }
  }
  if (made > 0) helpers.logger.info(`backfill_story_derivatives: made ${made} of ${rows.length}`);
};

// A render's images, inlined — DEC-179.
//
// An image layer names a design asset by id (an uploaded poster's
// `image.assetId`, or the id `resolveBrand()` puts in `brand.logoAssetId`),
// and an id is not a URL: until wave 13 every such layer rendered as
// `<img src="<uuid>">`, broken, in every export. The worker downloads each
// asset's bytes with service_role (`content/storage.ts`) and hands the
// renderer `data:` URIs, so the render is hermetic — no signed URL to expire in
// a serial queue, and no network call from inside Chromium.
//
// ★ ONLY THIS ORG'S ASSETS. The lookup is scoped to the render's org: a
// document that names another org's asset id gets nothing for it and the
// render FAILS, loudly, rather than drawing a broken image or someone else's.
//
// ★ REFUSED, NEVER TRUNCATED. A data URI is part of the page; past the budget
// the render fails with the reason, and the admin replaces the file.

import type { JobHelpers } from "graphile-worker";
import type { DesignDocument } from "@kareem/designer-runtime";
import { assetIdsOf } from "@kareem/designer-runtime";
import { downloadObject } from "../content/storage.js";

/** The raw bytes all of one render's images may add up to. An uploaded poster
 *  is capped at 20 MB by default (`org_settings.limit_poster_mb`) and the logo
 *  is small; this leaves room for both and refuses anything that is not a
 *  poster's worth of image. */
export const MAX_INLINE_ASSET_BYTES = 32 * 1024 * 1024;

type Query = Pick<JobHelpers, "query">;

export class AssetRefusal extends Error {}

/** `data:` URIs for every asset the document's images resolve to, by id. */
export async function inlineAssets(helpers: Query, orgId: string, document: DesignDocument, bindings: Record<string, string>): Promise<Record<string, string>> {
  const ids = assetIdsOf(document, { values: bindings });
  if (ids.length === 0) return {};

  const { rows } = await helpers.query<{ id: string; storage_path: string; sniffed_mime: string; byte_size: number | string }>(
    `select id, storage_path, sniffed_mime, byte_size from public.design_assets where org_id = $1 and id = any($2::uuid[])`,
    [orgId, ids],
  );
  const missing = ids.filter((id) => !rows.some((r) => r.id === id));
  if (missing.length) throw new AssetRefusal(`image asset ${missing.join(", ")} is not a design asset of this org`);

  const total = rows.reduce((sum, r) => sum + Number(r.byte_size), 0);
  if (total > MAX_INLINE_ASSET_BYTES) {
    throw new AssetRefusal(`the images add up to ${total} bytes, over the ${MAX_INLINE_ASSET_BYTES}-byte render budget — replace the file with a smaller one`);
  }

  const out: Record<string, string> = {};
  for (const row of rows) {
    const bytes = await downloadObject("design-assets", row.storage_path);
    out[row.id] = `data:${row.sniffed_mime};base64,${Buffer.from(bytes).toString("base64")}`;
  }
  return out;
}

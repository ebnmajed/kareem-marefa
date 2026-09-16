// The org brand override, read at REQUEST time — 06 §8.3, DEC-052, REQ-DSG-021.
//
// The brand values are composed into the bindings BEFORE the fingerprint is
// taken (regenerate_poster, issue_certificates, and the editor's preview in
// src/lib/dal/designer.ts), and the worker later renders exactly those
// pinned bindings (0060: "never a fresh resolution", REQ-DSG-013,
// REQ-CRT-014). So a changed colour changes the fingerprint, which is what
// makes an artifact cache self-invalidating — and it is why the override is
// resolved HERE and not in render_variant.
//
// No row is the identity override: resolveBrand(null) === platformBrand().
import type { JobHelpers } from "graphile-worker";
import { resolveBrand, type BrandOverrides, type BrandScheme } from "@kareem/designer-runtime";

type Query = Pick<JobHelpers, "query">;

type Row = {
  logo_asset_id: string | null;
  light_canvas: string; light_surface: string; light_fg_heading: string; light_fg_body: string; light_fg_muted: string;
  light_edge: string; light_edge_strong: string; light_spine: string; light_node: string; light_canvas_raise: string;
  dark_canvas: string; dark_surface: string; dark_fg_heading: string; dark_fg_body: string; dark_fg_muted: string;
  dark_edge: string; dark_edge_strong: string; dark_spine: string; dark_node: string; dark_canvas_raise: string;
};

const COLUMNS =
  "logo_asset_id, light_canvas, light_surface, light_fg_heading, light_fg_body, light_fg_muted, light_edge, light_edge_strong, light_spine, light_node, light_canvas_raise, " +
  "dark_canvas, dark_surface, dark_fg_heading, dark_fg_body, dark_fg_muted, dark_edge, dark_edge_strong, dark_spine, dark_node, dark_canvas_raise";

function set(row: Row, prefix: "light" | "dark"): BrandOverrides["light"] {
  return {
    canvas: row[`${prefix}_canvas`],
    surface: row[`${prefix}_surface`],
    fgHeading: row[`${prefix}_fg_heading`],
    fgBody: row[`${prefix}_fg_body`],
    fgMuted: row[`${prefix}_fg_muted`],
    edge: row[`${prefix}_edge`],
    edgeStrong: row[`${prefix}_edge_strong`],
    spine: row[`${prefix}_spine`],
    node: row[`${prefix}_node`],
    canvasRaise: row[`${prefix}_canvas_raise`],
  };
}

/** The org's raw override, or null when it has never saved a kit. */
export async function loadBrandOverrides(helpers: Query, orgId: string): Promise<BrandOverrides | null> {
  const { rows } = await helpers.query<Row>(`select ${COLUMNS} from public.brand_kits where org_id = $1`, [orgId]);
  const row = rows[0];
  if (!row) return null;
  return { light: set(row, "light"), dark: set(row, "dark"), logoAssetId: row.logo_asset_id };
}

/** The `brand.*` bindings for a render request: the platform palette with
 *  the org's override applied. `scheme` is required, not defaulted (wave 8)
 *  — see `platformBrand()`'s own comment; the caller decides, always. */
export async function brandBindings(helpers: Query, orgId: string, scheme: BrandScheme): Promise<Record<string, string>> {
  return resolveBrand(await loadBrandOverrides(helpers, orgId), scheme);
}

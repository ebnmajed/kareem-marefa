import { NextResponse } from "next/server";
import { z } from "zod";
import { initiateAssetInput, initiateAssetUpload } from "@/lib/dal/posters";

// POST /api/admin/branding/logo — SCR-059, REQ-DSG-021, REQ-ADM-015.
//
// A Route Handler, never a Server Action: the browser PUTs the bytes
// directly to the signed Storage URL this returns, so the file never
// traverses this process and never approaches the 1 MB action cap
// (`CLAUDE.md` § "This is Next 16").
//
// The logo IS a `design_assets` row (06 §8.3, `02` §4.13's
// `brand_kits.logo_asset_id`) — the same shape `/api/designer/assets`
// already builds and sniffs (DEC-009: raster only, judged on content, never
// the filename). This wraps that DAL rather than a second copy of it; the
// only thing this file adds is the PPI-at-A3 readout SCR-059 shows after
// upload, in the complete step.

export const runtime = "nodejs";

export async function POST(request: Request) {
  const locale = request.headers.get("x-locale") ?? "ar";
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const parsed = initiateAssetInput.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "invalid_input", issues: z.treeifyError(parsed.error) }, { status: 400 });

  const result = await initiateAssetUpload(locale, parsed.data);
  if ("status" in result) {
    if (result.status === "file_too_large") return NextResponse.json(result, { status: 413 });
    return NextResponse.json(result, { status: 403 });
  }
  return NextResponse.json(result, { status: 201 });
}

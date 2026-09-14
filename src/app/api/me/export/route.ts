import { NextResponse } from "next/server";
import { getMyExportPayload } from "@/lib/dal/privacy";

// GET /api/me/export — the member's own data archive (REQ-PRF-006,
// REQ-NFR-013). A Route Handler, never a Server Action: this is a download,
// and a Server Action's 1 MB body cap is the wrong shape for one (CLAUDE.md
// § This is Next 16).
//
// ★ NO service_role, and no signed Storage URL. The archive is a `jsonb`
// column on the member's own request row, so the boundary is the member's own
// session plus `data_export_read_self` — the same policy that lets them see
// the request at all. Nothing here can hand out someone else's archive,
// because nothing here names a member: `my_data_export()` re-derives the owner
// from the session (CLAUDE.md § Validation).
//
// Authorisation and the not-found answer both live in the DAL, at the data,
// like `admin/exports/[type]/route.ts`'s precedent.

export const runtime = "nodejs";

function contentDisposition(): string {
  const arabic = encodeURIComponent("بياناتي.json").replace(/['()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
  return `attachment; filename="my-data.json"; filename*=UTF-8''${arabic}`;
}

export async function GET() {
  const archive = await getMyExportPayload("ar");
  // Nothing ready, nothing to explain: a member with no export and a member
  // asking for someone else's get the same answer.
  if (!archive) return new NextResponse("not_found", { status: 404 });

  return new NextResponse(JSON.stringify(archive.payload, null, 2), {
    status: 200,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": contentDisposition(),
      // Personal data: never a shared cache, never a disk cache.
      "cache-control": "no-store, private",
    },
  });
}

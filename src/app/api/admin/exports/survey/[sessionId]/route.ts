import { NextResponse } from "next/server";
import { exportSurveyCsv } from "@/lib/dal/admin-exports";

// GET /api/admin/exports/survey/[sessionId] — SCR-064's CSV (REQ-SUR-008,
// REQ-ADM-017; DEC-160 contract 6). A Route Handler, never a Server Action
// (CLAUDE.md): a download, not a mutation. Authorisation, the withhold and
// the audit write all live at the data — `exportSurveyCsv` refuses a
// non-admin, `survey_results()` has already withheld what the minimum hides,
// and `write_admin_export_audit()` asserts a fresh admin. A moderator, a
// member, another org's admin and a session with no survey all get the same
// 404, the answer `exports/attendance/[sessionId]` gives for the same reason.

export const runtime = "nodejs";

function contentDisposition(sessionId: string, title: string): string {
  const utf8 = encodeURIComponent(`استبانة-${title}.csv`).replace(/['()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
  return `attachment; filename="survey-${sessionId}.csv"; filename*=UTF-8''${utf8}`;
}

export async function GET(_request: Request, { params }: { params: Promise<{ sessionId: string }> }) {
  // [v16] params is async. Always await.
  const { sessionId } = await params;

  const result = await exportSurveyCsv("ar", sessionId);
  if (!result) return new NextResponse("not_found", { status: 404 });

  return new NextResponse(result.csv, {
    status: 200,
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": contentDisposition(sessionId, result.sessionTitle),
      "cache-control": "no-store",
    },
  });
}
